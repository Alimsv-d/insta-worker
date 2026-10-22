// Security helpers for the download proxy: CDN allowlist, SSRF guards,
// streaming with Range pass-through and a hard size cap.

const DEFAULT_ALLOWLIST = ["*.cdninstagram.com", "*.fbcdn.net", "*.instagram.com", "*.facebook.com"];

export function parseAllowlist(env) {
  const raw = (env && env.CDN_ALLOWLIST) || DEFAULT_ALLOWLIST.join(",");
  return String(raw)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedHost(hostname, patterns) {
  const host = String(hostname || "").toLowerCase().replace(/\.$/, "");
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

const PRIVATE_HOST_RE = /^(localhost|.*\.local|.*\.internal)$/i;

export function looksPrivateHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  if (PRIVATE_HOST_RE.test(host)) return true;
  if (host === "0.0.0.0" || host === "::1" || host === "::") return true;
  // IPv4 literal
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 0) return true;
  }
  return false;
}

/**
 * Validate that a URL is safe to proxy: https, not private, allowlisted host.
 * @returns {{ok:true,url:URL}|{ok:false,code:string}}
 */
export function validateProxyUrl(target, env, extraAllowlist = []) {
  let url;
  try {
    url = new URL(target);
  } catch {
    return { ok: false, code: "E_NOT_ALLOWED_HOST" };
  }
  if (url.protocol !== "https:") return { ok: false, code: "E_NOT_ALLOWED_HOST" };
  if (url.username || url.password) return { ok: false, code: "E_NOT_ALLOWED_HOST" };
  if (looksPrivateHost(url.hostname)) return { ok: false, code: "E_NOT_ALLOWED_HOST" };
  const patterns = [...parseAllowlist(env), ...extraAllowlist];
  if (!isAllowedHost(url.hostname, patterns)) return { ok: false, code: "E_NOT_ALLOWED_HOST" };
  return { ok: true, url };
}

export function contentLengthFromHeaders(headers) {
  const v = headers.get("content-length");
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * Rough size estimate for a variant, used to enforce MAX_DOWNLOAD_MB before
 * starting the stream when the upstream advertises Content-Length.
 */
export function exceedsMaxSize(bytes, env) {
  const maxMb = Number((env && env.MAX_DOWNLOAD_MB) || 80);
  if (!Number.isFinite(maxMb) || maxMb <= 0) return false;
  return bytes > maxMb * 1024 * 1024;
}

export function maxBytes(env) {
  const maxMb = Number((env && env.MAX_DOWNLOAD_MB) || 80);
  return (Number.isFinite(maxMb) && maxMb > 0 ? maxMb : 80) * 1024 * 1024;
}

/**
 * Fetch a media URL as a stream with Range pass-through, size cap and timeout.
 * Returns a Response suitable to pass through to the client.
 */
export async function streamMedia(targetUrl, request, env, options = {}) {
  const check = validateProxyUrl(targetUrl, env, options.extraAllowlist);
  if (!check.ok) {
    const err = new Error(check.code);
    err.code = check.code;
    throw err;
  }

  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = Number(options.timeoutMs || 20000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const forwardHeaders = {};
  const range = request.headers.get("range");
  if (range) forwardHeaders.range = range;
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch) forwardHeaders["if-none-match"] = ifNoneMatch;

  let upstream;
  try {
    upstream = await fetchImpl(check.url.toString(), {
      method: "GET",
      headers: { ...forwardHeaders, accept: "*/*", "user-agent": "insta-worker/1.0" },
      signal: controller.signal,
      redirect: "follow",
    });
  } catch (e) {
    clearTimeout(timer);
    const err = new Error("upstream_failed");
    err.code = "E_UPSTREAM_FAILED";
    throw err;
  }

  if (upstream.status >= 300 && upstream.status < 400) {
    clearTimeout(timer);
    const err = new Error("E_UPSTREAM_FAILED");
    err.code = "E_UPSTREAM_FAILED";
    throw err;
  }
  if (upstream.status === 404 || upstream.status === 410) {
    clearTimeout(timer);
    const err = new Error("E_PRIVATE_OR_NOT_FOUND");
    err.code = "E_PRIVATE_OR_NOT_FOUND";
    throw err;
  }
  if (!upstream.ok && upstream.status !== 206) {
    clearTimeout(timer);
    const err = new Error("E_UPSTREAM_FAILED");
    err.code = "E_UPSTREAM_FAILED";
    throw err;
  }

  const declared = contentLengthFromHeaders(upstream.headers);
  if (declared !== undefined && exceedsMaxSize(declared, env) && upstream.status !== 206) {
    clearTimeout(timer);
    const err = new Error("E_TOO_LARGE");
    err.code = "E_TOO_LARGE";
    throw err;
  }

  // Request headers received: cancel the timeout so it does not keep the
  // runtime alive while the body streams.
  clearTimeout(timer);

  const headers = new Headers();
  for (const h of [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "etag",
    "last-modified",
  ]) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set("cache-control", "private, max-age=300");
  headers.set("x-content-type-options", "nosniff");
  headers.set("access-control-allow-origin", "*");
  if (options.contentDisposition) headers.set("content-disposition", options.contentDisposition);
  if (options.contentType) headers.set("content-type", options.contentType);
  if (!headers.has("accept-ranges")) headers.set("accept-ranges", "bytes");

  const isHead = request.method === "HEAD";
  const body = isHead ? null : upstream.body;

  return new Response(body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

export function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
