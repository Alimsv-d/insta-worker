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
  applyMediaCors,
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

test("private/loopback detection covers IPv6 (bracketed, mapped, ULA, link-local)", () => {
  for (const h of [
    "[::1]",
    "[::]",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "fe80::1",
    "fc00::1",
    "fd12:3456::1",
    "2001:db8::1",
    "ff02::1",
  ]) {
    assert.ok(looksPrivateHost(h), h);
  }
  assert.ok(!looksPrivateHost("2606:4700:4700::1111"));
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

test("streamMedia re-validates redirects instead of following them blindly", async () => {
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(String(url));
    if (String(url).includes("/start.mp4")) {
      return new Response(null, { status: 302, headers: { location: "https://evil.com/steal.mp4" } });
    }
    return new Response("ok", { status: 200, headers: { "content-type": "video/mp4" } });
  };
  await assert.rejects(
    () => streamMedia("https://scontent.cdninstagram.com/start.mp4", new Request("https://w/x"), env, { fetchImpl }),
    (e) => e.code === "E_NOT_ALLOWED_HOST",
  );
  assert.equal(seen.length, 1, "the disallowed hop must not be fetched");
});

test("streamMedia follows an allowlisted redirect", async () => {
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(String(url));
    if (String(url).includes("/start.mp4")) {
      return new Response(null, { status: 302, headers: { location: "https://video.fbcdn.net/real.mp4" } });
    }
    return new Response("ok", { status: 200, headers: { "content-type": "video/mp4" } });
  };
  const res = await streamMedia("https://scontent.cdninstagram.com/start.mp4", new Request("https://w/x"), env, { fetchImpl });
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "ok");
  assert.equal(seen.length, 2);
});

test("streamMedia caps the redirect chain", async () => {
  const fetchImpl = async () =>
    new Response(null, { status: 302, headers: { location: "https://scontent.cdninstagram.com/loop.mp4" } });
  await assert.rejects(
    () => streamMedia("https://scontent.cdninstagram.com/loop.mp4", new Request("https://w/x"), env, { fetchImpl }),
    (e) => e.code === "E_UPSTREAM_FAILED",
  );
});

test("dangerous MIME types are rejected", async () => {
  const fetchImpl = async () => new Response("<script>", { status: 200, headers: { "content-type": "text/html" } });
  await assert.rejects(
    () => streamMedia("https://scontent.cdninstagram.com/x.html", new Request("https://w/x"), env, { fetchImpl }),
    (e) => e.code === "E_NOT_ALLOWED_TYPE",
  );
});

test("non-media (but non-dangerous) content is sandboxed and forced to download", async () => {
  const fetchImpl = async () => new Response("%PDF-1.4", { status: 200, headers: { "content-type": "application/pdf" } });
  const res = await streamMedia("https://scontent.cdninstagram.com/doc.pdf", new Request("https://w/x"), env, { fetchImpl });
  assert.match(res.headers.get("content-disposition") || "", /^attachment/);
  assert.match(res.headers.get("content-security-policy") || "", /sandbox/);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
});

test("inline media is served with Content-Disposition: inline", async () => {
  const fetchImpl = async () => new Response("video-bytes", { status: 200, headers: { "content-type": "video/mp4" } });
  const res = await streamMedia("https://scontent.cdninstagram.com/v.mp4", new Request("https://w/x"), env, {
    fetchImpl,
    inline: true,
  });
  assert.equal(res.headers.get("content-disposition"), "inline");
});

test("media CORS is granted only to the worker's own origin", () => {
  const evil = new Headers();
  applyMediaCors(evil, new Request("https://worker.example/x", { headers: { origin: "https://evil.example" } }));
  assert.equal(evil.get("access-control-allow-origin"), null);

  const self = new Headers();
  applyMediaCors(self, new Request("https://worker.example/x", { headers: { origin: "https://worker.example" } }));
  assert.equal(self.get("access-control-allow-origin"), "https://worker.example");
  assert.match(self.get("vary") || "", /Origin/);
});

test("the byte counter enforces the cap even without Content-Length", async () => {
  const fetchImpl = async () => new Response("abcdef", { status: 200, headers: { "content-type": "video/mp4" } });
  await assert.rejects(async () => {
    const res = await streamMedia("https://scontent.cdninstagram.com/big.mp4", new Request("https://w/x"), env, {
      fetchImpl,
      maxBytes: 4,
    });
    await res.text();
  }, (e) => e && e.code === "E_TOO_LARGE");
});

