// Standard JSON envelope, error codes, CORS and cache headers.
//
// Header rules enforced here:
//   * a page that carries a per-request nonce is NEVER publicly cached
//     (`private, no-store`);
//   * the CSP has no `unsafe-inline`: the inline <style> and the inline
//     <script> are bound to per-request nonces;
//   * rate-limit headers never travel with a publicly cacheable response;
//   * the fixed envelope fields (ok / status / lang / error / data) always win
//     over caller supplied extras.

import { t } from "./i18n.js";

export const ERROR_STATUS = {
  E_INVALID_URL: 400,
  E_INVALID_REQUEST: 400,
  E_BAD_QUALITY: 400,
  E_BAD_INDEX: 400,
  E_METHOD: 405,
  E_UNAUTHORIZED: 401,
  E_FORBIDDEN: 403,
  E_NOT_FOUND: 404,
  E_NOT_ALLOWED_HOST: 400,
  E_NOT_ALLOWED_TYPE: 400,
  E_RATE_LIMIT: 429,
  E_TOO_LARGE: 413,
  E_PRIVATE_OR_NOT_FOUND: 404,
  E_UPSTREAM_FAILED: 502,
  E_UPSTREAM_UNAVAILABLE: 502,
  E_NO_VARIANTS: 404,
  E_KEY_DISABLED: 409,
  E_KEY_EXISTS: 409,
  E_INTERNAL: 500,
};

export function corsHeaders(extra = {}) {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,HEAD,OPTIONS",
    "access-control-allow-headers": "Content-Type, Authorization, X-Requested-With, X-API-Key, Range, If-None-Match",
    "access-control-max-age": "86400",
    "access-control-expose-headers":
      "X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After, ETag, X-Request-Id, Content-Disposition, Content-Range, Accept-Ranges",
    ...extra,
  };
}

export function baseHeaders(extra = {}) {
  return {
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "permissions-policy": "geolocation=(), microphone=(), camera=()",
    ...corsHeaders(extra),
  };
}

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "permissions-policy": "geolocation=(), microphone=(), camera=()",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
};

/**
 * Build a Content-Security-Policy without `unsafe-inline`.
 *
 * `scriptNonce` binds the inline script, `styleNonce` binds the inline
 * stylesheet. When a nonce is missing the directive falls back to 'self'
 * (the bundled assets), never to 'unsafe-inline'.
 */
export function buildCsp(scriptNonce, styleNonce) {
  const scriptSrc = scriptNonce ? `'nonce-${scriptNonce}'` : "'self'";
  const styleSrc = styleNonce ? `'nonce-${styleNonce}'` : "'self'";
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    `style-src ${styleSrc}`,
    "img-src 'self' data: blob: https://*.cdninstagram.com https://*.fbcdn.net https://*.instagram.com https://*.facebook.com",
    "media-src 'self' blob: https://*.cdninstagram.com https://*.fbcdn.net https://*.instagram.com https://*.facebook.com",
    // The webfont is loaded from a pinned CDN version with an SRI hash.
    "font-src 'self' https://cdn.jsdelivr.net",
    "connect-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function htmlHeaders(scriptNonce, styleNonce, extra = {}) {
  return {
    "content-type": "text/html; charset=utf-8",
    ...SECURITY_HEADERS,
    "content-security-policy": buildCsp(scriptNonce, styleNonce),
    // A nonce-carrying document must never end up in a shared cache.
    "cache-control": "private, no-store",
    ...extra,
  };
}

/**
 * Error envelope. `headers` are response headers, `body` adds fields to the
 * envelope — the fixed fields always win.
 */
export function jsonError(code, lang, options = {}) {
  const { headers = {}, body = {} } = options || {};
  const status = ERROR_STATUS[code] || 500;
  const headersOut = { ...headers };
  if (status === 401 && !headersOut["www-authenticate"]) {
    headersOut["www-authenticate"] = 'Bearer realm="insta-worker"';
  }
  if (status === 405 && !headersOut.allow) {
    headersOut.allow = "GET, HEAD, OPTIONS";
  }
  return jsonResponse(
    {
      ...body,
      ok: false,
      status,
      lang,
      error: { code, message: t(lang, code) },
    },
    status,
    lang,
    headersOut,
  );
}

/** Success envelope. */
export function jsonOk(data, lang, options = {}) {
  const { headers = {}, body = {} } = options || {};
  return jsonResponse({ ...body, ok: true, status: 200, lang, data }, 200, lang, headers);
}

export function jsonResponse(body, status, lang, headers = {}) {
  const merged = { ...headers };
  const h = new Headers(baseHeaders(merged));
  h.set("content-type", "application/json; charset=utf-8");
  if (!("cache-control" in merged)) h.set("cache-control", "no-store");
  return new Response(JSON.stringify(body), { status, headers: h });
}

export function newRequestId() {
  try {
    return crypto.randomUUID();
  } catch {
    return "req_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

export function withRequestId(body, requestId) {
  return { ...body, request_id: requestId };
}

/**
 * A cryptographically random nonce for CSP. Falls back to `crypto.getRandomValues`
 * when `crypto.randomUUID` is unavailable.
 */
export function newNonce() {
  try {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return newRequestId().replace(/-/g, "");
  }
}
