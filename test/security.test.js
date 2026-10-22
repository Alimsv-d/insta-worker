import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isAllowedHost,
  parseAllowlist,
  looksPrivateHost,
  validateProxyUrl,
  exceedsMaxSize,
  maxBytes,
  streamMedia,
  escapeHtml,
} from "../src/lib/security.js";

const env = { CDN_ALLOWLIST: "*.cdninstagram.com,*.fbcdn.net,*.instagram.com", MAX_DOWNLOAD_MB: "80" };

test("allowlist supports wildcard subdomains", () => {
  const patterns = parseAllowlist(env);
  assert.ok(isAllowedHost("scontent.cdninstagram.com", patterns));
  assert.ok(isAllowedHost("video.fbcdn.net", patterns));
  assert.ok(!isAllowedHost("evil.com", patterns));
  assert.ok(!isAllowedHost("cdninstagram.com.evil.com", patterns));
  assert.ok(!isAllowedHost("cdninstagram.com", patterns), "bare domain should not match wildcard");
});

test("private/loopback detection", () => {
  for (const h of ["localhost", "127.0.0.1", "10.0.0.5", "192.168.1.1", "172.16.0.1", "169.254.1.1", "100.64.0.1", "0.0.0.0", "::1", "foo.internal"]) {
    assert.ok(looksPrivateHost(h), h);
  }
  assert.ok(!looksPrivateHost("scontent.cdninstagram.com"));
  assert.ok(!looksPrivateHost("8.8.8.8"));
});

test("validateProxyUrl blocks SSRF and disallowed hosts", () => {
  assert.deepEqual(validateProxyUrl("http://scontent.cdninstagram.com/a.mp4", env).ok, false);
  assert.deepEqual(validateProxyUrl("https://127.0.0.1/a.mp4", env).ok, false);
  assert.deepEqual(validateProxyUrl("https://evil.com/a.mp4", env).ok, false);
  assert.deepEqual(validateProxyUrl("https://user:p@x.cdninstagram.com/a.mp4", env).ok, false);
  assert.equal(validateProxyUrl("https://scontent.cdninstagram.com/a.mp4", env).ok, true);
});

test("size cap logic", () => {
  assert.equal(exceedsMaxSize(81 * 1024 * 1024, env), true);
  assert.equal(exceedsMaxSize(10 * 1024 * 1024, env), false);
  assert.equal(maxBytes(env), 80 * 1024 * 1024);
});

test("escapeHtml escapes dangerous characters", () => {
  assert.equal(escapeHtml('<script>"x"&\'y\''), "&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;");
  assert.equal(escapeHtml(null), "");
});

test("streamMedia streams allowed URL with Range passthrough", async () => {
  let seenRange = null;
  const fetchImpl = async (url, init) => {
    seenRange = init.headers.range;
    return new Response("abcdef", {
      status: 206,
      headers: { "content-type": "video/mp4", "content-range": "bytes 0-5/100", "accept-ranges": "bytes", "content-length": "6" },
    });
  };
  const req = new Request("https://worker.example/api/v1/download?url=x", { headers: { range: "bytes=0-5" } });
  const res = await streamMedia("https://scontent.cdninstagram.com/v.mp4", req, env, {
    fetchImpl,
    contentDisposition: 'attachment; filename="a.mp4"',
  });
  assert.equal(seenRange, "bytes=0-5");
  assert.equal(res.status, 206);
  assert.equal(res.headers.get("content-disposition"), 'attachment; filename="a.mp4"');
  assert.equal(await res.text(), "abcdef");
});

test("streamMedia rejects disallowed host", async () => {
  await assert.rejects(
    () => streamMedia("https://evil.com/v.mp4", new Request("https://w/x"), env, { fetchImpl: async () => new Response("x") }),
    (e) => e.code === "E_NOT_ALLOWED_HOST",
  );
});

test("streamMedia rejects oversized files", async () => {
  const fetchImpl = async () =>
    new Response("x", { status: 200, headers: { "content-type": "video/mp4", "content-length": String(200 * 1024 * 1024) } });
  await assert.rejects(
    () => streamMedia("https://scontent.cdninstagram.com/big.mp4", new Request("https://w/x"), env, { fetchImpl }),
    (e) => e.code === "E_TOO_LARGE",
  );
});

test("streamMedia maps 404 to E_PRIVATE_OR_NOT_FOUND", async () => {
  const fetchImpl = async () => new Response("nope", { status: 404 });
  await assert.rejects(
    () => streamMedia("https://scontent.cdninstagram.com/gone.mp4", new Request("https://w/x"), env, { fetchImpl }),
    (e) => e.code === "E_PRIVATE_OR_NOT_FOUND",
  );
});
