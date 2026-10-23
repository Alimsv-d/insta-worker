// =============================================================================
// insta-worker — independent Instagram public-content resolver & downloader.
// Cloudflare Workers. No cookies, no private content.
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
  purgeOldStats,
  cacheGet,
  cacheSet,
  etagFrom,
  lookupApiKey,
  createApiKey,
  disableApiKey,
  listApiKeys,
  validateLimitPerMinute,
  apiKeyHash,
  bearerToken,
  apiKey,
} from "./lib/storage.js";
import {
  jsonError,
  jsonOk,
  jsonResponse,
  baseHeaders,
  htmlHeaders,
  newRequestId,
  newNonce,
  withRequestId,
} from "./lib/http.js";
import { timingSafeEqual } from "./lib/crypto.js";
import { langFromRequest, t } from "./lib/i18n.js";
import { renderHome } from "./lib/ui.js";

const BUILD = "v1.0.0";
const STAT_RETENTION_DAYS = 30;

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

async function metaForResolve(parsed, env) {
  // cache by shortcode
  const cached = await cacheGet(env, parsed.shortcode);
  if (cached) return { data: cached, cached: true };
  const data = await resolveContent(parsed, env);
  await cacheSet(env, parsed.shortcode, data);
  return { data, cached: false };
}

function rateLimited(lang, requestId, rl, extra = {}) {
  return jsonError(
    "E_RATE_LIMIT",
    lang,
    {
      headers: { ...rateHeaders(rl), ...extra },
      body: { request_id: requestId },
    },
  );
}

/**
 * Resolve the bucket key and the effective limit for an API request.
 * An API key replaces the IP bucket and may carry its own limit.
 */
async function resolveAuthContext(request, env) {
  const provided = apiKey(request);
  if (!provided) {
    const key = await clientKey(request, env);
    return { rlKey: key, limit: null, apiKeyRecord: null, invalidKey: false };
  }
  const record = await lookupApiKey(env, provided);
  if (!record) {
    // An unknown key is treated as "no key" (the client falls back to its IP
    // bucket) — but it is never given a key bucket.
    const key = await clientKey(request, env);
    return { rlKey: key, limit: null, apiKeyRecord: null, invalidKey: true };
  }
  if (record.disabled) {
    const key = await clientKey(request, env);
    return { rlKey: key, limit: null, apiKeyRecord: record, invalidKey: false, disabled: true };
  }
  const hash = await apiKeyHash(env, provided);
  return { rlKey: "key:" + hash, limit: record.limitPerMinute, apiKeyRecord: record, invalidKey: false };
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

async function handleResolve(request, env, lang, requestId, rlKey, limitOverride, ctx) {
  const url = new URL(request.url);
  let parsed;
  try {
    parsed = parseInstagramUrl(url.searchParams.get("url"));
  } catch (e) {
    return jsonError(e.code || "E_INVALID_URL", lang, { body: { request_id: requestId } });
  }

  const limits = rateLimits(env);
  const limit = limitOverride || limits.resolve;
  const rl = await checkRateLimit(env, "resolve", rlKey, limit);
  if (!rl.allowed) {
    await recordStat(env, { event: "rate_limit", code: "E_RATE_LIMIT", ipHash: rlKey, shortcode: parsed.shortcode }, ctx);
    return rateLimited(lang, requestId, rl);
  }

  try {
    const { data, cached } = await metaForResolve(parsed, env);
    await recordStat(
      env,
      { event: "resolve", ipHash: rlKey, shortcode: parsed.shortcode, provider: data.provider },
      ctx,
    );
    const etag = await etagFrom(data);
    const inm = request.headers.get("if-none-match");
    // The response carries rate-limit headers, therefore it must never be
    // stored in a shared cache.
    const cacheControl = "private, no-store";
    if (inm && inm === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          ...baseHeaders({ etag, "cache-control": cacheControl, ...rateHeaders(rl) }),
          "x-request-id": requestId,
        },
      });
    }
    return jsonResponse(
      withRequestId({ ok: true, status: 200, lang, data, meta: { cached, build: BUILD } }, requestId),
      200,
      lang,
      {
        etag,
        "cache-control": cacheControl,
        "x-cache": cached ? "HIT" : "MISS",
        "x-request-id": requestId,
        ...rateHeaders(rl),
      },
    );
  } catch (err) {
    const code = err.code || "E_UPSTREAM_FAILED";
    await recordStat(env, { event: "resolve_error", code, ipHash: rlKey, shortcode: parsed.shortcode }, ctx);
    return jsonError(code, lang, {
      headers: { ...rateHeaders(rl), "x-request-id": requestId },
      body: { request_id: requestId },
    });
  }
}

async function handleDownload(request, env, lang, requestId, rlKey, limitOverride, ctx) {
  const url = new URL(request.url);
  let parsed;
  try {
    parsed = parseInstagramUrl(url.searchParams.get("url"));
  } catch (e) {
    return jsonError(e.code || "E_INVALID_URL", lang, { body: { request_id: requestId } });
  }
  const quality = url.searchParams.get("quality") || "best";
  const index = url.searchParams.get("index") || "0";
  const isHead = request.method === "HEAD";
  // `inline=1` lets the browser render the media in the page (the UI uses it
  // for the video player); every other request downloads the file.
  const wantsInline = url.searchParams.get("inline") === "1";

  const limits = rateLimits(env);
  const limit = limitOverride || limits.download;
  // A HEAD request must not consume the download quota.
  const rl = isHead
    ? { allowed: true, limit, remaining: limit, reset: Math.floor(Date.now() / 1000) + 60, retryAfter: 0 }
    : await checkRateLimit(env, "download", rlKey, limit);
  if (!rl.allowed) {
    await recordStat(env, { event: "rate_limit", code: "E_RATE_LIMIT", ipHash: rlKey, shortcode: parsed.shortcode }, ctx);
    return rateLimited(lang, requestId, rl);
  }

  let result;
  try {
    const r = await metaForResolve(parsed, env);
    result = r.data;
  } catch (err) {
    return jsonError(err.code || "E_UPSTREAM_FAILED", lang, { body: { request_id: requestId } });
  }

  const picked = resolveVariant(result, quality, index);
  if (picked.error) return jsonError(picked.error, lang, { body: { request_id: requestId } });

  const { variant, index: idx } = picked;
  // Pre-check size cap when upstream advertised a size in metadata.
  if (variant.size && variant.size > maxBytes(env)) {
    return jsonError("E_TOO_LARGE", lang, { body: { request_id: requestId } });
  }

  try {
    const filename = variant.filename || buildFilename(result.author?.username || "instagram", result.shortcode, idx + 1, "mp4");
    const res = await streamMedia(variant.url, request, env, {
      contentDisposition: wantsInline ? null : contentDisposition(filename),
      inline: wantsInline,
      contentType: variant.mime,
    });
    if (!isHead) {
      await recordStat(
        env,
        { event: "download", ipHash: rlKey, shortcode: parsed.shortcode, provider: result.provider },
        ctx,
      );
    }
    const h = new Headers(res.headers);
    for (const [k, v] of Object.entries(rateHeaders(rl))) h.set(k, v);
    h.set("x-request-id", requestId);
    h.set("cache-control", "private, max-age=300");
    return new Response(res.body, { status: res.status, headers: h });
  } catch (err) {
    const code = err.code || "E_UPSTREAM_FAILED";
    if (!isHead) {
      await recordStat(env, { event: "download_error", code, ipHash: rlKey, shortcode: parsed.shortcode }, ctx);
    }
    return jsonError(code, lang, { body: { request_id: requestId } });
  }
}

async function handleThumbnail(request, env, lang, requestId, rlKey, ctx) {
  const url = new URL(request.url);
  const target = url.searchParams.get("url");
  if (!target) return jsonError("E_INVALID_URL", lang, { body: { request_id: requestId } });

  const limits = rateLimits(env);
  const rl = await checkRateLimit(env, "thumbnail", rlKey, limits.thumbnail);
  if (!rl.allowed) {
    return rateLimited(lang, requestId, rl);
  }

  const check = validateProxyUrl(target, env);
  if (!check.ok) return jsonError(check.code, lang, { body: { request_id: requestId } });

  try {
    const res = await streamMedia(target, request, env, {});
    const h = new Headers(res.headers);
    // Signed CDN URLs expire: the thumbnail must never be marked immutable.
    h.set("cache-control", "private, max-age=300");
    h.set("x-request-id", requestId);
    for (const [k, v] of Object.entries(rateHeaders(rl))) h.set(k, v);
    return new Response(res.body, { status: res.status, headers: h });
  } catch (err) {
    await recordStat(env, { event: "thumbnail_error", code: err.code || "E_UPSTREAM_FAILED", ipHash: rlKey }, ctx);
    return jsonError(err.code || "E_UPSTREAM_FAILED", lang, {
      headers: { ...rateHeaders(rl) },
      body: { request_id: requestId },
    });
  }
}

async function handleHealth(request, env, lang, requestId, rlKey, ctx) {
  const url = new URL(request.url);
  const deep = url.searchParams.get("deep") === "1";

  let rl = null;
  if (deep) {
    const limits = rateLimits(env);
    rl = await checkRateLimit(env, "health", rlKey, limits.health);
    if (!rl.allowed) {
      return rateLimited(lang, requestId, rl);
    }
  }

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

  let live = null;
  if (deep) {
    try {
      live = await checkProviderHealth(env);
    } catch (err) {
      await recordStat(env, { event: "health_error", code: "E_UPSTREAM_FAILED", ipHash: rlKey }, ctx);
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
          max_download_mb: Math.round(maxBytes(env) / (1024 * 1024)),
          contact: (env && env.CONTACT_URL) || null,
        },
      },
      requestId,
    ),
    200,
    lang,
    { "cache-control": "no-store", "x-request-id": requestId, ...(rl ? rateHeaders(rl) : {}) },
  );
}

function openApiDocument(env) {
  return {
    openapi: "3.0.3",
    info: {
      title: "insta-worker API",
      version: BUILD,
      description:
        "Fetch public Instagram post/reel/IGTV metadata and stream downloads. Public content only.",
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

/**
 * Admin API. Protected by ADMIN_TOKEN (constant-time comparison) and rate
 * limited independently of the public buckets.
 */
async function handleAdmin(request, env, lang, requestId, rlKey, ctx) {
  const limits = rateLimits(env);
  const rl = await checkRateLimit(env, "admin", rlKey, limits.admin);
  if (!rl.allowed) {
    return rateLimited(lang, requestId, rl);
  }

  const token = bearerToken(request) || request.headers.get("x-admin-token");
  const expected = env && env.ADMIN_TOKEN;
  const unauthorized = () =>
    jsonError("E_UNAUTHORIZED", lang, {
      headers: { ...rateHeaders(rl), "x-request-id": requestId },
      body: { request_id: requestId },
    });
  if (!expected) return unauthorized();
  if (!token || !(await timingSafeEqual(token, expected))) return unauthorized();

  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  if (url.pathname.endsWith("/keys")) {
    if (method === "GET") {
      const keys = await listApiKeys(env);
      return jsonOk({ keys }, lang, {
        headers: { ...rateHeaders(rl), "x-request-id": requestId },
        body: { request_id: requestId },
      });
    }
    if (method === "POST") {
      let body = {};
      try {
        body = await request.json();
      } catch {
        return jsonError("E_INVALID_REQUEST", lang, {
          headers: { ...rateHeaders(rl), "x-request-id": requestId },
          body: { request_id: requestId },
        });
      }
      const key = body && typeof body.key === "string" ? body.key.trim() : "";
      if (!key || key.length < 8 || key.length > 256) {
        return jsonError("E_INVALID_REQUEST", lang, {
          headers: { ...rateHeaders(rl), "x-request-id": requestId },
          body: { request_id: requestId },
        });
      }
      const limit = validateLimitPerMinute(body.limit_per_minute);
      if (!limit.ok) {
        return jsonError("E_INVALID_REQUEST", lang, {
          headers: { ...rateHeaders(rl), "x-request-id": requestId },
          body: { request_id: requestId },
        });
      }
      const label = typeof body.label === "string" ? body.label.slice(0, 100) : null;
      try {
        await createApiKey(env, { key, label, limitPerMinute: limit.value });
        return jsonOk(
          { created: true },
          lang,
          { headers: { ...rateHeaders(rl), "x-request-id": requestId }, body: { request_id: requestId } },
        );
      } catch (err) {
        const code = err && err.code === "E_KEY_DISABLED" ? "E_KEY_DISABLED" : "E_INTERNAL";
        return jsonError(code, lang, {
          headers: { ...rateHeaders(rl), "x-request-id": requestId },
          body: { request_id: requestId },
        });
      }
    }
    if (method === "DELETE") {
      let body = {};
      try {
        body = await request.json();
      } catch {
        return jsonError("E_INVALID_REQUEST", lang, {
          headers: { ...rateHeaders(rl), "x-request-id": requestId },
          body: { request_id: requestId },
        });
      }
      const key = body && typeof body.key === "string" ? body.key.trim() : "";
      if (!key) {
        return jsonError("E_INVALID_REQUEST", lang, {
          headers: { ...rateHeaders(rl), "x-request-id": requestId },
          body: { request_id: requestId },
        });
      }
      try {
        await disableApiKey(env, key);
        return jsonOk(
          { disabled: true },
          lang,
          { headers: { ...rateHeaders(rl), "x-request-id": requestId }, body: { request_id: requestId } },
        );
      } catch {
        return jsonError("E_INTERNAL", lang, {
          headers: { ...rateHeaders(rl), "x-request-id": requestId },
          body: { request_id: requestId },
        });
      }
    }
    return jsonError("E_METHOD", lang, {
      headers: { ...rateHeaders(rl), "x-request-id": requestId, allow: "GET, POST, DELETE, OPTIONS" },
      body: { request_id: requestId },
    });
  }

  return jsonOk({ ok: true }, lang, {
    headers: { ...rateHeaders(rl), "x-request-id": requestId },
    body: { request_id: requestId },
  });
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
      return jsonError("E_INVALID_URL", lang, { body: { request_id: requestId } });
    }
    const path = url.pathname.replace(/\/+$/, "") || "/";

    // Only GET/HEAD for public endpoints.
    const isGetLike = method === "GET" || method === "HEAD";

    try {
      // ---- REST API ----
      if (path.startsWith("/api/")) {
        // The admin API has its own authentication and its own bucket.
        if (path === "/api/v1/admin" || path.startsWith("/api/v1/admin/")) {
          const adminKey = await clientKey(request, env);
          return await handleAdmin(request, env, lang, requestId, adminKey, ctx);
        }

        if (!isGetLike) {
          return jsonError("E_METHOD", lang, {
            headers: { allow: "GET, HEAD, OPTIONS", "x-request-id": requestId },
            body: { request_id: requestId },
          });
        }

        // Resolve rate-limit key (API key or IP hash).
        const auth = await resolveAuthContext(request, env);
        if (auth.disabled) {
          return jsonError("E_KEY_DISABLED", lang, {
            headers: { "x-request-id": requestId },
            body: { request_id: requestId },
          });
        }
        const rlKey = auth.rlKey;

        if (path === "/api/v1/resolve") {
          return await handleResolve(request, env, lang, requestId, rlKey, auth.limit, ctx);
        }
        if (path === "/api/v1/download") {
          return await handleDownload(request, env, lang, requestId, rlKey, auth.limit, ctx);
        }
        if (path === "/api/v1/thumbnail") {
          return await handleThumbnail(request, env, lang, requestId, rlKey, ctx);
        }

        return jsonError("E_NOT_FOUND", lang, { body: { request_id: requestId } });
      }

      if (path === "/health") {
        if (!isGetLike) {
          return jsonError("E_METHOD", lang, {
            headers: { allow: "GET, HEAD, OPTIONS", "x-request-id": requestId },
            body: { request_id: requestId },
          });
        }
        const healthKey = await clientKey(request, env);
        return await handleHealth(request, env, lang, requestId, healthKey, ctx);
      }

      if (path === "/openapi.json") {
        if (!isGetLike) {
          return jsonError("E_METHOD", lang, {
            headers: { allow: "GET, HEAD, OPTIONS", "x-request-id": requestId },
            body: { request_id: requestId },
          });
        }
        const spec = openApiDocument(env);
        return jsonResponse(
          withRequestId({ ok: true, status: 200, lang, data: spec }, requestId),
          200,
          lang,
          { "cache-control": "public, max-age=3600", "x-request-id": requestId },
        );
      }

      if (path === "/robots.txt") {
        if (!isGetLike) {
          return jsonError("E_METHOD", lang, {
            headers: { allow: "GET, HEAD, OPTIONS", "x-request-id": requestId },
            body: { request_id: requestId },
          });
        }
        return new Response("User-agent: *\nAllow: /\n", {
          status: 200,
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "public, max-age=86400",
            "x-request-id": requestId,
          },
        });
      }

      if (path === "/" || path === "/index.html") {
        if (!isGetLike) {
          return jsonError("E_METHOD", lang, {
            headers: { allow: "GET, HEAD, OPTIONS", "x-request-id": requestId },
            body: { request_id: requestId },
          });
        }
        const debug = url.searchParams.get("debug") === "1";
        const scriptNonce = newNonce();
        const styleNonce = newNonce();
        const html = renderHome({
          lang,
          nonce: scriptNonce,
          styleNonce,
          build: BUILD,
          contact: (env && env.CONTACT_URL) || "",
          defaultLang: (env && env.DEFAULT_LANG) || "fa",
          debug,
        });
        return new Response(method === "HEAD" ? null : html, {
          status: 200,
          headers: htmlHeaders(scriptNonce, styleNonce, { "x-request-id": requestId }),
        });
      }

      return jsonError("E_NOT_FOUND", lang, { body: { request_id: requestId } });
    } catch (err) {
      // Never leak stack traces.
      console.error("[worker] unhandled error:", err && err.message);
      return jsonError("E_INTERNAL", lang, { body: { request_id: requestId } });
    }
  },

  /**
   * Scheduled cleanup (Cron trigger): delete statistics older than the
   * retention window so the D1 table cannot grow forever.
   */
  async scheduled(event, env, ctx) {
    const cutoff = Date.now() - STAT_RETENTION_DAYS * 24 * 3600 * 1000;
    try {
      const res = await purgeOldStats(env, cutoff);
      console.log(`[cron] stats purge finished: ${res.deleted} rows older than ${STAT_RETENTION_DAYS} days`);
    } catch (err) {
      console.error("[cron] stats purge failed:", err && err.message);
    }
  },
};
