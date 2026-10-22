// Storage: KV (rate-limit + short-lived cache) and D1 (anonymous stats,
// optional API keys). Every operation degrades gracefully: if KV or D1 is
// missing or errors, the service keeps working.

import { newRequestId } from "./http.js";

// ---------------------------------------------------------------------------
// Hashing (never store raw IPs)
// ---------------------------------------------------------------------------

export async function sha256Hex(input) {
  const data = new TextEncoder().encode(String(input));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function clientKey(request) {
  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "0.0.0.0";
  return sha256Hex("ip:" + ip);
}

// ---------------------------------------------------------------------------
// Rate limiting (fixed window per minute)
// ---------------------------------------------------------------------------

export function rateLimits(env) {
  return {
    resolve: Number((env && env.RATE_LIMIT_PER_MINUTE) || 60),
    download: Number((env && env.RATE_LIMIT_DOWNLOAD_PER_MINUTE) || 20),
  };
}

/**
 * @returns {{allowed:boolean, limit:number, remaining:number, reset:number, retryAfter:number}}
 */
export async function checkRateLimit(env, bucket, key, limit) {
  const nowSec = Math.floor(Date.now() / 1000);
  const windowStart = nowSec - (nowSec % 60);
  const reset = windowStart + 60;

  if (!env || !env.KV || !Number.isFinite(limit) || limit <= 0) {
    return { allowed: true, limit: limit || Infinity, remaining: limit || Infinity, reset, retryAfter: 0, degraded: true };
  }

  const kvKey = `rl:${bucket}:${key}:${windowStart}`;
  try {
    const current = Number((await env.KV.get(kvKey)) || 0);
    if (current >= limit) {
      return { allowed: false, limit, remaining: 0, reset, retryAfter: Math.max(1, reset - nowSec) };
    }
    const next = current + 1;
    await env.KV.put(kvKey, String(next), { expirationTtl: 120 });
    return { allowed: true, limit, remaining: Math.max(0, limit - next), reset, retryAfter: 0 };
  } catch {
    return { allowed: true, limit, remaining: limit, reset, retryAfter: 0, degraded: true };
  }
}

export function rateHeaders(rl) {
  const h = {};
  if (Number.isFinite(rl.limit)) {
    h["x-ratelimit-limit"] = String(rl.limit);
    h["x-ratelimit-remaining"] = String(Math.max(0, rl.remaining));
    h["x-ratelimit-reset"] = String(rl.reset);
  }
  if (!rl.allowed) h["retry-after"] = String(rl.retryAfter || 60);
  return h;
}

// ---------------------------------------------------------------------------
// Short-lived metadata cache (signed URLs expire -> very short TTL)
// ---------------------------------------------------------------------------

export function cacheTtl(env) {
  const t = Number((env && env.CACHE_TTL_SECONDS) || 120);
  return Number.isFinite(t) && t > 0 ? Math.min(t, 900) : 120;
}

export async function cacheGet(env, shortcode) {
  if (!env || !env.KV) return null;
  try {
    const raw = await env.KV.get(`cache:resolve:${shortcode}`, "text");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function cacheSet(env, shortcode, value) {
  if (!env || !env.KV) return;
  try {
    await env.KV.put(`cache:resolve:${shortcode}`, JSON.stringify(value), { expirationTtl: cacheTtl(env) });
  } catch {
    // ignore
  }
}

function etagFrom(value) {
  // Cheap deterministic etag from the serialized payload.
  const str = JSON.stringify(value);
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return 'W/"' + (h >>> 0).toString(16) + '"';
}

export { etagFrom };

// ---------------------------------------------------------------------------
// D1: schema + anonymous stats (idempotent, auto-migrate once per isolate)
// ---------------------------------------------------------------------------

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS stats (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     ts INTEGER NOT NULL,
     event TEXT NOT NULL,
     code TEXT,
     ip_hash TEXT,
     shortcode TEXT,
     provider TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_stats_ts ON stats(ts)`,
  `CREATE INDEX IF NOT EXISTS idx_stats_event ON stats(event)`,
  `CREATE TABLE IF NOT EXISTS api_keys (
     key_hash TEXT PRIMARY KEY,
     label TEXT,
     limit_per_minute INTEGER,
     created_at INTEGER,
     disabled INTEGER DEFAULT 0
   )`,
];

let schemaReady = false;

export async function ensureSchema(env) {
  if (schemaReady || !env || !env.DB) return;
  try {
    for (const stmt of SCHEMA) {
      await env.DB.prepare(stmt).run();
    }
    schemaReady = true;
  } catch {
    // degrade: stats disabled but service stays up
  }
}

export async function recordStat(env, { event, code, ipHash, shortcode, provider }) {
  if (!env || !env.DB) return;
  try {
    await ensureSchema(env);
    await env.DB.prepare(
      "INSERT INTO stats (ts, event, code, ip_hash, shortcode, provider) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind(Date.now(), event, code || null, ipHash || null, shortcode || null, provider || null)
      .run();
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// API keys (optional, D1-backed)
// ---------------------------------------------------------------------------

export async function lookupApiKey(env, key) {
  if (!env || !env.DB || !key) return null;
  try {
    await ensureSchema(env);
    const hash = await sha256Hex("key:" + key);
    const row = await env.DB.prepare(
      "SELECT key_hash, label, limit_per_minute, disabled FROM api_keys WHERE key_hash = ?",
    )
      .bind(hash)
      .first();
    if (!row || row.disabled) return null;
    return { label: row.label, limitPerMinute: row.limit_per_minute || null };
  } catch {
    return null;
  }
}

export async function createApiKey(env, { key, label, limitPerMinute }) {
  await ensureSchema(env);
  const hash = await sha256Hex("key:" + key);
  await env.DB.prepare(
    "INSERT INTO api_keys (key_hash, label, limit_per_minute, created_at, disabled) VALUES (?, ?, ?, ?, 0) ON CONFLICT(key_hash) DO UPDATE SET label=excluded.label, limit_per_minute=excluded.limit_per_minute, disabled=0",
  )
    .bind(hash, label || null, limitPerMinute || null, Date.now())
    .run();
  return { hash };
}

export function bearerToken(request) {
  const h = request.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

export function apiKey(request) {
  return request.headers.get("x-api-key") || bearerToken(request);
}

export { newRequestId };
