// Standard JSON envelope, error codes, CORS and cache headers.

import { t } from "./i18n.js";

export const ERROR_STATUS = {
  E_INVALID_URL: 400,
  E_BAD_QUALITY: 400,
  E_BAD_INDEX: 400,
  E_METHOD: 405,
  E_UNAUTHORIZED: 401,
  E_NOT_FOUND: 404,
  E_NOT_ALLOWED_HOST: 400,
  E_RATE_LIMIT: 429,
  E_TOO_LARGE: 413,
  E_PRIVATE_OR_NOT_FOUND: 404,
  E_UPSTREAM_FAILED: 502,
  E_NO_VARIANTS: 404,
  E_INTERNAL: 500,
};

export function corsHeaders(extra = {}) {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,HEAD,OPTIONS",
    "access-control-allow-headers": "Content-Type, Authorization, X-Requested-With",
    "access-control-max-age": "86400",
    "access-control-expose-headers":
      "X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After, ETag, X-Request-Id",
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
 * Build a Content-Security-Policy. The UI is single-file, but may reference a
 * couple of image/CDN hosts and the Vazirmatn font CDN, so those are allowed
 * explicitly. No inline scripts other than the bundled one (no 'unsafe-inline'
 * for script-src; a nonce is injected at render time).
 */
export function buildCsp(nonce) {
  const scriptSrc = nonce ? `'nonce-${nonce}'` : "'self'";
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.cdninstagram.com https://*.fbcdn.net https://*.instagram.com",
    "media-src 'self' blob: https://*.cdninstagram.com https://*.fbcdn.net https://*.instagram.com",
    "font-src 'self' data: https://cdn.jsdelivr.net",
    "connect-src 'self'",
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join("; ");
}

export function htmlHeaders(nonce, extra = {}) {
  return {
    "content-type": "text/html; charset=utf-8",
    ...SECURITY_HEADERS,
    "content-security-policy": buildCsp(nonce),
    "cache-control": "public, max-age=300",
    ...extra,
  };
}

export function jsonError(code, lang, extra = {}) {
  const status = ERROR_STATUS[code] || 500;
  return jsonResponse(
    {
      ok: false,
      status,
      lang,
      error: { code, message: t(lang, code) },
      ...extra,
    },
    status,
    lang,
  );
}

export function jsonOk(data, lang, extra = {}, headers = {}) {
  return jsonResponse({ ok: true, status: 200, lang, data }, 200, lang, extra, headers);
}

export function jsonResponse(body, status, lang, extra = {}, headers = {}) {
  const h = baseHeaders({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...extra,
    ...headers,
  });
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
