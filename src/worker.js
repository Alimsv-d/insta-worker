// =============================================================================
// insta-worker — independent Instagram public-content resolver & downloader.
// Cloudflare Workers. No Telegram, no cookies, no private content.
// =============================================================================

import { parseInstagramUrl, buildFilename } from "./lib/urls.js";
import { resolveContent, checkProviderHealth, providerHealthSnapshot, parseUpstreams } from "./lib/providers.js";
import { streamMedia, validateProxyUrl, maxBytes } from "./lib/security.js";
import {
  checkRateLimit,
  rateLimits,
  rateHeaders,
  clientKey,
  recordStat,
  cacheGet,
  cacheSet,
  etagFrom,
  lookupApiKey,
  createApiKey,
  bearerToken,
  apiKey,
} from "./lib/storage.js";
import {
  jsonError,
  jsonResponse,
  baseHeaders,
  htmlHeaders,
  newRequestId,
  withRequestId,
} from "./lib/http.js";
import { langFromRequest, t } from "./lib/i18n.js";
import { renderHome } from "./lib/ui.js";

const BUILD = "v1.0.0";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveVariant(result, quality, index) {
  const idx = Number.isFinite(Number(index)) ? Number(index) : 0;
  if (idx < 0 || idx >= result.items.length) return { error: "E_BAD_INDEX" };
  const item = result.items[idx];
  if (!item || item.variants.length === 0) return { error: "E_NO_VARIANTS" };
  let variant;
  if (!quality || quality === "best") {
    variant = item.variants[0];
  } else {
    variant = item.variants.find((v) => v.quality === quality);
    if (!variant) return { error: "E_BAD_QUALITY" };
  }
  return { variant, item, index: idx };
}

function contentDisposition(filename) {
  const safe = String(filename || "media").replace(/["\\\r\n]/g, "_");
  return `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

async function metaForResolve(ctx, env, lang) {
  // cache by shortcode
  const cached = await cacheGet(env, ctx.shortcode);
  if (cached) return { data: cached, cached: true };
  const data = await resolveContent(ctx, env);
  await cacheSet(env, ctx.shortcode, data);
  return { data, cached: false };
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

async function handleResolve(request, env, lang, requestId, rlKey) {
  const url = new URL(request.url);
  let parsed;
  try {
    parsed = parseInstagramUrl(url.searchParams.get("url"));
  } catch (e) {
    return jsonError(e.code || "E_INVALID_URL", lang, { request_id: requestId });
  }

  const rl = await checkRateLimit(env, "resolve", rlKey, rateLimits(env).resolve);
  if (!rl.allowed) {
    await recordStat(env, { event: "rate_limit", code: "E_RATE_LIMIT", ipHash: rlKey, shortcode: parsed.shortcode });
    return jsonResponse(
      withRequestId({ ok: false, status: 429, lang, error: { code: "E_RATE_LIMIT", message: t(lang, "E_RATE_LIMIT") } }, requestId),
      429,
      lang,
      rateHeaders(rl),
    );
  }

  try {
    const { data, cached } = await metaForResolve(parsed, env, lang);
    await recordStat(env, { event: "resolve", ipHash: rlKey, shortcode: parsed.shortcode, provider: data.provider });
    const etag = etagFrom(data);
    const inm = request.headers.get("if-none-match");
    if (inm && inm === etag) {
      return new Response(null, { status: 304, headers: baseHeaders({ etag, "cache-control": "public, max-age=60" }) });
    }
    return jsonResponse(
      withRequestId({ ok: true, status: 200, lang, data, meta: { cached, build: BUILD } }, requestId),
      200,
      lang,
      { etag, "cache-control": "public, max-age=60", "x-cache": cached ? "HIT" : "MISS", ...rateHeaders(rl) },
    );
  } catch (err) {
    const code = err.code || "E_UPSTREAM_FAILED";
    await recordStat(env, { event: "resolve_error", code, ipHash: rlKey, shortcode: parsed.shortcode });
    return jsonError(code, lang, { request_id: requestId, ...rateHeaders(rl) });
  }
}

async function handleDownload(request, env, lang, requestId, rlKey) {
  const url = new URL(request.url);
  let parsed;
  try {
    parsed = parseInstagramUrl(url.searchParams.get("url"));
  } catch (e) {
    return jsonError(e.code || "E_INVALID_URL", lang, { request_id: requestId });
  }
  const quality = url.searchParams.get("quality") || "best";
  const index = url.searchParams.get("index") || "0";

  const rl = await checkRateLimit(env, "download", rlKey, rateLimits(env).download);
  if (!rl.allowed) {
    return jsonResponse(
      withRequestId({ ok: false, status: 429, lang, error: { code: "E_RATE_LIMIT", message: t(lang, "E_RATE_LIMIT") } }, requestId),
      429,
      lang,
      rateHeaders(rl),
    );
  }

  let result;
  try {
    const r = await metaForResolve(parsed, env, lang);
    result = r.data;
  } catch (err) {
    return jsonError(err.code || "E_UPSTREAM_FAILED", lang, { request_id: requestId });
  }

  const picked = resolveVariant(result, quality, index);
  if (picked.error) return jsonError(picked.error, lang, { request_id: requestId });

  const { variant, index: idx } = picked;
  // Pre-check size cap when upstream advertised a size in metadata.
  if (variant.size && variant.size > maxBytes(env)) {
    return jsonError("E_TOO_LARGE", lang, { request_id: requestId });
  }

  try {
    const filename = variant.filename || buildFilename(result.author?.username || "instagram", result.shortcode, idx + 1, "mp4");
    const res = await streamMedia(variant.url, request, env, {
      contentDisposition: contentDisposition(filename),
      contentType: variant.mime,
    });
    await recordStat(env, { event: "download", ipHash: rlKey, shortcode: parsed.shortcode, provider: result.provider });
    const h = new Headers(res.headers);
    for (const [k, v] of Object.entries(rateHeaders(rl))) h.set(k, v);
    h.set("x-request-id", requestId);
    return new Response(res.body, { status: res.status, headers: h });
  } catch (err) {
    const code = err.code || "E_UPSTREAM_FAILED";
    await recordStat(env, { event: "download_error", code, ipHash: rlKey, shortcode: parsed.shortcode });
    return jsonError(code, lang, { request_id: requestId });
  }
}

async function handleThumbnail(request, env, lang, requestId, rlKey) {
  const url = new URL(request.url);
  const target = url.searchParams.get("url");
  if (!target) return jsonError("E_INVALID_URL", lang, { request_id: requestId });

  const check = validateProxyUrl(target, env);
  if (!check.ok) return jsonError(check.code, lang, { request_id: requestId });

  // Use a light HEAD-like streaming fetch, but never cache aggressively.
  try {
    const res = await streamMedia(target, request, env, {});
    const h = new Headers(res.headers);
    h.set("cache-control", "public, max-age=300, immutable");
    h.set("x-request-id", requestId);
    return new Response(res.body, { status: res.status, headers: h });
  } catch (err) {
    return jsonError(err.code || "E_UPSTREAM_FAILED", lang, { request_id: requestId });
  }
}

async function handleHealth(request, env, lang, requestId) {
  const providers = parseUpstreams(env).map((u) => {
    let host = u;
    try {
      host = new URL(u).hostname;
    } catch {
      /* ignore */
    }
    return host;
  });
  const health = providerHealthSnapshot();

  const url = new URL(request.url);
  let live = null;
  if (url.searchParams.get("deep") === "1") {
    try {
      live = await checkProviderHealth(env);
    } catch {
      live = [];
    }
  }

  return jsonResponse(
    withRequestId(
      {
        ok: true,
        status: 200,
        lang,
        data: {
          status: "ok",
          build: BUILD,
          time: new Date().toISOString(),
          providers,
          provider_health: health,
          ...(live ? { provider_live: live } : {}),
          storage: { kv: !!(env && env.KV), d1: !!(env && env.DB) },
          limits: rateLimits(env),
          max_download_mb: Number((env && env.MAX_DOWNLOAD_MB) || 80),
          contact: (env && env.CONTACT_URL) || null,
        },
      },
      requestId,
    ),
    200,
    lang,
    { "cache-control": "no-store", ...baseHeaders() },
  );
}

function openApiDocument(env) {
  return {
    openapi: "3.0.3",
    info: {
      title: "insta-worker API",
      version: "1.0.0",
      description:
        "Fetch public Instagram post/reel/IGTV metadata and stream downloads. No Telegram, no private content.",
    },
    servers: [{ url: "/" }],
    paths: {
      "/api/v1/resolve": {
        get: {
          summary: "Resolve metadata and variants",
          parameters: [
            { name: "url", in: "query", required: true, schema: { type: "string" } },
            { name: "lang", in: "query", schema: { type: "string", enum: ["fa", "en"] } },
          ],
          responses: { 200: { description: "OK" }, 400: { description: "Invalid URL" }, 429: { description: "Rate limited" } },
        },
      },
      "/api/v1/download": {
        get: {
          summary: "Download/stream a variant",
          parameters: [
            { name: "url", in: "query", required: true, schema: { type: "string" } },
            { name: "quality", in: "query", schema: { type: "string" } },
            { name: "index", in: "query", schema: { type: "integer" } },
          ],
          responses: { 200: { description: "Binary stream" }, 404: { description: "Not found" }, 413: { description: "Too large" } },
        },
      },
      "/api/v1/thumbnail": {
        get: {
          summary: "Proxy a thumbnail",
          parameters: [{ name: "url", in: "query", required: true, schema: { type: "string" } }],
          responses: { 200: { description: "Image stream" }, 400: { description: "Host not allowed" } },
        },
      },
      "/health": { get: { summary: "Health", responses: { 200: { description: "OK" } } } },
      "/openapi.json": { get: { summary: "This document", responses: { 200: { description: "OK" } } } },
    },
  };
}

async function handleAdmin(request, env, lang, requestId) {
  const token = bearerToken(request) || request.headers.get("x-admin-token");
  const expected = env && env.ADMIN_TOKEN;
  if (!expected || token !== expected) {
    return jsonError("E_UNAUTHORIZED", lang, { request_id: requestId });
  }
  const url = new URL(request.url);
  if (url.pathname.endsWith("/keys") && request.method === "POST") {
    let body = {};
    try {
      body = await request.json();
    } catch {
      /* ignore */
    }
    if (!body.key) return jsonError("E_INVALID_URL", lang, { request_id: requestId });
    try {
      await createApiKey(env, { key: body.key, label: body.label, limitPerMinute: body.limit_per_minute });
      return jsonResponse(withRequestId({ ok: true, status: 200, lang, data: { created: true } }, requestId), 200, lang);
    } catch {
      return jsonError("E_INTERNAL", lang, { request_id: requestId });
    }
  }
  return jsonResponse(withRequestId({ ok: true, status: 200, lang, data: { ok: true } }, requestId), 200, lang);
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export default {
  async fetch(request, env, ctx) {
    const requestId = newRequestId();
    const lang = langFromRequest(request, env);
    const method = request.method.toUpperCase();

    if (method === "OPTIONS") {
      return new Response(null, { status: 204, headers: baseHeaders({ "cache-control": "no-store" }) });
    }

    let url;
    try {
      url = new URL(request.url);
    } catch {
      return jsonError("E_INVALID_URL", lang, { request_id: requestId });
    }
    const path = url.pathname.replace(/\/+$/, "") || "/";

    // Only GET/HEAD for public endpoints.
    const isGetLike = method === "GET" || method === "HEAD";

    try {
      // ---- REST API ----
      if (path.startsWith("/api/")) {
        // Resolve rate-limit key (API key or IP hash).
        const provided = apiKey(request);
        let rlKey;
        let apiLimit = null;
        if (provided) {
          const record = await lookupApiKey(env, provided);
          if (record) {
            rlKey = "key:" + (await sha256(provided));
            apiLimit = record.limitPerMinute;
          }
        }
        if (!rlKey) rlKey = await clientKey(request);

        if (path === "/api/v1/admin/keys" || path.startsWith("/api/v1/admin")) {
          return await handleAdmin(request, env, lang, requestId);
        }

        if (!isGetLike) return jsonError("E_METHOD", lang, { request_id: requestId });

        if (path === "/api/v1/resolve") return await handleResolve(request, env, lang, requestId, rlKey);
        if (path === "/api/v1/download") return await handleDownload(request, env, lang, requestId, rlKey);
        if (path === "/api/v1/thumbnail") return await handleThumbnail(request, env, lang, requestId, rlKey);

        return jsonError("E_NOT_FOUND", lang, { request_id: requestId });
      }

      if (path === "/health") {
        if (!isGetLike) return jsonError("E_METHOD", lang, { request_id: requestId });
        return await handleHealth(request, env, lang, requestId);
      }

      if (path === "/openapi.json") {
        const spec = openApiDocument(env);
        return jsonResponse(
          withRequestId({ ok: true, status: 200, lang, data: spec }, requestId),
          200,
          lang,
          { "cache-control": "public, max-age=3600" },
        );
      }

      if (path === "/robots.txt") {
        return new Response("User-agent: *\nAllow: /\n", {
          status: 200,
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      }

      if (path === "/" || path === "/index.html") {
        if (!isGetLike) return jsonError("E_METHOD", lang, { request_id: requestId });
        const debug = url.searchParams.get("debug") === "1";
        const nonce = newRequestId().replace(/-/g, "");
        const html = renderHome({
          lang,
          nonce,
          build: BUILD,
          contact: (env && env.CONTACT_URL) || "",
          defaultLang: (env && env.DEFAULT_LANG) || "fa",
          debug,
        });
        return new Response(method === "HEAD" ? null : html, {
          status: 200,
          headers: htmlHeaders(nonce, { "x-request-id": requestId }),
        });
      }

      return jsonError("E_NOT_FOUND", lang, { request_id: requestId });
    } catch (err) {
      // Never leak stack traces.
      return jsonError("E_INTERNAL", lang, { request_id: requestId });
    }
  },
};

async function sha256(input) {
  const data = new TextEncoder().encode(String(input));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
