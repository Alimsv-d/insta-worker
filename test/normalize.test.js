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
