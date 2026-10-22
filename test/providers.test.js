import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveContent,
  parseUpstreams,
  breakerOpen,
  recordFailure,
  resetProviderState,
  providerHealthSnapshot,
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
