import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.js";
import { resetProviderState } from "../src/lib/providers.js";

function kvStub() {
  const map = new Map();
  return {
    async get(k) {
      return map.has(k) ? map.get(k) : null;
    },
    async put(k, v) {
      map.set(k, v);
    },
  };
}

const env = {
  KV: kvStub(),
  UPSTREAM_URLS: "https://catplus.ir/api/insta",
  RATE_LIMIT_PER_MINUTE: "1000",
  RATE_LIMIT_DOWNLOAD_PER_MINUTE: "1000",
  RATE_LIMIT_THUMBNAIL_PER_MINUTE: "1000",
  RATE_LIMIT_HEALTH_PER_MINUTE: "1000",
  MAX_DOWNLOAD_MB: "80",
  CDN_ALLOWLIST: "*.cdninstagram.com,*.fbcdn.net",
  ALLOWED_ORIGINS: "*",
};

const ctx = {};
const call = (path, init, e = env) => worker.fetch(new Request("https://worker.example" + path, init), e, ctx);

function upstreamJson(payload) {
  return new Response(JSON.stringify(payload), { headers: { "content-type": "application/json" } });
}

function mockUpstreamAndCdn(media = "BINARY", mediaHeaders = {}) {
  return async (u) => {
    if (String(u).includes("/api/insta")) {
      return upstreamJson({ video: [{ video: "https://scontent.cdninstagram.com/v.mp4" }] });
    }
    return new Response(media, {
      status: 200,
      headers: { "content-type": "video/mp4", "content-length": "6", "accept-ranges": "bytes", ...mediaHeaders },
    });
  };
}

test("GET / returns a short JSON service summary", async () => {
  const res = await call("/");
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.data.name, "insta-worker");
  assert.equal(body.data.auth_required, false);
  assert.ok(body.data.endpoints.some((e) => e.path === "/api/v1/resolve"));
  assert.equal(body.data.openapi, "/openapi.json");
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
});

test("GET /health reports KV-only storage and no mandatory secrets", async () => {
  const res = await call("/health");
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.deepEqual(body.data.storage, { kv: true });
  assert.equal(body.data.auth_required, false);
  assert.equal(body.data.limits.resolve, 1000);
  assert.equal(body.data.max_download_mb, 80);
  assert.equal(Array.isArray(body.data.providers), true);
  assert.equal(body.data.provider_live, undefined);
});

test("GET /openapi.json serves the spec with a public cache", async () => {
  const res = await call("/openapi.json");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "public, max-age=3600");
  const body = await res.json();
  assert.equal(body.data.openapi, "3.0.3");
  assert.ok(body.data.paths["/api/v1/download"]);
});

test("OPTIONS returns a CORS preflight", async () => {
  const res = await call("/api/v1/resolve", { method: "OPTIONS" });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
  assert.match(res.headers.get("access-control-allow-methods") || "", /GET/);
});

test("an explicit ALLOWED_ORIGINS list echoes only matching origins", async () => {
  const e = { ...env, KV: kvStub(), ALLOWED_ORIGINS: "https://app.example, https://second.example/" };
  const ok = await call("/health", { headers: { origin: "https://app.example" } }, e);
  assert.equal(ok.headers.get("access-control-allow-origin"), "https://app.example");
  assert.equal(ok.headers.get("vary"), "Origin");

  const no = await call("/health", { headers: { origin: "https://evil.example" } }, e);
  assert.equal(no.headers.get("access-control-allow-origin"), null);
});

test("resolve rejects an invalid URL with English by default", async () => {
  const res = await call("/api/v1/resolve?url=" + encodeURIComponent("https://evil.com/p/Ab12/"));
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "E_INVALID_URL");
  assert.equal(body.lang, "en");
  assert.match(body.error.message, /Invalid link/);
  assert.ok(body.request_id);
});

test("resolve honours ?lang=fa for API error text", async () => {
  const res = await call("/api/v1/resolve?lang=fa&url=" + encodeURIComponent("https://evil.com/p/Ab12/"));
  const body = await res.json();
  assert.equal(body.lang, "fa");
  assert.match(body.error.message, /لینک/);
});

test("unknown routes return E_NOT_FOUND; non-GET returns E_METHOD", async () => {
  const api = await call("/api/v1/nope");
  assert.equal(api.status, 404);
  const apiBody = await api.json();
  assert.equal(apiBody.error.code, "E_NOT_FOUND");
  assert.equal(api.headers.get("x-request-id"), apiBody.request_id);

  const root = await call("/nope");
  assert.equal(root.status, 404);

  const post = await call("/api/v1/resolve", { method: "POST" });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get("allow"), "GET, HEAD, OPTIONS");
  assert.equal((await post.json()).error.code, "E_METHOD");
});

test("download without url and thumbnail with a bad host are rejected", async () => {
  const noUrl = await call("/api/v1/download");
  assert.equal(noUrl.status, 400);
  assert.equal((await noUrl.json()).error.code, "E_INVALID_URL");

  const badHost = await call("/api/v1/thumbnail?url=" + encodeURIComponent("https://evil.com/a.jpg"));
  assert.equal(badHost.status, 400);
  assert.equal((await badHost.json()).error.code, "E_NOT_ALLOWED_HOST");
});

test("rate limit returns 429 with Retry-After and CORS", async () => {
  const tightEnv = { ...env, KV: kvStub(), RATE_LIMIT_PER_MINUTE: "1" };
  const path = "/api/v1/resolve?url=" + encodeURIComponent("https://www.instagram.com/reel/Rate1/");
  const init = { headers: { "cf-connecting-ip": "203.0.113.9" } };
  const orig = globalThis.fetch;
  globalThis.fetch = mockUpstreamAndCdn();
  try {
    assert.equal((await call(path, init, tightEnv)).status, 200);
    const res = await call(path, init, tightEnv);
    assert.equal(res.status, 429);
    assert.ok(Number(res.headers.get("retry-after")) >= 1);
    assert.equal(res.headers.get("access-control-allow-origin"), "*");
    assert.equal((await res.json()).error.code, "E_RATE_LIMIT");
  } finally {
    globalThis.fetch = orig;
  }
});

test("second resolve is served from KV (x-cache HIT)", async () => {
  resetProviderState();
  const e = { ...env, KV: kvStub() };
  const url = "https://www.instagram.com/reel/Cache1/";
  const calls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (u) => {
    calls.push(String(u));
    return upstreamJson({ video: [{ video: "https://scontent.cdninstagram.com/v.mp4" }] });
  };
  try {
    const p = "/api/v1/resolve?url=" + encodeURIComponent(url);
    const r1 = await call(p, undefined, e);
    assert.equal(r1.status, 200);
    assert.equal(r1.headers.get("x-cache"), "MISS");
    const r2 = await call(p, undefined, e);
    assert.equal(r2.status, 200);
    assert.equal(r2.headers.get("x-cache"), "HIT");
    assert.equal(calls.length, 1, "upstream should be called once");
  } finally {
    globalThis.fetch = orig;
  }
});

test("resolve carries a strong ETag and answers If-None-Match with 304", async () => {
  resetProviderState();
  const e = { ...env, KV: kvStub() };
  const url = "https://www.instagram.com/reel/ETag1/";
  const orig = globalThis.fetch;
  globalThis.fetch = async () => upstreamJson({ image: ["https://scontent.cdninstagram.com/a.jpg"] });
  try {
    const p = "/api/v1/resolve?url=" + encodeURIComponent(url);
    const r1 = await call(p, undefined, e);
    const etag = r1.headers.get("etag");
    assert.match(etag || "", /^"sha256-[0-9a-f]{64}"$/);
    assert.equal(r1.headers.get("cache-control"), "private, no-store");
    assert.match(r1.headers.get("x-ratelimit-limit") || "", /^\d+$/);

    const r2 = await call(p, { headers: { "if-none-match": etag } }, e);
    assert.equal(r2.status, 304);
    assert.equal(r2.headers.get("etag"), etag);
    assert.equal(r2.headers.get("cache-control"), "private, no-store");
    assert.equal(await r2.text(), "");
  } finally {
    globalThis.fetch = orig;
  }
});

test("download streams the CDN response with a safe attachment name and CORS", async () => {
  resetProviderState();
  const e = { ...env, KV: kvStub() };
  const orig = globalThis.fetch;
  globalThis.fetch = mockUpstreamAndCdn();
  try {
    const res = await call("/api/v1/download?url=" + encodeURIComponent("https://www.instagram.com/reel/DL11/"), undefined, e);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-disposition") || "", /^attachment; filename="/);
    assert.equal(res.headers.get("content-type"), "video/mp4");
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.equal(res.headers.get("access-control-allow-origin"), "*");
    assert.equal(res.headers.get("cache-control"), "private, max-age=300");
    assert.equal(await res.text(), "BINARY");
  } finally {
    globalThis.fetch = orig;
  }
});

test("download passes E_PRIVATE_OR_NOT_FOUND through", async () => {
  resetProviderState();
  const e = { ...env, KV: kvStub() };
  const orig = globalThis.fetch;
  globalThis.fetch = async () => upstreamJson({});
  try {
    const res = await call("/api/v1/download?url=" + encodeURIComponent("https://www.instagram.com/reel/GONE1/"), undefined, e);
    assert.equal(res.status, 404);
    assert.equal((await res.json()).error.code, "E_PRIVATE_OR_NOT_FOUND");
  } finally {
    globalThis.fetch = orig;
  }
});

test("download rejects an unknown quality, a bad index and an oversized file", async () => {
  resetProviderState();
  const e = { ...env, KV: kvStub(), MAX_DOWNLOAD_MB: "1" };
  const orig = globalThis.fetch;
  globalThis.fetch = mockUpstreamAndCdn("x", { "content-length": String(50 * 1024 * 1024) });
  try {
    const base = "/api/v1/download?url=" + encodeURIComponent("https://www.instagram.com/reel/Qual1/");
    const badQuality = await call(base + "&quality=nope", undefined, e);
    assert.equal(badQuality.status, 400);
    assert.equal((await badQuality.json()).error.code, "E_BAD_QUALITY");

    const badIndex = await call(base + "&index=abc", undefined, e);
    assert.equal(badIndex.status, 400);
    assert.equal((await badIndex.json()).error.code, "E_BAD_INDEX");

    const negIndex = await call(base + "&index=-1", undefined, e);
    assert.equal(negIndex.status, 400);
    assert.equal((await negIndex.json()).error.code, "E_BAD_INDEX");

    const tooBig = await call(base, undefined, e);
    assert.equal(tooBig.status, 413);
    assert.equal((await tooBig.json()).error.code, "E_TOO_LARGE");
  } finally {
    globalThis.fetch = orig;
  }
});

test("download sends Content-Disposition: inline when inline=1", async () => {
  resetProviderState();
  const e = { ...env, KV: kvStub() };
  const orig = globalThis.fetch;
  globalThis.fetch = mockUpstreamAndCdn();
  try {
    const res = await call(
      "/api/v1/download?url=" + encodeURIComponent("https://www.instagram.com/reel/Inline1/") + "&inline=1",
      undefined,
      e,
    );
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-disposition"), "inline");
    assert.equal(await res.text(), "BINARY");
  } finally {
    globalThis.fetch = orig;
  }
});

test("HEAD download advertises headers without consuming the quota", async () => {
  resetProviderState();
  const e = { ...env, KV: kvStub(), RATE_LIMIT_DOWNLOAD_PER_MINUTE: "1" };
  const orig = globalThis.fetch;
  globalThis.fetch = mockUpstreamAndCdn("", { "content-length": "6" });
  try {
    const p = "/api/v1/download?url=" + encodeURIComponent("https://www.instagram.com/reel/Head1/");
    const head = await call(p, { method: "HEAD" }, e);
    assert.equal(head.status, 200);
    assert.equal(await head.text(), "");
    const get = await call(p, undefined, e);
    assert.equal(get.status, 200);
  } finally {
    globalThis.fetch = orig;
  }
});

test("deep health reports provider reachability", async () => {
  resetProviderState();
  const e = { ...env, KV: kvStub() };
  const orig = globalThis.fetch;
  globalThis.fetch = async () => new Response("[]", { status: 200 });
  try {
    const res = await call("/health?deep=1", undefined, e);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.data.provider_live));
    assert.equal(body.data.provider_live[0].reachable, true);
  } finally {
    globalThis.fetch = orig;
  }
});

test("thumbnail responses are private and never immutable", async () => {
  const e = { ...env, KV: kvStub() };
  const orig = globalThis.fetch;
  globalThis.fetch = async () => new Response("img", { status: 200, headers: { "content-type": "image/jpeg" } });
  try {
    const res = await call(
      "/api/v1/thumbnail?url=" + encodeURIComponent("https://scontent.cdninstagram.com/t.jpg"),
      undefined,
      e,
    );
    assert.equal(res.status, 200);
    const cc = res.headers.get("cache-control") || "";
    assert.match(cc, /private/);
    assert.match(cc, /max-age=300/);
    assert.ok(!/immutable/.test(cc));
    assert.equal(await res.text(), "img");
  } finally {
    globalThis.fetch = orig;
  }
});

test("API_KEYS makes /api/v1 private while / and /health stay public", async () => {
  resetProviderState();
  const e = { ...env, KV: kvStub(), API_KEYS: "key-one, key-two" };
  const orig = globalThis.fetch;
  globalThis.fetch = async () => upstreamJson({ image: ["https://scontent.cdninstagram.com/a.jpg"] });
  try {
    const root = await call("/", undefined, e);
    assert.equal(root.status, 200);
    assert.equal((await root.json()).data.auth_required, true);

    const p = "/api/v1/resolve?url=" + encodeURIComponent("https://www.instagram.com/p/Key1/");
    const missing = await call(p, undefined, e);
    assert.equal(missing.status, 401);
    assert.match(missing.headers.get("www-authenticate") || "", /Bearer/);
    assert.equal((await missing.json()).error.code, "E_UNAUTHORIZED");

    const wrong = await call(p, { headers: { "x-api-key": "nope" } }, e);
    assert.equal(wrong.status, 401);

    const bearer = await call(p, { headers: { authorization: "Bearer key-one" } }, e);
    assert.equal(bearer.status, 200);

    const header = await call(p, { headers: { "x-api-key": "key-two" } }, e);
    assert.equal(header.status, 200);
  } finally {
    globalThis.fetch = orig;
  }
});

test("an upstream timeout is surfaced as 504 E_UPSTREAM_TIMEOUT", async () => {
  resetProviderState();
  const e = { ...env, KV: kvStub(), UPSTREAM_TIMEOUT_MS: "50" };
  const orig = globalThis.fetch;
  globalThis.fetch = async () => {
    const err = new Error("timed out");
    err.name = "TimeoutError";
    throw err;
  };
  try {
    const res = await call("/api/v1/resolve?url=" + encodeURIComponent("https://www.instagram.com/reel/Slow1/"), undefined, e);
    assert.equal(res.status, 504);
    assert.equal((await res.json()).error.code, "E_UPSTREAM_TIMEOUT");
  } finally {
    globalThis.fetch = orig;
  }
});

test("unknown sub-paths and unhandled methods never leak internals", async () => {
  const res = await call("/api/v1/resolve", { method: "DELETE" });
  assert.equal(res.status, 405);
  const body = await res.json();
  assert.equal(body.error.code, "E_METHOD");
  assert.ok(!JSON.stringify(body).includes("stack"));
});
