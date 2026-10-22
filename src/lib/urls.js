// Strict Instagram URL parsing / validation.
//
// Accepted: https only, host in {instagram.com, www.instagram.com, instagr.am},
// path in {/p/<code>, /reel/<code>, /reels/<code>, /tv/<code>}. No port, no
// credentials, tracking params stripped, shortcode normalised.

export const INSTAGRAM_HOSTS = new Set([
  "instagram.com",
  "www.instagram.com",
  "m.instagram.com",
  "instagr.am",
]);

export const CONTENT_KINDS = new Set(["p", "reel", "reels", "tv"]);

const SHORTCODE_RE = /^[A-Za-z0-9_-]{2,64}$/;
const TRACKING_PARAMS = [
  "igsh",
  "igshid",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
];

export class UrlError extends Error {
  constructor(code = "E_INVALID_URL") {
    super(code);
    this.code = code;
  }
}

/**
 * @param {string} input raw user input
 * @returns {{ok:true, kind:string, shortcode:string, canonical:string, url:URL}}
 *        or throws UrlError
 */
export function parseInstagramUrl(input) {
  if (typeof input !== "string" || input.trim() === "") {
    throw new UrlError("E_INVALID_URL");
  }
  let raw = input.trim();

  // Be forgiving: accept bare "instagram.com/p/xxx" without scheme.
  if (!/^https?:\/\//i.test(raw)) {
    raw = "https://" + raw.replace(/^\/+/, "");
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new UrlError("E_INVALID_URL");
  }

  if (url.protocol !== "https:") throw new UrlError("E_INVALID_URL");
  if (url.port && url.port !== "443") throw new UrlError("E_INVALID_URL");
  if (url.username || url.password) throw new UrlError("E_INVALID_URL");

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!INSTAGRAM_HOSTS.has(host)) throw new UrlError("E_INVALID_URL");

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length < 2) throw new UrlError("E_INVALID_URL");

  const kind = segments[0].toLowerCase();
  if (!CONTENT_KINDS.has(kind)) throw new UrlError("E_INVALID_URL");

  const shortcode = segments[1];
  if (!SHORTCODE_RE.test(shortcode)) throw new UrlError("E_INVALID_URL");

  // Normalise reels -> reel for a compact canonical representation.
  const canonicalKind = kind === "reels" ? "reel" : kind;
  const canonical = `https://www.instagram.com/${canonicalKind}/${shortcode}/`;

  return { ok: true, kind: canonicalKind, shortcode, canonical, url };
}

export function sanitizeFilenamePart(value, fallback = "instagram") {
  const cleaned = String(value || "")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_.-]+|[_.-]+$/g, "")
    .slice(0, 60);
  return cleaned || fallback;
}

export function buildFilename(author, shortcode, index, ext) {
  const a = sanitizeFilenamePart(author, "instagram");
  const c = sanitizeFilenamePart(shortcode, "media");
  const suffix = Number.isFinite(index) && index > 0 ? `_${index}` : "";
  const e = sanitizeFilenamePart(ext, "bin").toLowerCase().replace(/^\./, "");
  return `${a}_${c}${suffix}.${e}`;
}
