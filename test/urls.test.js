import { test } from "node:test";
import assert from "node:assert/strict";
import { parseInstagramUrl, buildFilename, sanitizeFilenamePart, UrlError } from "../src/lib/urls.js";

test("accepts canonical post/reel/tv URLs", () => {
  for (const [input, kind] of [
    ["https://www.instagram.com/p/ABC123/", "p"],
    ["https://www.instagram.com/reel/XYZ_9/", "reel"],
    ["https://instagram.com/tv/AbC-1/", "tv"],
    ["https://instagr.am/p/Ab1X/", "p"],
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
  const r = parseInstagramUrl("instagram.com/p/Ab1X/");
  assert.equal(r.shortcode, "Ab1X");
});

test("strips tracking params from the returned URL", () => {
  const r = parseInstagramUrl("https://www.instagram.com/p/Ab1X/?igsh=xyz&utm_source=q");
  assert.equal(r.canonical, "https://www.instagram.com/p/Ab1X/");
  assert.equal(r.url.search, "");
});

test("rejects non-instagram hosts", () => {
  for (const bad of [
    "https://evil.com/p/Ab12/",
    "https://instagram.com.evil.com/p/Ab12/",
    "https://www.instagram.com.evil.com/p/Ab12/",
    "https://cdninstagram.com/p/Ab12/",
  ]) {
    assert.throws(() => parseInstagramUrl(bad), UrlError);
  }
});

test("rejects http, ports and credentials", () => {
  assert.throws(() => parseInstagramUrl("http://www.instagram.com/p/Ab1X/"));
  assert.throws(() => parseInstagramUrl("https://www.instagram.com:8443/p/Ab12/"));
  assert.throws(() => parseInstagramUrl("https://user:pass@www.instagram.com/p/Ab1X/"));
});

test("rejects wrong paths and bad shortcodes", () => {
  for (const bad of [
    "https://www.instagram.com/explore/",
    "https://www.instagram.com/p/",
    "https://www.instagram.com/p/@@@/",
    "https://www.instagram.com/p/Ab12/comments/",
    "https://www.instagram.com/p/Ab12/extra",
    "https://www.instagram.com/reel/abc", // too short
    "",
    null,
    undefined,
    42,
  ]) {
    assert.throws(() => parseInstagramUrl(bad), UrlError, String(bad));
  }
});

test("rejects non-media paths such as /reels/audio", () => {
  for (const bad of [
    "https://www.instagram.com/reels/audio/",
    "https://www.instagram.com/p/audio/",
    "https://www.instagram.com/tv/explore/",
    "https://www.instagram.com/reel/stories/",
  ]) {
    assert.throws(() => parseInstagramUrl(bad), UrlError, bad);
  }
});

test("shortcodes must be 4..32 characters", () => {
  assert.equal(parseInstagramUrl("https://www.instagram.com/p/Ab12/").shortcode, "Ab12");
  assert.equal(parseInstagramUrl(`https://www.instagram.com/p/${"a".repeat(32)}/`).shortcode.length, 32);
  assert.throws(() => parseInstagramUrl("https://www.instagram.com/p/Ab1/"), UrlError);
  assert.throws(() => parseInstagramUrl(`https://www.instagram.com/p/${"a".repeat(33)}/`), UrlError);
});

test("buildFilename produces author_shortcode.ext", () => {
  assert.equal(buildFilename("John.Doe", "AbC123", 0, "mp4"), "John.Doe_AbC123.mp4");
  assert.equal(buildFilename("John Doe", "AbC123", 2, "jpg"), "John_Doe_AbC123_2.jpg");
});

test("sanitizeFilenamePart removes path traversal", () => {
  assert.equal(sanitizeFilenamePart("../../etc/passwd"), "etc_passwd");
  assert.equal(sanitizeFilenamePart(""), "instagram");
});
