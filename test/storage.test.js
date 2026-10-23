import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkRateLimit,
  rateLimits,
  rateHeaders,
  etagFrom,
  sha256Hex,
  clientKey,
  apiKeyBucket,
  cacheTtl,
  MIN_CACHE_TTL,
  MAX_CACHE_TTL,
} from "../src/lib/storage.js";

function kvStub() {
  const map = new Map();
  return {
    async get(k) {
      return map.has(k) ? map.get(k) : null;
    },
    async put(k, v) {
      map.set(k, v);
    },
    _map: map,
  };
}

test("checkRateLimit blocks after the limit is reached and exposes Retry-After", async () => {
  const env = { KV: kvStub() };
  for (let i = 0; i < 3; i++) {
    const r = await checkRateLimit(env, "resolve", "user1", 3);
    assert.equal(r.allowed, true);
  }
  const blocked = await checkRateLimit(env, "resolve", "user1", 3);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfter >= 1);
  const headers = rateHeaders(blocked);
  assert.equal(headers["retry-after"], String(blocked.retryAfter));
  assert.equal(headers["x-ratelimit-remaining"], "0");
});

test("checkRateLimit isolates buckets and keys", async () => {
  const env = { KV: kvStub() };
  await checkRateLimit(env, "resolve", "a", 1);
  assert.equal((await checkRateLimit(env, "download", "a", 1)).allowed, true);
  assert.equal((await checkRateLimit(env, "resolve", "b", 1)).allowed, true);
});

test("checkRateLimit degrades without KV", async () => {
  const r = await checkRateLimit({}, "resolve", "a", 5);
  assert.equal(r.allowed, true);
  assert.equal(r.degraded, true);
});

test("rateLimits reads env with defaults and no admin bucket", () => {
  assert.deepEqual(rateLimits({}), { resolve: 60, download: 20, thumbnail: 60, health: 10 });
  assert.deepEqual(rateLimits({ RATE_LIMIT_PER_MINUTE: "5", RATE_LIMIT_DOWNLOAD_PER_MINUTE: "2" }), {
    resolve: 5,
    download: 2,
    thumbnail: 60,
    health: 10,
  });
  assert.equal(rateLimits({ RATE_LIMIT_PER_MINUTE: "-1" }).resolve, 60);
  assert.equal(rateLimits({ RATE_LIMIT_HEALTH_PER_MINUTE: "abc" }).health, 10);
});

test("etag is strong, stable and well-formed", async () => {
  const a = await etagFrom({ x: 1 });
  const b = await etagFrom({ x: 1 });
  const c = await etagFrom({ x: 2 });
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^"sha256-[0-9a-f]{64}"$/);
  assert.ok(!a.startsWith("W/"));
});

test("sha256Hex is deterministic and 64 hex chars", async () => {
  const h = await sha256Hex("hello");
  assert.equal(h.length, 64);
  assert.equal(h, await sha256Hex("hello"));
});

test("clientKey hashes the IP (never raw) and prefixes the bucket", async () => {
  const a = await clientKey(new Request("https://w/", { headers: { "cf-connecting-ip": "1.2.3.4" } }));
  const b = await clientKey(new Request("https://w/", { headers: { "cf-connecting-ip": "1.2.3.4" } }));
  const c = await clientKey(new Request("https://w/", { headers: { "cf-connecting-ip": "5.6.7.8" } }));
  assert.ok(!a.includes("1.2.3.4"));
  assert.match(a, /^ip:[0-9a-f]{64}$/);
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test("clientKey never shares one bucket for unknown clients", async () => {
  const a = await clientKey(new Request("https://w/"));
  const b = await clientKey(new Request("https://w/"));
  assert.match(a, /^anon:[0-9a-f]{64}$/);
  assert.notEqual(a, b);

  const ua1 = await clientKey(new Request("https://w/", { headers: { "user-agent": "agent-a" } }));
  const ua2 = await clientKey(new Request("https://w/", { headers: { "user-agent": "agent-b" } }));
  assert.notEqual(ua1, ua2);
});

test("apiKeyBucket is prefixed and does not contain the raw key", async () => {
  const bucket = await apiKeyBucket({}, "super-secret-key-value");
  assert.match(bucket, /^key:[0-9a-f]{64}$/);
  assert.ok(!bucket.includes("super-secret-key-value"));
});

test("cache TTL is clamped to at least 60 seconds", () => {
  assert.equal(MIN_CACHE_TTL, 60);
  assert.equal(MAX_CACHE_TTL, 900);
  assert.equal(cacheTtl({ CACHE_TTL_SECONDS: "1" }), 60);
  assert.equal(cacheTtl({ CACHE_TTL_SECONDS: "-10" }), 120);
  assert.equal(cacheTtl({ CACHE_TTL_SECONDS: "99999" }), 900);
  assert.equal(cacheTtl({ CACHE_TTL_SECONDS: "abc" }), 120);
  assert.equal(cacheTtl({}), 120);
});
