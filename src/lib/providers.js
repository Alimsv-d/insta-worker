// Provider layer: ordered list of upstreams with timeout, retry/backoff,
// per-provider circuit breaker and health tracking. Returns normalised results.

import { normalizeUpstream } from "./normalize.js";

const DEFAULT_UPSTREAM = "https://catplus.ir/api/insta";

const STATE = {
  // name -> { failures, openedAt, halfOpen }
  breaker: new Map(),
  health: new Map(),
};

const BREAKER_THRESHOLD = 3;
const BREAKER_COOLDOWN_MS = 30_000;

export function parseUpstreams(env) {
  const raw = (env && env.UPSTREAM_URLS) || DEFAULT_UPSTREAM;
  return String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function providerName(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function breakerFor(name) {
  let b = STATE.breaker.get(name);
  if (!b) {
    b = { failures: 0, openedAt: 0 };
    STATE.breaker.set(name, b);
  }
  return b;
}

export function breakerOpen(name) {
  const b = breakerFor(name);
  if (b.failures < BREAKER_THRESHOLD) return false;
  if (Date.now() - b.openedAt > BREAKER_COOLDOWN_MS) {
    // half-open: allow one probe
    b.failures = BREAKER_THRESHOLD - 1;
    return false;
  }
  return true;
}

export function recordSuccess(name) {
  const b = breakerFor(name);
  b.failures = 0;
  STATE.health.set(name, { ok: true, at: Date.now() });
}

export function recordFailure(name) {
  const b = breakerFor(name);
  b.failures += 1;
  if (b.failures >= BREAKER_THRESHOLD) b.openedAt = Date.now();
  STATE.health.set(name, { ok: false, at: Date.now() });
}

export function providerHealthSnapshot() {
  const out = {};
  for (const [name, h] of STATE.health.entries()) out[name] = { ...h, breaker_open: breakerOpen(name) };
  return out;
}

export function resetProviderState() {
  STATE.breaker.clear();
  STATE.health.clear();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function buildUrl(base, target) {
  const u = new URL(base);
  u.searchParams.set("url", target);
  return u.toString();
}

/**
 * Call one provider with retry/backoff. Returns {payload} or throws.
 */
async function callProvider(name, base, target, { fetchImpl, timeoutMs, token, attempts = 2 }) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = { accept: "application/json", "user-agent": "insta-worker/1.0 (+https://github.com/Alimsv-d/insta-worker)" };
      if (token) headers.authorization = `Bearer ${token}`;
      const res = await fetchImpl(buildUrl(base, target), { headers, signal: controller.signal, redirect: "follow" });
      clearTimeout(timer);
      if (res.status === 404) {
        const err = new Error("not_found");
        err.code = "E_PRIVATE_OR_NOT_FOUND";
        throw err;
      }
      if (!res.ok) throw new Error(`upstream_status_${res.status}`);
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error("upstream_bad_json");
      }
      return json;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (err.code === "E_PRIVATE_OR_NOT_FOUND") break; // no point retrying
      if (i < attempts - 1) await sleep(200 * Math.pow(2, i));
    }
  }
  throw lastErr || new Error("upstream_failed");
}

/**
 * Resolve content by trying providers in order. Returns {result, provider} or null.
 * @param {{kind:string,shortcode:string,canonical:string}} ctx
 */
export async function resolveContent(ctx, env, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const providers = options.providers || parseUpstreams(env);
  const timeoutMs = Number((env && env.UPSTREAM_TIMEOUT_MS) || 12000);
  const token = env && env.UPSTREAM_TOKEN;
  const attempts = options.attempts || 2;

  let sawNotFound = false;

  for (const base of providers) {
    const name = providerName(base);
    if (breakerOpen(name)) continue;
    try {
      const payload = await callProvider(name, base, ctx.canonical, { fetchImpl, timeoutMs, token, attempts });
      const normalized = normalizeUpstream(payload, ctx, name);
      if (normalized) {
        recordSuccess(name);
        return normalized;
      }
      // Upstream answered but with no usable media.
      sawNotFound = true;
      recordSuccess(name);
    } catch (err) {
      if (err && err.code === "E_PRIVATE_OR_NOT_FOUND") {
        sawNotFound = true;
        recordSuccess(name);
        continue;
      }
      recordFailure(name);
    }
  }

  if (sawNotFound && providers.length > 0) {
    const err = new Error("private_or_not_found");
    err.code = "E_PRIVATE_OR_NOT_FOUND";
    throw err;
  }
  const err = new Error("upstream_failed");
  err.code = "E_UPSTREAM_FAILED";
  throw err;
}

export async function checkProviderHealth(env, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const providers = parseUpstreams(env);
  const timeoutMs = Math.min(5000, Number((env && env.UPSTREAM_TIMEOUT_MS) || 12000));
  const results = [];
  for (const base of providers) {
    const name = providerName(base);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const started = Date.now();
    try {
      // Use a well-known public reel; providers usually respond fast.
      const res = await fetchImpl(buildUrl(base, "https://www.instagram.com/reel/DEADBEEF/"), {
        method: "GET",
        signal: controller.signal,
        redirect: "follow",
      });
      clearTimeout(timer);
      results.push({ provider: name, reachable: true, status: res.status, latency_ms: Date.now() - started });
    } catch (e) {
      clearTimeout(timer);
      results.push({ provider: name, reachable: false, error: String(e && e.message), latency_ms: Date.now() - started });
    }
  }
  return results;
}
