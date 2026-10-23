import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveContent,
  parseUpstreams,
  breakerOpen,
  allowProvider,
  recordFailure,
  recordSuccess,
  resetProviderState,
  providerHealthSnapshot,
  checkProviderHealth,
  tokenForProvider,
} from "../src/lib/providers.js";

const ctx = { kind: "reel", shortcode: "Ab1", canonical: "https://www.instagram.com/reel/Ab1/" };

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}

test("parseUpstreams splits and trims", () => {
  assert.deepEqual(parseUpstreams({ UPSTREAM_URLS: "https://a.com/x , https://b.com/y" }), ["https://a.com/x", "https://b.com/y"]);
  assert.equal(parseUpstreams({}).length, 1);
});

test("resolveContent normalises a successful provider", async () => {
  resetProviderState();
  const env = { UPSTREAM_URLS: "https://p1.example/api" };
  const fetchImpl = async () => jsonResponse({ video: [{ video: "https://scontent.cdninstagram.com/v.mp4" }] });
  const r = await resolveContent(ctx, env, { fetchImpl, attempts: 1 });
  assert.equal(r.provider, "p1.example");
  assert.equal(r.type, "video");
});

test("resolveContent falls back to second provider when first fails", async () => {
  resetProviderState();
  const env = { UPSTREAM_URLS: "https://bad.example/api,https://good.example/api" };
  const fetchImpl = async (url) => {
    if (url.includes("bad.example")) throw new Error("network");
    return jsonResponse({ image: ["https://scontent.cdninstagram.com/a.jpg"] });
  };
  const r = await resolveContent(ctx, env, { fetchImpl, attempts: 1 });
  assert.equal(r.provider, "good.example");
});

test("resolveContent throws E_PRIVATE_OR_NOT_FOUND for empty payload", async () => {
  resetProviderState();
  const env = { UPSTREAM_URLS: "https://p1.example/api" };
  const fetchImpl = async () => jsonResponse({ video: [], image: [] });
  await assert.rejects(() => resolveContent(ctx, env, { fetchImpl, attempts: 1 }), (e) => e.code === "E_PRIVATE_OR_NOT_FOUND");
});

test("resolveContent throws E_UPSTREAM_FAILED when all fail hard", async () => {
  resetProviderState();
  const env = { UPSTREAM_URLS: "https://x.example/api,https://y.example/api" };
  const fetchImpl = async () => {
    throw new Error("boom");
  };
  await assert.rejects(() => resolveContent(ctx, env, { fetchImpl, attempts: 1 }), (e) => e.code === "E_UPSTREAM_FAILED");
});

test("circuit breaker opens after threshold failures", () => {
  resetProviderState();
  recordFailure("cb.example");
  recordFailure("cb.example");
  assert.equal(breakerOpen("cb.example"), false);
  recordFailure("cb.example");
  assert.equal(breakerOpen("cb.example"), true);
  const snap = providerHealthSnapshot();
  assert.equal(snap["cb.example"].ok, false);
  resetProviderState();
});

test("parseUpstreams drops malformed and non-http entries", () => {
  assert.deepEqual(
    parseUpstreams({ UPSTREAM_URLS: "ftp://a.example/x, not a url, https://ok.example/api" }),
    ["https://ok.example/api"],
  );
  // Nothing usable -> the safe default.
  assert.deepEqual(parseUpstreams({ UPSTREAM_URLS: "ftp://a.example/x" }), ["https://catplus.ir/api/insta"]);
});

test("a non-object JSON body is an upstream failure, not not-found", async () => {
  resetProviderState();
  const env = { UPSTREAM_URLS: "https://p1.example/api" };
  const fetchImpl = async () => jsonResponse([{ video: "https://scontent.cdninstagram.com/v.mp4" }]);
  await assert.rejects(
    () => resolveContent(ctx, env, { fetchImpl, attempts: 1 }),
    (e) => e.code === "E_UPSTREAM_FAILED",
  );
});

test("the upstream token is only sent to the provider it belongs to", () => {
  const one = { UPSTREAM_TOKEN: "token-value" };
  assert.equal(tokenForProvider("https://p1.example/api", one, 1), "token-value");
  // Several providers and no explicit host: withhold the token.
  assert.equal(tokenForProvider("https://p1.example/api", one, 2), null);

  const scoped = { UPSTREAM_TOKEN: "token-value", UPSTREAM_TOKEN_HOST: "p1.example" };
  assert.equal(tokenForProvider("https://p1.example/api", scoped, 2), "token-value");
  assert.equal(tokenForProvider("https://p2.example/api", scoped, 2), null);
  assert.equal(tokenForProvider("https://p1.example/api", {}, 1), null);
});

test("the breaker allows exactly one half-open probe", () => {
  resetProviderState();
  const realNow = Date.now;
  let now = 1_000_000;
  Date.now = () => now;
  try {
    for (let i = 0; i < 3; i++) recordFailure("u1");
    assert.equal(breakerOpen("u1"), true);
    assert.equal(allowProvider("u1"), false);

    now += 31_000;
    assert.equal(breakerOpen("u1"), false);
    assert.equal(allowProvider("u1"), true, "first caller becomes the probe");
    assert.equal(allowProvider("u1"), false, "concurrent callers are rejected");

    recordSuccess("u1");
    assert.equal(allowProvider("u1"), true);
    assert.equal(breakerOpen("u1"), false);
  } finally {
    Date.now = realNow;
    resetProviderState();
  }
});

test("a health check never mutates the breaker state", async () => {
  resetProviderState();
  for (let i = 0; i < 3; i++) recordFailure("h1");
  assert.equal(breakerOpen("h1"), true);
  const live = await checkProviderHealth(
    { UPSTREAM_URLS: "https://h1.example/api" },
    { fetchImpl: async () => new Response("[]", { status: 200 }) },
  );
  assert.equal(live[0].reachable, true);
  assert.equal(breakerOpen("h1"), true, "health check must not reset the breaker");
  resetProviderState();
});

