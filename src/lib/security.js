// Security helpers for the download proxy: CDN allowlist, SSRF guards,
// streaming with Range pass-through, a hard size cap, redirect validation and
// body timeouts.
//
// The proxy must never become an open relay:
//   * https only, no credentials, port must be empty or 443;
//   * loopback / private / link-local / CGNAT / IPv6 (incl. IPv4-mapped and
//     bracketed forms) hosts are blocked;
//   * the host must match the CDN allowlist;
//   * redirects are followed MANUALLY, every hop is re-validated and the
//     number of hops is capped;
//   * the body is capped by a real byte counter (not only by Content-Length);
//   * the body has an idle and a total timeout;
//   * only media MIME types are served inline, everything else is sandboxed
//     and forced to download.

const DEFAULT_ALLOWLIST = ["*.cdninstagram.com", "*.fbcdn.net", "*.instagram.com", "*.facebook.com"];

const MAX_REDIRECT_HOPS = 3;
const DEFAULT_MAX_BYTES = 80 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_IDLE_TIMEOUT_MS = 15_000;

/** MIME types that may be rendered inline by the browser. */
export const MEDIA_MIME_ALLOWLIST = new Set([
  "image/jpeg",
  "image/pjpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/heic",
  "image/heif",
  "image/avif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-m4v",
  "video/3gpp",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/aac",
  "audio/wav",
]);

/** MIME types that are never proxied at all (active content). */
export const DANGEROUS_MIME = new Set([
  "text/html",
  "application/xhtml+xml",
  "image/svg+xml",
  "text/javascript",
  "application/javascript",
  "text/xml",
  "application/xml",
  "application/xhtml",
]);

/**
 * Normalise allowlist entries: accepts an array or a comma separated string,
 * strips scheme / path / credentials / port and lowercases the result.
 */
export function normalizePatterns(input) {
  const raw = Array.isArray(input) ? input : String(input == null ? "" : input).split(/[,\s]+/);
  const out = [];
  for (const item of raw) {
    let p = String(item || "").trim().toLowerCase();
    if (!p) continue;
    p = p.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
    p = p.split("/")[0];
    p = p.split("@").pop() || "";
    p = p.replace(/:\d+$/, "");
    p = p.replace(/\.+$/, "");
    if (!p || p === "*") continue;
    if (!p.startsWith("*.") && !p.includes(".") && p !== "localhost") continue;
    out.push(p);
  }
  return [...new Set(out)];
}

export function parseAllowlist(env) {
  const raw = (env && env.CDN_ALLOWLIST) || DEFAULT_ALLOWLIST.join(",");
  return normalizePatterns(raw);
}

export function isAllowedHost(hostname, patterns) {
  const host = String(hostname || "")
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  if (!host) return false;
  for (const pattern of patterns) {
    if (pattern.startsWith("*.")) {
      const suffix = pattern.slice(1); // ".cdninstagram.com"
      if (host.endsWith(suffix) && host.length > suffix.length) return true;
    } else if (host === pattern) {
      return true;
    }
  }
  return false;
}

const PRIVATE_HOST_RE = /^(localhost|.*\.local|.*\.internal|.*\.localhost)$/i;

function isPrivateIPv4(host) {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 0) return true; // "this" network
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 0) return true; // IETF protocol assignments
  if (a === 192 && b === 168) return true; // private
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51) return true; // documentation
  if (a === 203 && b === 0) return true; // documentation
  if (a === 224) return true; // multicast
  if (a >= 240) return true; // reserved + broadcast
  return false;
}

function isPrivateIPv6(host) {
  // Strip the zone id and normalise.
  const h = host.split("%")[0].toLowerCase();
  if (!h.includes(":")) return false;
  if (h === "::1" || h === "::") return true; // loopback / unspecified
  if (h === "64:ff9b::" || h === "64:ff9b::1") return true; // NAT64
  // IPv4-mapped / IPv4-compatible forms: ::ffff:127.0.0.1
  const mapped = h.match(/^::(?:ffff:)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  const hexMapped = h.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMapped) {
    const hi = parseInt(hexMapped[1], 16);
    const lo = parseInt(hexMapped[2], 16);
    const ip = `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
    return isPrivateIPv4(ip);
  }
  // Any other ::/96 form (e.g. ::2) is reserved, never a public destination.
  if (h.startsWith("::")) return true;

  // Inspect the first hextet for the special-purpose prefixes. This covers
  // whole ranges (fc00::/7, fe80::/10, ff00::/8) instead of a single value.
  const firstHex = h.split(":")[0] || "0";
  const first = parseInt(firstHex, 16);
  if (Number.isFinite(first)) {
    if ((first & 0xfe00) === 0xfc00) return true; // unique local fc00::/7
    if ((first & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
    if ((first & 0xff00) === 0xff00) return true; // multicast ff00::/8
    if (first === 0) return true; // 0::/8
  }
  if (/^2001:0?db8:/.test(h)) return true; // documentation 2001:db8::/32
  return false;
}

export function looksPrivateHost(hostname) {
  const host = String(hostname || "")
    .toLowerCase()
    .replace(/^\[|\]$/g, "") // IPv6 literals arrive bracketed
    .replace(/\.$/, "");
  if (!host) return true;
  if (PRIVATE_HOST_RE.test(host)) return true;
  if (host === "0.0.0.0" || host === "::1" || host === "::") return true;
  if (isPrivateIPv4(host)) return true;
  if (isPrivateIPv6(host)) return true;
  return false;
}

/**
 * Validate that a URL is safe to proxy: https, default port, not private,
 * allowlisted host.
 * @returns {{ok:true,url:URL}|{ok:false,code:string}}
 */
export function validateProxyUrl(target, env, extraAllowlist = []) {
  let url;
  try {
    url = new URL(String(target || ""));
  } catch {
    return { ok: false, code: "E_NOT_ALLOWED_HOST" };
  }
  if (url.protocol !== "https:") return { ok: false, code: "E_NOT_ALLOWED_HOST" };
  if (url.username || url.password) return { ok: false, code: "E_NOT_ALLOWED_HOST" };
  // Only the default HTTPS port (empty or an explicit 443) is allowed.
  if (url.port && url.port !== "443") return { ok: false, code: "E_NOT_ALLOWED_HOST" };
  if (looksPrivateHost(url.hostname)) return { ok: false, code: "E_NOT_ALLOWED_HOST" };
  const patterns = [...parseAllowlist(env), ...normalizePatterns(extraAllowlist)];
  if (!isAllowedHost(url.hostname, patterns)) return { ok: false, code: "E_NOT_ALLOWED_HOST" };
  return { ok: true, url };
}

export function contentLengthFromHeaders(headers) {
  const v = headers.get("content-length");
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** The configured size cap; invalid values fall back to a safe default. */
export function maxBytes(env) {
  const raw = env ? env.MAX_DOWNLOAD_MB : undefined;
  const n = Number(raw);
  if (raw === undefined || raw === null || raw === "" || !Number.isFinite(n) || n <= 0) return DEFAULT_MAX_BYTES;
  return Math.floor(n) * 1024 * 1024;
}

/** Rough size estimate for a variant, used to enforce the cap early. */
export function exceedsMaxSize(bytes, env) {
  if (!Number.isFinite(Number(bytes))) return false;
  return Number(bytes) > maxBytes(env);
}

function codedError(code, message) {
  const err = new Error(message || code);
  err.code = code;
  return err;
}

/**
 * Fetch the target, following redirects manually: every hop is re-validated
 * against the allowlist / SSRF rules and the hop count is capped.
 */
async function fetchWithValidatedRedirects(url, init, env, fetchImpl, extraAllowlist) {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    const res = await fetchImpl(current, { ...init, redirect: "manual" });
    if (res.status < 300 || res.status >= 400) return res;
    const location = res.headers.get("location");
    if (!location) return res;
    let next;
    try {
      next = new URL(location, current).toString();
    } catch {
      throw codedError("E_NOT_ALLOWED_HOST", "bad_redirect");
    }
    const check = validateProxyUrl(next, env, extraAllowlist);
    if (!check.ok) throw codedError("E_NOT_ALLOWED_HOST", "redirect_not_allowed");
    if (hop === MAX_REDIRECT_HOPS) throw codedError("E_UPSTREAM_FAILED", "too_many_redirects");
    current = check.url.toString();
  }
  throw codedError("E_UPSTREAM_FAILED", "too_many_redirects");
}

function normalizeContentType(value) {
  if (!value) return "";
  return String(value).split(";")[0].trim().toLowerCase();
}

/**
 * Fetch a media URL as a stream with Range pass-through, a real size cap,
 * redirect validation and body timeouts.
 * Returns a Response suitable to pass through to the client.
 */
export async function streamMedia(targetUrl, request, env, options = {}) {
  const check = validateProxyUrl(targetUrl, env, options.extraAllowlist);
  if (!check.ok) {
    throw codedError(check.code, check.code);
  }

  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : DEFAULT_TIMEOUT_MS;
  const idleTimeoutMs = Number(options.idleTimeoutMs) > 0 ? Number(options.idleTimeoutMs) : DEFAULT_IDLE_TIMEOUT_MS;
  const limit = options.maxBytes || maxBytes(env);

  const controller = new AbortController();
  const totalTimer = setTimeout(() => controller.abort(), timeoutMs);
  let idleTimer = null;
  const resetIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => controller.abort(), idleTimeoutMs);
  };
  resetIdle();

  const forwardHeaders = {};
  const range = request.headers.get("range");
  if (range) forwardHeaders.range = range;
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch) forwardHeaders["if-none-match"] = ifNoneMatch;

  let upstream;
  try {
    upstream = await fetchWithValidatedRedirects(
      check.url.toString(),
      {
        method: "GET",
        headers: { ...forwardHeaders, accept: "*/*", "accept-encoding": "identity", "user-agent": "insta-worker/1.0" },
        signal: controller.signal,
      },
      env,
      fetchImpl,
      options.extraAllowlist,
    );
  } catch (e) {
    clearTimeout(totalTimer);
    if (idleTimer) clearTimeout(idleTimer);
    if (e && e.code) throw e;
    throw codedError("E_UPSTREAM_FAILED", "upstream_failed");
  }

  const cleanup = () => {
    clearTimeout(totalTimer);
    if (idleTimer) clearTimeout(idleTimer);
  };

  // A conditional request that the upstream confirms: no body, no count.
  if (upstream.status === 304) {
    cleanup();
    const headers = new Headers();
    for (const h of ["etag", "last-modified", "cache-control"]) {
      const v = upstream.headers.get(h);
      if (v) headers.set(h, v);
    }
    headers.set("cache-control", "private, max-age=0, must-revalidate");
    headers.set("x-content-type-options", "nosniff");
    if (options.contentDisposition) headers.set("content-disposition", options.contentDisposition);
    return new Response(null, { status: 304, headers });
  }

  if (upstream.status === 404 || upstream.status === 410) {
    cleanup();
    throw codedError("E_PRIVATE_OR_NOT_FOUND", "not_found");
  }
  if (upstream.status >= 300 && upstream.status < 400) {
    cleanup();
    throw codedError("E_UPSTREAM_FAILED", "redirect_not_followed");
  }
  if (!upstream.ok && upstream.status !== 206) {
    cleanup();
    throw codedError("E_UPSTREAM_FAILED", `upstream_status_${upstream.status}`);
  }

  const upstreamType = normalizeContentType(upstream.headers.get("content-type"));
  if (DANGEROUS_MIME.has(upstreamType)) {
    cleanup();
    throw codedError("E_NOT_ALLOWED_TYPE", "dangerous_mime");
  }
  const isMedia = MEDIA_MIME_ALLOWLIST.has(upstreamType);

  const declared = contentLengthFromHeaders(upstream.headers);
  if (declared !== undefined && declared > limit) {
    cleanup();
    throw codedError("E_TOO_LARGE", "too_large");
  }

  const isHead = request.method === "HEAD";

  const headers = new Headers();
  for (const h of ["content-type", "content-range", "accept-ranges", "etag", "last-modified"]) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  // content-encoding is never forwarded: the body we hand out is the plain
  // (decoded) stream, so keeping the header would break the client.
  if (declared !== undefined && upstream.status !== 206) headers.set("content-length", String(declared));
  headers.set("cache-control", "private, max-age=300");
  headers.set("x-content-type-options", "nosniff");
  if (!headers.has("accept-ranges")) headers.set("accept-ranges", "bytes");
  if (options.contentType) headers.set("content-type", options.contentType);
  if (!isMedia) {
    // Anything that is not a known media type is sandboxed and forced to
    // download instead of being rendered in the origin.
    headers.set("content-security-policy", "sandbox; default-src 'none'");
    headers.set("content-disposition", options.contentDisposition || "attachment");
    if (!headers.has("content-type")) headers.set("content-type", "application/octet-stream");
  } else if (options.contentDisposition) {
    headers.set("content-disposition", options.contentDisposition);
  } else if (options.inline) {
    // In-page playback: the browser may render the media directly.
    headers.set("content-disposition", "inline");
  }
  // Media is same-origin only: no permissive CORS on binary responses.
  applyMediaCors(headers, request);

  if (isHead || !upstream.body) {
    cleanup();
    // Never keep the upstream body alive for a HEAD request.
    if (upstream.body) {
      try {
        await upstream.body.cancel();
      } catch {
        /* ignore */
      }
    }
    return new Response(null, { status: upstream.status, statusText: upstream.statusText, headers });
  }

  let total = 0;
  let guard;
  try {
    guard = upstream.body.pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          total += chunk.byteLength || 0;
          if (total > limit) {
            controller.error(codedError("E_TOO_LARGE", "too_large"));
            return;
          }
          resetIdle();
          controller.enqueue(chunk);
        },
        flush() {
          // The body ended normally: stop the timers.
          cleanup();
        },
        cancel() {
          cleanup();
        },
      }),
    );
  } catch (e) {
    cleanup();
    throw codedError("E_UPSTREAM_FAILED", "stream_failed");
  }

  return new Response(guard, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

/**
 * Media responses are same-origin only. A permissive `*` would let any site
 * embed the proxied bytes, so CORS is granted only when the request comes
 * from the worker's own origin.
 */
export function applyMediaCors(headers, request) {
  try {
    const origin = request.headers.get("origin");
    if (!origin) return;
    const self = new URL(request.url).origin;
    if (origin === self) {
      headers.set("access-control-allow-origin", origin);
      headers.set("vary", "Origin");
    }
  } catch {
    // ignore
  }
}

export function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
