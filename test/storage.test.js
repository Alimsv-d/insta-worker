import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkRateLimit,
  rateLimits,
  rateHeaders,
  etagFrom,
  sha256Hex,
  clientKey,
  ensureSchema,
} from "../src/lib/storage.js";

// Minimal in-memory KV stub.
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

test("checkRateLimit blocks after limit is reached", async () => {
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
  const other = await checkRateLimit(env, "download", "a", 1);
  assert.equal(other.allowed, true);
});

test("checkRateLimit degrades without KV", async () => {
  const r = await checkRateLimit({}, "resolve", "a", 5);
  assert.equal(r.allowed, true);
  assert.equal(r.degraded, true);
});

test("rateLimits reads env with defaults", () => {
  assert.deepEqual(rateLimits({}), { resolve: 60, download: 20 });
  assert.deepEqual(rateLimits({ RATE_LIMIT_PER_MINUTE: "5", RATE_LIMIT_DOWNLOAD_PER_MINUTE: "2" }), { resolve: 5, download: 2 });
});

test("etag is stable and well-formed", () => {
  const a = etagFrom({ x: 1 });
  const b = etagFrom({ x: 1 });
  const c = etagFrom({ x: 2 });
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^W\/"[0-9a-f]+"$/);
});

test("sha256Hex is deterministic and 64 hex chars", async () => {
  const h = await sha256Hex("hello");
  assert.equal(h.length, 64);
  assert.equal(h, await sha256Hex("hello"));
});

test("clientKey hashes the IP (never raw)", async () => {
  const req = new Request("https://w/", { headers: { "cf-connecting-ip": "1.2.3.4" } });
  const key = await clientKey(req);
  assert.ok(!key.includes("1.2.3.4"));
  assert.equal(key.length, 64);
});

test("ensureSchema degrades without D1", async () => {
  await assert.doesNotReject(() => ensureSchema({}));
});
