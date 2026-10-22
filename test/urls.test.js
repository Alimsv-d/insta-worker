import { test } from "node:test";
import assert from "node:assert/strict";
import { parseInstagramUrl, buildFilename, sanitizeFilenamePart, UrlError } from "../src/lib/urls.js";

test("accepts canonical post/reel/tv URLs", () => {
  for (const [input, kind] of [
    ["https://www.instagram.com/p/ABC123/", "p"],
    ["https://www.instagram.com/reel/XYZ_9/", "reel"],
    ["https://instagram.com/tv/AbC-1/", "tv"],
    ["https://instagr.am/p/Ab1/", "p"],
  ]) {
    const r = parseInstagramUrl(input);
    assert.equal(r.kind, kind, input);
    assert.match(r.canonical, /^https:\/\/www\.instagram\.com\/[a-z]+\/[A-Za-z0-9_-]+\/$/);
  }
});

test("normalises /reels/ to /reel/", () => {
  const r = parseInstagramUrl("https://www.instagram.com/reels/Ab12/");
  assert.equal(r.kind, "reel");
  assert.equal(r.canonical, "https://www.instagram.com/reel/Ab12/");
});

test("forgiving scheme-less input", () => {
  const r = parseInstagramUrl("instagram.com/p/Ab1/");
  assert.equal(r.shortcode, "Ab1");
});

test("strips tracking params from canonical", () => {
  const r = parseInstagramUrl("https://www.instagram.com/p/Ab1/?igsh=xyz&utm_source=q");
  assert.equal(r.canonical, "https://www.instagram.com/p/Ab1/");
});

test("rejects non-instagram hosts", () => {
  for (const bad of [
    "https://evil.com/p/Ab1/",
    "https://instagram.com.evil.com/p/Ab1/",
    "https://www.instagram.com.evil.com/p/Ab1/",
  ]) {
    assert.throws(() => parseInstagramUrl(bad), UrlError);
  }
});

test("rejects http, ports and credentials", () => {
  assert.throws(() => parseInstagramUrl("http://www.instagram.com/p/Ab1/"));
  assert.throws(() => parseInstagramUrl("https://www.instagram.com:8443/p/Ab1/"));
  assert.throws(() => parseInstagramUrl("https://user:pass@www.instagram.com/p/Ab1/"));
});

test("rejects wrong paths and bad shortcodes", () => {
  assert.throws(() => parseInstagramUrl("https://www.instagram.com/explore/"));
  assert.throws(() => parseInstagramUrl("https://www.instagram.com/p/"));
  assert.throws(() => parseInstagramUrl("https://www.instagram.com/p/@@@/"));
  assert.throws(() => parseInstagramUrl(""));
  assert.throws(() => parseInstagramUrl(null));
});

test("buildFilename produces author_shortcode.ext", () => {
  assert.equal(buildFilename("John.Doe", "AbC123", 0, "mp4"), "John.Doe_AbC123.mp4");
  assert.equal(buildFilename("John Doe", "AbC123", 2, "jpg"), "John_Doe_AbC123_2.jpg");
});

test("sanitizeFilenamePart removes path traversal", () => {
  assert.equal(sanitizeFilenamePart("../../etc/passwd"), "etc_passwd");
  assert.equal(sanitizeFilenamePart(""), "instagram");
});
