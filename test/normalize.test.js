import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeUpstream, deriveQualityLabel } from "../src/lib/normalize.js";

const ctx = { kind: "reel", shortcode: "AbC123", canonical: "https://www.instagram.com/reel/AbC123/" };

test("normalises legacy catplus video[] shape", () => {
  const payload = {
    video: [{ video: "https://scontent.cdninstagram.com/v.mp4", thumbnail: "https://scontent.cdninstagram.com/t.jpg" }],
    image: [],
    author: "alice",
    caption: "hello world",
  };
  const r = normalizeUpstream(payload, ctx, "catplus.ir");
  assert.equal(r.type, "video");
  assert.equal(r.author.username, "alice");
  assert.equal(r.caption, "hello world");
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].variants.length, 1);
  assert.equal(r.items[0].variants[0].mime, "video/mp4");
  assert.match(r.items[0].variants[0].filename, /alice_AbC123\.mp4$/);
});

test("normalises image[] shape and picks album when multiple", () => {
  const payload = {
    image: ["https://scontent.cdninstagram.com/1.jpg", "https://scontent.cdninstagram.com/2.jpg"],
  };
  const r = normalizeUpstream(payload, ctx, "catplus.ir");
  assert.equal(r.type, "album");
  assert.equal(r.items.length, 2);
  assert.equal(r.items[0].type, "image");
});

test("normalises structured items[] with multiple variants", () => {
  const payload = {
    items: [
      {
        type: "video",
        thumbnail: "https://scontent.cdninstagram.com/t.jpg",
        video_versions: [
          { url: "https://scontent.cdninstagram.com/hd.mp4", width: 1080, height: 1920, bitrate: 2000000 },
          { url: "https://scontent.cdninstagram.com/sd.mp4", width: 720, height: 1280, bitrate: 800000 },
        ],
      },
    ],
  };
  const r = normalizeUpstream(payload, ctx, "p");
  assert.equal(r.items[0].variants.length, 2);
  assert.equal(r.items[0].variants[0].quality, "1080x1920");
  assert.equal(r.items[0].variants[0].width, 1080);
});

test("returns null when there is no usable media", () => {
  assert.equal(normalizeUpstream({}, ctx), null);
  assert.equal(normalizeUpstream({ video: [], image: [] }, ctx), null);
  assert.equal(normalizeUpstream(null, ctx), null);
});

test("deduplicates identical variant URLs", () => {
  const payload = {
    video: [
      { video: "https://scontent.cdninstagram.com/same.mp4" },
      { video: "https://scontent.cdninstagram.com/same.mp4" },
    ],
  };
  const r = normalizeUpstream(payload, ctx, "catplus.ir");
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].variants.length, 1);
});

test("deriveQualityLabel never invents dimensions", () => {
  assert.equal(deriveQualityLabel({}, "video"), "default");
  assert.equal(deriveQualityLabel({}, "image"), "original");
  assert.equal(deriveQualityLabel({ height: 720 }, "video"), "720p");
  assert.equal(deriveQualityLabel({ quality: "HD" }, "video"), "HD");
});

test("rejects non-https, credentials and non-default ports in variant URLs", () => {
  const payload = {
    video: [
      { video: "http://scontent.cdninstagram.com/v.mp4" },
      { video: "https://user:pass@scontent.cdninstagram.com/v.mp4" },
      { video: "https://scontent.cdninstagram.com:8443/v.mp4" },
      { video: "https://scontent.cdninstagram.com/ok.mp4" },
    ],
  };
  const r = normalizeUpstream(payload, ctx, "p");
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].variants.length, 1);
  assert.match(r.items[0].variants[0].url, /\/ok\.mp4$/);
});

test("groups the qualities of one clip into a single item", () => {
  const payload = {
    video: [
      {
        video: "https://scontent.cdninstagram.com/1-hd.mp4",
        thumbnail: "https://scontent.cdninstagram.com/t1.jpg",
        width: 1080,
        height: 1920,
      },
      {
        video: "https://scontent.cdninstagram.com/1-sd.mp4",
        thumbnail: "https://scontent.cdninstagram.com/t1.jpg",
        width: 720,
        height: 1280,
      },
      { video: "https://scontent.cdninstagram.com/2.mp4", thumbnail: "https://scontent.cdninstagram.com/t2.jpg" },
    ],
  };
  const r = normalizeUpstream(payload, ctx, "p");
  assert.equal(r.items.length, 2);
  assert.equal(r.items[0].variants.length, 2);
  assert.equal(r.items[0].variants[0].quality, "1080x1920");
  assert.equal(r.items[1].variants.length, 1);
});

test("deduplicates across items and drops items left empty", () => {
  const payload = {
    items: [
      { type: "video", video_versions: [{ url: "https://scontent.cdninstagram.com/same.mp4" }] },
      { type: "video", video_versions: [{ url: "https://scontent.cdninstagram.com/same.mp4" }] },
    ],
  };
  const r = normalizeUpstream(payload, ctx, "p");
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].variants.length, 1);
});

test("duration is normalised to seconds and duration_ms wins", () => {
  const r = normalizeUpstream(
    {
      video: [{ video: "https://scontent.cdninstagram.com/v.mp4" }],
      duration_ms: 12_500,
      duration: 99,
    },
    ctx,
    "p",
  );
  assert.equal(r.duration, 12.5);
});

test("an image variant can never end up with a video MIME/extension", () => {
  const r = normalizeUpstream({ image: ["https://scontent.cdninstagram.com/a.jpg"] }, ctx, "p");
  const v = r.items[0].variants[0];
  assert.equal(v.mime, "image/jpeg");
  assert.match(v.filename, /\.jpg$/);
});

test("caption is sanitised (control characters removed, trimmed)", () => {
  const r = normalizeUpstream(
    { image: ["https://scontent.cdninstagram.com/a.jpg"], caption: "  hello\u0000\tworld  " },
    ctx,
    "p",
  );
  assert.equal(r.caption, "hello world");
});

test("a video URL is never promoted to the top-level thumbnail", () => {
  const r = normalizeUpstream(
    {
      video: [{ video: "https://scontent.cdninstagram.com/v.mp4" }],
      display_url: "https://scontent.cdninstagram.com/v.mp4",
    },
    ctx,
    "p",
  );
  assert.equal(r.thumbnail, null);
});


test("null or non-object payloads and invalid context are rejected", () => {
  assert.equal(normalizeUpstream([], ctx), null);
  assert.equal(normalizeUpstream("x", ctx), null);
  assert.equal(normalizeUpstream({ image: ["https://scontent.cdninstagram.com/a.jpg"] }, null), null);
});

test("sanitizeUrl strips tracking params from variant and thumbnail URLs", () => {
  const r = normalizeUpstream(
    {
      video: [
        {
          video: "https://scontent.cdninstagram.com/v.mp4?igsh=abc&utm_source=x",
          thumbnail: "https://scontent.cdninstagram.com/t.jpg?igsh=abc",
        },
      ],
    },
    ctx,
    "p",
  );
  assert.equal(r.items[0].variants[0].url, "https://scontent.cdninstagram.com/v.mp4");
  assert.equal(r.thumbnail, "https://scontent.cdninstagram.com/t.jpg");
});

test("an image keeps an image MIME even if upstream claims video", () => {
  const r = normalizeUpstream(
    { image: [{ url: "https://scontent.cdninstagram.com/a.jpg", mime: "video/mp4" }] },
    ctx,
    "p",
  );
  const v = r.items[0].variants[0];
  assert.equal(v.mime, "image/jpeg");
  assert.match(v.filename, /\.jpg$/);
});

test("a single resolved item is typed by its own media kind", () => {
  const r = normalizeUpstream({ type: "video", image: ["https://scontent.cdninstagram.com/a.jpg"] }, ctx, "p");
  assert.equal(r.type, "image");
});
