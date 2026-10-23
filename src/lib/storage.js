// Storage: KV (rate-limit + short-lived cache) and D1 (anonymous stats,
// optional API keys).
//
// Privacy / robustness rules enforced here:
//   * the raw IP is NEVER stored or logged. It is hashed with HMAC-SHA256
//     using IP_HASH_SECRET (a safe built-in default is used when the secret
//     is not configured);
//   * the cache TTL has a hard minimum of 60 seconds (signed media URLs
//     expire, a shorter TTL would only waste upstream quota);
//   * the KV rate limiter is a fixed window and is APPROXIMATE: get + put is
//     not atomic, so a burst can exceed the limit by a few requests;
//   * statistics are written through ctx.waitUntil and can never break a
//     response; failures are counted and logged instead of being swallowed;
//   * the D1 schema is applied idempotently with a backoff, and the very
//     same statements live in migrations/0001_init.sql.

import { newRequestId } from "./http.js";

// ---------------------------------------------------------------------------
// Hashing (never store raw IPs)
// ---------------------------------------------------------------------------

/**
 * Fallback secret used when IP_HASH_SECRET is not configured. It is a
 * constant, therefore IP hashes are comparable across instances — set a
 * private secret in production to avoid that.
 */
export const DEFAULT_IP_HASH_SECRET = "insta-worker-default-ip-hash-secret";

export function ipHashSecret(env) {
  const s = env ? env.IP_HASH_SECRET : undefined;
  return typeof s === "string" && s.length >= 16 ? s : DEFAULT_IP_HASH_SECRET;
}

export async function sha256Hex(input) {
  const data = new TextEncoder().encode(String(input));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(String(message)));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The per-client bucket key.
 *
 * The IP is hashed with HMAC (keyed, so the hash cannot be brute forced from
 * a leaked table). When no IP header is available we do NOT fall back to a
 * shared "0.0.0.0" bucket — that would put every anonymous client into the
 * same rate-limit bucket. Instead we derive a coarse bucket from the client
 * headers that are available.
 */
export async function clientKey(request, env) {
  const secret = ipHashSecret(env);
  const ip =
    request.headers.get("cf-connecting-ip") ||
    (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "";
  if (ip) return "ip:" + (await hmacHex(secret, "ip:" + ip));
  const coarse = [
    request.headers.get("user-agent") || "",
    request.headers.get("accept-language") || "",
    request.headers.get("cf-ray") || "",
  ].join("|");
  return "anon:" + (await hmacHex(secret, "coarse:" + coarse));
}

/** Hash of an API key. Only the hash is ever stored. */
export async function apiKeyHash(env, key) {
  const secret = ipHashSecret(env);
  return hmacHex(secret, "apikey:" + key);
}

// ---------------------------------------------------------------------------
// Rate limiting (fixed window per minute — APPROXIMATE)
// ---------------------------------------------------------------------------

/** Error counters, exposed for /health and for the tests. */
export const COUNTERS = {
  kvErrors: 0,
  d1Errors: 0,
  schemaErrors: 0,
  statErrors: 0,
};

function numEnv(env, name, fallback) {
  const raw = env ? env[name] : undefined;
  const n = Number(raw);
  if (raw === undefined || raw === null || raw === "" || !Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

/**
 * The configured limits per bucket. Invalid values fall back to the default.
 */
export function rateLimits(env) {
  return {
    resolve: numEnv(env, "RATE_LIMIT_PER_MINUTE", 60),
    download: numEnv(env, "RATE_LIMIT_DOWNLOAD_PER_MINUTE", 20),
    thumbnail: numEnv(env, "RATE_LIMIT_THUMBNAIL_PER_MINUTE", 60),
    admin: numEnv(env, "RATE_LIMIT_ADMIN_PER_MINUTE", 10),
    health: numEnv(env, "RATE_LIMIT_HEALTH_PER_MINUTE", 10),
  };
}

/**
 * Fixed-window rate limiter.
 *
 * NOTE: this is approximate. The read (get) and the write (put) are two
 * separate KV operations and are not atomic, so a burst of parallel requests
 * can exceed the limit by a small number. It is good enough to stop casual
 * abuse, it is NOT a hard quota.
 *
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
  } catch (err) {
    // Degrade instead of failing the request, but make the failure visible.
    COUNTERS.kvErrors++;
    console.error(`[storage] rate limit check failed for bucket ${bucket}:`, err && err.message);
    return { allowed: true, limit, remaining: limit, reset, retryAfter: 0, degraded: true };
  }
}

export function rateHeaders(rl) {
  const h = {};
  if (rl && Number.isFinite(rl.limit)) {
    h["x-ratelimit-limit"] = String(rl.limit);
    h["x-ratelimit-remaining"] = String(Math.max(0, rl.remaining));
    h["x-ratelimit-reset"] = String(rl.reset);
  }
  if (rl && !rl.allowed) h["retry-after"] = String(rl.retryAfter || 60);
  return h;
}

// ---------------------------------------------------------------------------
// Short-lived metadata cache (signed URLs expire -> very short TTL)
// ---------------------------------------------------------------------------

export const MIN_CACHE_TTL = 60;
export const MAX_CACHE_TTL = 900;

export function cacheTtl(env) {
  const raw = env ? env.CACHE_TTL_SECONDS : undefined;
  const n = Number(raw);
  if (raw === undefined || raw === null || raw === "" || !Number.isFinite(n) || n <= 0) return 120;
  return Math.min(MAX_CACHE_TTL, Math.max(MIN_CACHE_TTL, Math.floor(n)));
}

export async function cacheGet(env, shortcode) {
  if (!env || !env.KV) return null;
  try {
    const raw = await env.KV.get(`cache:resolve:${shortcode}`, "text");
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    COUNTERS.kvErrors++;
    console.error(`[storage] cache read failed for ${shortcode}:`, err && err.message);
    return null;
  }
}

export async function cacheSet(env, shortcode, value) {
  if (!env || !env.KV) return;
  try {
    await env.KV.put(`cache:resolve:${shortcode}`, JSON.stringify(value), { expirationTtl: cacheTtl(env) });
  } catch (err) {
    COUNTERS.kvErrors++;
    console.error(`[storage] cache write failed for ${shortcode}:`, err && err.message);
  }
}

/**
 * A STRONG ETag: the SHA-256 of the serialised payload. Strong validators
 * may be used for range requests and are never confused with a weak one.
 */
export async function etagFrom(value) {
  const str = JSON.stringify(value);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `"sha256-${hex}"`;
}

// ---------------------------------------------------------------------------
// D1: schema + anonymous stats (idempotent, auto-migrate once per isolate)
// ---------------------------------------------------------------------------

/**
 * The schema statements. They are kept in sync with
 * migrations/0001_init.sql (a test asserts that).
 */
export const SCHEMA = [
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

const SCHEMA_STATE = { ready: false, attempts: 0, nextAttemptAt: 0 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Apply the schema idempotently. Failures are retried with a backoff and
 * then reported; the service keeps working without statistics.
 */
export async function ensureSchema(env) {
  if (!env || !env.DB) return false;
  if (SCHEMA_STATE.ready) return true;
  const now = Date.now();
  if (SCHEMA_STATE.nextAttemptAt && now < SCHEMA_STATE.nextAttemptAt) return false;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      for (const stmt of SCHEMA) {
        await env.DB.prepare(stmt).run();
      }
      SCHEMA_STATE.ready = true;
      SCHEMA_STATE.attempts = 0;
      SCHEMA_STATE.nextAttemptAt = 0;
      return true;
    } catch (err) {
      SCHEMA_STATE.attempts++;
      COUNTERS.schemaErrors++;
      console.error(`[storage] ensureSchema failed (attempt ${attempt + 1}/${3}):`, err && err.message);
      if (attempt < 2) await sleep(100 * Math.pow(2, attempt));
    }
  }
  // Do not hammer D1 on every request.
  SCHEMA_STATE.nextAttemptAt = Date.now() + 30_000;
  return false;
}

/**
 * Write one anonymous statistic. Never throws: a failing statistic must not
 * break the response. When a Workers context is available the write is
 * handed to ctx.waitUntil so it does not delay the answer.
 */
export function recordStat(env, payload, ctx) {
  const { event, code, ipHash, shortcode, provider } = payload || {};
  if (!env || !env.DB || !event) return Promise.resolve();
  const run = async () => {
    try {
      await ensureSchema(env);
      await env.DB.prepare(
        "INSERT INTO stats (ts, event, code, ip_hash, shortcode, provider) VALUES (?, ?, ?, ?, ?, ?)",
      )
        .bind(Date.now(), event, code || null, ipHash || null, shortcode || null, provider || null)
        .run();
    } catch (err) {
      COUNTERS.statErrors++;
      console.error(`[storage] recordStat(${event}) failed:`, err && err.message);
    }
  };
  if (ctx && typeof ctx.waitUntil === "function") {
    try {
      ctx.waitUntil(run());
      return Promise.resolve();
    } catch (err) {
      COUNTERS.statErrors++;
      console.error("[storage] waitUntil failed:", err && err.message);
    }
  }
  return run();
}

/**
 * Delete statistics older than `cutoffTs`. Used by the scheduled Cron
 * trigger so the D1 table cannot grow forever.
 */
export async function purgeOldStats(env, cutoffTs) {
  if (!env || !env.DB) return { deleted: 0 };
  try {
    await ensureSchema(env);
    const cutoff = Number.isFinite(Number(cutoffTs)) ? Number(cutoffTs) : Date.now() - 30 * 24 * 3600 * 1000;
    const res = await env.DB.prepare("DELETE FROM stats WHERE ts < ?").bind(cutoff).run();
    const deleted = res && typeof res.meta === "object" && res.meta && Number.isFinite(res.meta.changes)
      ? res.meta.changes
      : 0;
    return { deleted };
  } catch (err) {
    COUNTERS.d1Errors++;
    console.error("[storage] purgeOldStats failed:", err && err.message);
    return { deleted: 0, error: String((err && err.message) || err) };
  }
}

// ---------------------------------------------------------------------------
// API keys (optional, D1-backed) — only the hash is stored
// ---------------------------------------------------------------------------

export const MAX_KEY_LIMIT_PER_MINUTE = 10_000;

export async function lookupApiKey(env, key) {
  if (!env || !env.DB || !key) return null;
  try {
    await ensureSchema(env);
    const hash = await apiKeyHash(env, key);
    const row = await env.DB.prepare(
      "SELECT key_hash, label, limit_per_minute, disabled FROM api_keys WHERE key_hash = ?",
    )
      .bind(hash)
      .first();
    if (!row) return null;
    return {
      found: true,
      disabled: !!row.disabled,
      label: row.label || null,
      limitPerMinute: Number.isFinite(Number(row.limit_per_minute)) && Number(row.limit_per_minute) > 0
        ? Math.floor(Number(row.limit_per_minute))
        : null,
    };
  } catch (err) {
    COUNTERS.d1Errors++;
    console.error("[storage] lookupApiKey failed:", err && err.message);
    return null;
  }
}

/**
 * Validate a per-key limit. Returns {ok, value} — the limit must be an
 * integer between 1 and MAX_KEY_LIMIT_PER_MINUTE.
 */
export function validateLimitPerMinute(value) {
  if (value === undefined || value === null || value === "") return { ok: true, value: null };
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > MAX_KEY_LIMIT_PER_MINUTE) {
    return { ok: false, value: null };
  }
  return { ok: true, value: n };
}

/**
 * Create (or update the label / limit of) an API key.
 *
 * A disabled key can never be re-enabled: the attempt is rejected with
 * E_KEY_DISABLED. Only the HMAC hash of the key is stored.
 */
export async function createApiKey(env, { key, label, limitPerMinute }) {
  if (!env || !env.DB) {
    const err = new Error("no_database");
    err.code = "E_INTERNAL";
    throw err;
  }
  const hash = await apiKeyHash(env, key);
  await ensureSchema(env);

  const existing = await env.DB.prepare("SELECT key_hash, disabled FROM api_keys WHERE key_hash = ?")
    .bind(hash)
    .first();
  if (existing && existing.disabled) {
    const err = new Error("key_disabled");
    err.code = "E_KEY_DISABLED";
    throw err;
  }

  await env.DB.prepare(
    "INSERT INTO api_keys (key_hash, label, limit_per_minute, created_at, disabled) VALUES (?, ?, ?, ?, 0) ON CONFLICT(key_hash) DO UPDATE SET label=excluded.label, limit_per_minute=excluded.limit_per_minute",
  )
    .bind(hash, label || null, limitPerMinute || null, Date.now())
    .run();
  return { hash };
}

/**
 * Disable an API key. Disabled keys stay disabled forever.
 */
export async function disableApiKey(env, key) {
  if (!env || !env.DB) {
    const err = new Error("no_database");
    err.code = "E_INTERNAL";
    throw err;
  }
  const hash = await apiKeyHash(env, key);
  await ensureSchema(env);
  await env.DB.prepare("UPDATE api_keys SET disabled = 1 WHERE key_hash = ?").bind(hash).run();
  return { hash };
}

/**
 * List the API keys. Only labels, limits and state are returned — never a
 * hash and never a key.
 */
export async function listApiKeys(env) {
  if (!env || !env.DB) return [];
  try {
    await ensureSchema(env);
    const res = await env.DB.prepare(
      "SELECT label, limit_per_minute, created_at, disabled FROM api_keys ORDER BY created_at DESC LIMIT 200",
    ).all();
    const rows = (res && res.results) || [];
    return rows.map((r) => ({
      label: r.label || null,
      limit_per_minute: Number.isFinite(Number(r.limit_per_minute)) ? Number(r.limit_per_minute) : null,
      created_at: r.created_at || null,
      disabled: !!r.disabled,
    }));
  } catch (err) {
    COUNTERS.d1Errors++;
    console.error("[storage] listApiKeys failed:", err && err.message);
    return [];
  }
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
