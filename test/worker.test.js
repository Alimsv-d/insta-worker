import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.js";
import { checkRateLimit } from "../src/lib/storage.js";
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

function d1Stub() {
  // Minimal D1 stub: prepare().bind().run()/first() are no-ops that succeed.
  return {
    prepare() {
      return {
        bind() {
          return {
            async run() {
              return { success: true };
            },
            async first() {
              return null;
            },
          };
        },
      };
    },
  };
}

const env = {
  KV: kvStub(),
  UPSTREAM_URLS: "https://catplus.ir/api/insta",
  RATE_LIMIT_PER_MINUTE: "1000",
  RATE_LIMIT_DOWNLOAD_PER_MINUTE: "1000",
  MAX_DOWNLOAD_MB: "80",
  CDN_ALLOWLIST: "*.cdninstagram.com,*.fbcdn.net",
  DEFAULT_LANG: "fa",
  CONTACT_URL: "https://example.com/contact",
};

const ctx = {};
const call = (path, init) => worker.fetch(new Request("https://worker.example" + path, init), env, ctx);

test("GET /health returns ok JSON with storage info", async () => {
  const res = await call("/health");
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.data.storage.kv, true);
  assert.equal(body.data.storage.d1, false);
  assert.equal(body.request_id !== undefined, true);
});

test("GET /openapi.json serves a spec", async () => {
  const res = await call("/openapi.json");
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  const spec = body.data;
  assert.equal(spec.openapi, "3.0.3");
  assert.ok(spec.paths["/api/v1/resolve"]);
});

test("OPTIONS returns CORS preflight", async () => {
  const res = await call("/api/v1/resolve", { method: "OPTIONS" });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
});

test("resolve rejects invalid URL with E_INVALID_URL and error envelope", async () => {
  const res = await call("/api/v1/resolve?url=https://evil.com/p/x/");
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "E_INVALID_URL");
  assert.equal(body.lang, "fa");
  assert.ok(body.request_id);
  assert.match(body.error.message, /لینک/);
});

test("resolve honours lang=en", async () => {
  const res = await call("/api/v1/resolve?url=https://evil.com/p/x/&lang=en");
  const body = await res.json();
  assert.equal(body.lang, "en");
  assert.match(body.error.message, /Invalid link/);
});

test("unknown API route returns E_NOT_FOUND", async () => {
  const res = await call("/api/v1/nope");
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.error.code, "E_NOT_FOUND");
});

test("POST to API returns E_METHOD", async () => {
  const res = await call("/api/v1/resolve", { method: "POST" });
  assert.equal(res.status, 405);
  assert.equal((await res.json()).error.code, "E_METHOD");
});

test("download without url returns E_INVALID_URL", async () => {
  const res = await call("/api/v1/download");
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, "E_INVALID_URL");
});

test("thumbnail rejects disallowed host", async () => {
  const res = await call("/api/v1/thumbnail?url=" + encodeURIComponent("https://evil.com/a.jpg"));
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, "E_NOT_ALLOWED_HOST");
});

test("rate limit returns 429 with Retry-After", async () => {
  const tightEnv = { ...env, KV: kvStub(), RATE_LIMIT_PER_MINUTE: "1" };
  const path = "/api/v1/resolve?url=" + encodeURIComponent("https://www.instagram.com/reel/RL1/");
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ video: [{ video: "https://scontent.cdninstagram.com/v.mp4" }] }), {
      headers: { "content-type": "application/json" },
    });
  try {
    // first request consumes the single slot
    await worker.fetch(new Request("https://worker.example" + path), tightEnv, ctx);
    const res = await worker.fetch(new Request("https://worker.example" + path), tightEnv, ctx);
    assert.equal(res.status, 429);
    assert.ok(Number(res.headers.get("retry-after")) >= 1);
    assert.equal((await res.json()).error.code, "E_RATE_LIMIT");
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("admin endpoint requires ADMIN_TOKEN", async () => {
  const res = await call("/api/v1/admin/keys", { method: "POST", body: "{}" });
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error.code, "E_UNAUTHORIZED");
});

test("caching: second resolve hits KV cache", async () => {
  resetProviderState();
  const cacheEnv = { ...env, KV: kvStub(), CACHE_TTL_SECONDS: "300" };
  const url = "https://www.instagram.com/reel/Cache1/";
  // Seed the KV cache directly to avoid a network call.
  await checkRateLimit(cacheEnv, "seed", "x", 1); // ensure KV works
  const calls = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (u) => {
    calls.push(String(u));
    return new Response(JSON.stringify({ video: [{ video: "https://scontent.cdninstagram.com/v.mp4" }] }), {
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const r1 = await worker.fetch(new Request("https://worker.example/api/v1/resolve?url=" + encodeURIComponent(url)), cacheEnv, ctx);
    assert.equal(r1.status, 200);
    assert.equal(r1.headers.get("x-cache"), "MISS");
    const r2 = await worker.fetch(new Request("https://worker.example/api/v1/resolve?url=" + encodeURIComponent(url)), cacheEnv, ctx);
    assert.equal(r2.status, 200);
    assert.equal(r2.headers.get("x-cache"), "HIT");
    assert.equal(calls.length, 1, "upstream should be called once");
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("ETag round-trip returns 304", async () => {
  resetProviderState();
  const e2 = { ...env, KV: kvStub() };
  const url = "https://www.instagram.com/reel/ETag1/";
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ image: ["https://scontent.cdninstagram.com/a.jpg"] }), { headers: { "content-type": "application/json" } });
  try {
    const r1 = await worker.fetch(new Request("https://worker.example/api/v1/resolve?url=" + encodeURIComponent(url)), e2, ctx);
    const etag = r1.headers.get("etag");
    assert.ok(etag);
    const r2 = await worker.fetch(
      new Request("https://worker.example/api/v1/resolve?url=" + encodeURIComponent(url), { headers: { "if-none-match": etag } }),
      e2,
      ctx,
    );
    assert.equal(r2.status, 304);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("download proxies via mocked CDN and sets Content-Disposition", async () => {
  resetProviderState();
  const e2 = { ...env, KV: kvStub() };
  const url = "https://www.instagram.com/reel/DL1/";
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (u) => {
    const target = String(u);
    if (target.includes("/api/insta")) {
      return new Response(JSON.stringify({ video: [{ video: "https://scontent.cdninstagram.com/v.mp4" }] }), {
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("BINARY", { status: 200, headers: { "content-type": "video/mp4", "content-length": "6", "accept-ranges": "bytes" } });
  };
  try {
    const res = await worker.fetch(new Request("https://worker.example/api/v1/download?url=" + encodeURIComponent(url)), e2, ctx);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-disposition") || "", /attachment; filename=/);
    assert.equal(await res.text(), "BINARY");
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("download passes E_PRIVATE_OR_NOT_FOUND through", async () => {
  resetProviderState();
  const e2 = { ...env, KV: kvStub() };
  const url = "https://www.instagram.com/reel/GONE1/";
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  try {
    const res = await worker.fetch(new Request("https://worker.example/api/v1/download?url=" + encodeURIComponent(url)), e2, ctx);
    assert.equal(res.status, 404);
    assert.equal((await res.json()).error.code, "E_PRIVATE_OR_NOT_FOUND");
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("download rejects unknown quality with E_BAD_QUALITY", async () => {
  resetProviderState();
  const e2 = { ...env, KV: kvStub() };
  const url = "https://www.instagram.com/reel/Q1/";
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ video: [{ video: "https://scontent.cdninstagram.com/v.mp4" }] }), {
      headers: { "content-type": "application/json" },
    });
  try {
    const res = await worker.fetch(
      new Request("https://worker.example/api/v1/download?url=" + encodeURIComponent(url) + "&quality=does-not-exist"),
      e2,
      ctx,
    );
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, "E_BAD_QUALITY");
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("download rejects bad index with E_BAD_INDEX", async () => {
  resetProviderState();
  const e2 = { ...env, KV: kvStub() };
  const url = "https://www.instagram.com/reel/I1/";
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ video: [{ video: "https://scontent.cdninstagram.com/v.mp4" }] }), {
      headers: { "content-type": "application/json" },
    });
  try {
    const res = await worker.fetch(
      new Request("https://worker.example/api/v1/download?url=" + encodeURIComponent(url) + "&index=99"),
      e2,
      ctx,
    );
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, "E_BAD_INDEX");
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("download rejects oversized declared file with E_TOO_LARGE", async () => {
  resetProviderState();
  const e2 = { ...env, KV: kvStub(), MAX_DOWNLOAD_MB: "1" };
  const url = "https://www.instagram.com/reel/BIG1/";
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (u) => {
    if (String(u).includes("/api/insta")) {
      return new Response(JSON.stringify({ video: [{ video: "https://scontent.cdninstagram.com/v.mp4" }] }), {
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("x", { status: 200, headers: { "content-type": "video/mp4", "content-length": String(50 * 1024 * 1024) } });
  };
  try {
    const res = await worker.fetch(new Request("https://worker.example/api/v1/download?url=" + encodeURIComponent(url)), e2, ctx);
    assert.equal(res.status, 413);
    assert.equal((await res.json()).error.code, "E_TOO_LARGE");
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("admin creates an api key when ADMIN_TOKEN matches", async () => {
  const adminEnv = { ...env, KV: kvStub(), ADMIN_TOKEN: "s3cret-token", DB: d1Stub() };
  const res = await worker.fetch(
    new Request("https://worker.example/api/v1/admin/keys", {
      method: "POST",
      headers: { authorization: "Bearer s3cret-token", "content-type": "application/json" },
      body: JSON.stringify({ key: "user-key-1", label: "test" }),
    }),
    adminEnv,
    ctx,
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.data.created, true);
  assert.ok(body.request_id);
});

test("deep health check reports provider reachability", async () => {
  resetProviderState();
  const e2 = { ...env, KV: kvStub() };
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("[]", { status: 200 });
  try {
    const res = await worker.fetch(new Request("https://worker.example/health?deep=1"), e2, ctx);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.data.provider_live));
    assert.equal(body.data.provider_live[0].reachable, true);
  } finally {
    globalThis.fetch = origFetch;
  }
});
