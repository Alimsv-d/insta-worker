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
} from "../src/lib/security.js";

const env = { CDN_ALLOWLIST: "*.cdninstagram.com,*.fbcdn.net", MAX_DOWNLOAD_MB: "80" };

test("allowlist supports wildcard subdomains and is CDN-only by default", () => {
  const patterns = parseAllowlist(env);
  assert.ok(isAllowedHost("scontent.cdninstagram.com", patterns));
  assert.ok(isAllowedHost("video.fbcdn.net", patterns));
  assert.ok(!isAllowedHost("evil.com", patterns));
  assert.ok(!isAllowedHost("cdninstagram.com.evil.com", patterns));
  assert.ok(!isAllowedHost("cdninstagram.com", patterns), "bare domain must not match a wildcard");
  assert.ok(!isAllowedHost("www.instagram.com", patterns), "the default allowlist is CDN-only");
  assert.deepEqual(parseAllowlist({}), ["*.cdninstagram.com", "*.fbcdn.net"]);
});

test("private/loopback detection (IPv4)", () => {
  for (const h of [
    "localhost",
    "127.0.0.1",
    "10.0.0.5",
    "192.168.1.1",
    "172.16.0.1",
    "169.254.1.1",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "foo.internal",
  ]) {
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

test("validateProxyUrl blocks SSRF, ports and disallowed hosts", () => {
  for (const bad of [
    "http://scontent.cdninstagram.com/a.mp4",
    "https://127.0.0.1/a.mp4",
    "https://evil.com/a.mp4",
    "https://user:p@x.cdninstagram.com/a.mp4",
    "https://scontent.cdninstagram.com:8443/a.mp4",
    "https://cdninstagram.com/a.mp4",
  ]) {
    assert.equal(validateProxyUrl(bad, env).ok, false, bad);
  }
  assert.equal(validateProxyUrl("https://scontent.cdninstagram.com/a.mp4", env).ok, true);
});

test("size cap defaults safely for invalid values", () => {
  assert.equal(maxBytes(env), 80 * 1024 * 1024);
  assert.equal(maxBytes({ MAX_DOWNLOAD_MB: "abc" }), 80 * 1024 * 1024);
  assert.equal(maxBytes({ MAX_DOWNLOAD_MB: "-1" }), 80 * 1024 * 1024);
  assert.equal(maxBytes({ MAX_DOWNLOAD_MB: "1" }), 1024 * 1024);
  assert.equal(exceedsMaxSize(81 * 1024 * 1024, env), true);
  assert.equal(exceedsMaxSize(10 * 1024 * 1024, env), false);
  assert.equal(exceedsMaxSize(undefined, env), false);
});

test("streamMedia streams an allowed URL with Range passthrough and nosniff", async () => {
  let seenRange = null;
  const fetchImpl = async (url, init) => {
    seenRange = init.headers.range;
    return new Response("abcdef", {
      status: 206,
      headers: { "content-type": "video/mp4", "content-range": "bytes 0-5/6", "accept-ranges": "bytes" },
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
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(await res.text(), "abcdef");
});

test("HEAD returns headers without a body", async () => {
  const fetchImpl = async () =>
    new Response("ignored", { status: 200, headers: { "content-type": "image/jpeg", "content-length": "7" } });
  const res = await streamMedia(
    "https://scontent.cdninstagram.com/a.jpg",
    new Request("https://w/x", { method: "HEAD" }),
    env,
    { fetchImpl, requireImage: true },
  );
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "");
});

test("streamMedia rejects a disallowed host", async () => {
  await assert.rejects(
    () => streamMedia("https://evil.com/v.mp4", new Request("https://w/x"), env, { fetchImpl: async () => new Response("x") }),
    (e) => e.code === "E_NOT_ALLOWED_HOST",
  );
});

test("streamMedia rejects oversized declared files", async () => {
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

test("streamMedia re-validates every redirect hop without fetching the bad hop", async () => {
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

test("streamMedia follows an allowlisted redirect and caps the chain", async () => {
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

  const loop = async () =>
    new Response(null, { status: 302, headers: { location: "https://scontent.cdninstagram.com/loop.mp4" } });
  await assert.rejects(
    () => streamMedia("https://scontent.cdninstagram.com/loop.mp4", new Request("https://w/x"), env, { fetchImpl: loop }),
    (e) => e.code === "E_UPSTREAM_FAILED",
  );
});

test("dangerous and non-media MIME types are rejected", async () => {
  for (const [type, url] of [
    ["text/html", "https://scontent.cdninstagram.com/x.html"],
    ["application/pdf", "https://scontent.cdninstagram.com/doc.pdf"],
    ["image/svg+xml", "https://scontent.cdninstagram.com/x.svg"],
  ]) {
    const fetchImpl = async () => new Response("<x>", { status: 200, headers: { "content-type": type } });
    await assert.rejects(
      () => streamMedia(url, new Request("https://w/x"), env, { fetchImpl }),
      (e) => e.code === "E_NOT_ALLOWED_TYPE",
      type,
    );
  }
});

test("thumbnails require an image type", async () => {
  const fetchImpl = async () => new Response("v", { status: 200, headers: { "content-type": "video/mp4" } });
  await assert.rejects(
    () =>
      streamMedia("https://scontent.cdninstagram.com/v.mp4", new Request("https://w/x"), env, {
        fetchImpl,
        requireImage: true,
      }),
    (e) => e.code === "E_NOT_ALLOWED_TYPE",
  );
});

test("an empty upstream type is accepted only with an expected media type", async () => {
  const fetchImpl = async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("abc"));
          controller.close();
        },
      }),
      { status: 200 },
    );
  await assert.rejects(
    () => streamMedia("https://scontent.cdninstagram.com/a", new Request("https://w/x"), env, { fetchImpl }),
    (e) => e.code === "E_NOT_ALLOWED_TYPE",
  );
  const res = await streamMedia("https://scontent.cdninstagram.com/a", new Request("https://w/x"), env, {
    fetchImpl,
    contentType: "image/jpeg",
  });
  assert.equal(res.headers.get("content-type"), "image/jpeg");
});

test("inline media is served with Content-Disposition: inline", async () => {
  const fetchImpl = async () => new Response("video-bytes", { status: 200, headers: { "content-type": "video/mp4" } });
  const res = await streamMedia("https://scontent.cdninstagram.com/v.mp4", new Request("https://w/x"), env, {
    fetchImpl,
    inline: true,
  });
  assert.equal(res.headers.get("content-disposition"), "inline");
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

test("a fetch timeout is reported as E_UPSTREAM_TIMEOUT", async () => {
  const fetchImpl = (url, init) =>
    new Promise((_, reject) => {
      init.signal.addEventListener("abort", () => reject(init.signal.reason));
    });
  await assert.rejects(
    () =>
      streamMedia("https://scontent.cdninstagram.com/slow.mp4", new Request("https://w/x"), env, {
        fetchImpl,
        timeoutMs: 20,
        idleTimeoutMs: 20,
      }),
    (e) => e.code === "E_UPSTREAM_TIMEOUT",
  );
});
