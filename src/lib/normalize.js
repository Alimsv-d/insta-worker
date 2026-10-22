// Response normalisation: turn heterogeneous upstream payloads into a single
// stable shape:
//
//   {type, author:{username,full_name,avatar}, caption, thumbnail,
//    items:[{type, index, thumbnail, variants:[{url,quality,width,height,
//    bitrate,size,mime,has_audio}]}], source_url, shortcode, provider}
//
// The legacy upstream (catplus.ir) returns:
//   { video: [{ video, thumbnail, ... }], image: [url, ...], ... }
// We also defensively accept a few common alternative shapes.

import { buildFilename } from "./urls.js";

const VIDEO_EXT_RE = /\.(mp4|mov|webm|m4v)(\?|$)/i;
const IMAGE_EXT_RE = /\.(jpe?g|png|webp|heic)(\?|$)/i;

function pickFirst(...values) {
  for (const v of values) {
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function extFromUrl(url, fallback) {
  try {
    const path = new URL(url).pathname;
    const m = path.match(/\.([a-z0-9]{2,5})$/i);
    if (m) return m[1].toLowerCase();
  } catch {
    // ignore
  }
  return fallback;
}

function guessMime(url, type) {
  if (VIDEO_EXT_RE.test(url)) return "video/mp4";
  if (IMAGE_EXT_RE.test(url)) return url.toLowerCase().includes("webp") ? "image/webp" : "image/jpeg";
  return type === "video" ? "video/mp4" : "image/jpeg";
}

/**
 * Extract a human-readable quality label from a variant object/string.
 * Never invents a quality: if nothing is known we return "default".
 */
export function deriveQualityLabel(raw, kind) {
  const label = pickFirst(raw.quality, raw.label, raw.resolution, raw.quality_label);
  if (typeof label === "string" && label.trim()) return label.trim();
  const h = num(pickFirst(raw.height, raw.h));
  const w = num(pickFirst(raw.width, raw.w));
  if (h && w) return `${w}x${h}`;
  if (h) return `${h}p`;
  const br = num(pickFirst(raw.bitrate, raw.bit_rate));
  if (br) return `${Math.round(br / 1000)}kbps`;
  return kind === "video" ? "default" : "original";
}

function variantFromVideo(v) {
  if (typeof v === "string") {
    return {
      url: v,
      quality: "default",
      width: undefined,
      height: undefined,
      bitrate: undefined,
      size: undefined,
      mime: guessMime(v, "video"),
      has_audio: true,
    };
  }
  const url = pickFirst(v.video, v.url, v.src, v.download_url, v.link);
  if (!url) return null;
  return {
    url,
    quality: deriveQualityLabel(v, "video"),
    width: num(pickFirst(v.width, v.w)),
    height: num(pickFirst(v.height, v.h)),
    bitrate: num(pickFirst(v.bitrate, v.bit_rate)),
    size: num(pickFirst(v.size, v.file_size, v.filesize)),
    mime: pickFirst(v.mime, v.mime_type) || guessMime(url, "video"),
    has_audio: v.has_audio !== false,
  };
}

function variantFromImage(v) {
  if (typeof v === "string") {
    return {
      url: v,
      quality: "original",
      width: undefined,
      height: undefined,
      bitrate: undefined,
      size: undefined,
      mime: guessMime(v, "image"),
      has_audio: false,
    };
  }
  const url = pickFirst(v.url, v.image, v.src, v.display_url, v.download_url);
  if (!url) return null;
  return {
    url,
    quality: deriveQualityLabel(v, "image"),
    width: num(pickFirst(v.width, v.w)),
    height: num(pickFirst(v.height, v.h)),
    bitrate: undefined,
    size: num(pickFirst(v.size, v.file_size, v.filesize)),
    mime: pickFirst(v.mime, v.mime_type) || guessMime(url, "image"),
    has_audio: false,
  };
}

function detectType(payload, kind) {
  if (payload && typeof payload.type === "string") {
    const t = payload.type.toLowerCase();
    if (["video", "reel", "igtv"].includes(t)) return "video";
    if (["image", "photo", "picture"].includes(t)) return "image";
    if (["album", "carousel", "sidecar", "gallery"].includes(t)) return "album";
  }
  return kind === "reel" || kind === "tv" ? "video" : undefined;
}

/**
 * @param {any} payload raw upstream JSON
 * @param {{kind:string, shortcode:string, canonical:string}} ctx
 * @param {string} provider provider name for provenance
 * @returns {object|null} normalised result, or null when nothing usable
 */
export function normalizeUpstream(payload, ctx, provider = "upstream") {
  if (!payload || typeof payload !== "object") return null;

  const data = payload.data && typeof payload.data === "object" ? payload.data : payload;

  const videos = asArray(pickFirst(data.video, data.videos, data.video_list));
  const images = asArray(pickFirst(data.image, data.images, data.image_list, data.pictures));
  const itemsRaw = asArray(pickFirst(data.items, data.medias, data.carousel, data.children));

  const items = [];

  // Structured items[] (preferred when present).
  for (const it of itemsRaw) {
    if (!it) continue;
    const isVideo =
      it.type === "video" ||
      it.media_type === 2 ||
      pickFirst(it.video, it.video_url, it.video_versions) !== undefined;
    if (isVideo) {
      const variants = asArray(pickFirst(it.video_versions, it.variants, it.video))
        .map(variantFromVideo)
        .filter(Boolean);
      items.push({ type: "video", thumbnail: pickFirst(it.thumbnail, it.thumbnail_src, it.display_url), variants });
    } else {
      const variants = asArray(pickFirst(it.image_versions, it.variants, it.image, it.display_url))
        .map(variantFromImage)
        .filter(Boolean);
      items.push({ type: "image", thumbnail: pickFirst(it.thumbnail, it.thumbnail_src, it.display_url, variants[0]?.url), variants });
    }
  }

  // Flat video[] / image[] (legacy catplus shape).
  if (items.length === 0) {
    const seenVideoUrls = new Set();
    for (const v of videos) {
      const variant = variantFromVideo(v);
      if (!variant || seenVideoUrls.has(variant.url)) continue;
      seenVideoUrls.add(variant.url);
      items.push({
        type: "video",
        thumbnail: (typeof v === "object" && pickFirst(v.thumbnail, v.thumb, v.preview)) || undefined,
        variants: [variant],
      });
    }
    const seenImageUrls = new Set();
    for (const img of images) {
      const variant = variantFromImage(img);
      if (!variant || seenImageUrls.has(variant.url)) continue;
      seenImageUrls.add(variant.url);
      items.push({ type: "image", thumbnail: variant.url, variants: [variant] });
    }
  }

  // Deduplicate variants per item by URL.
  for (const item of items) {
    const seen = new Set();
    item.variants = item.variants.filter((v) => {
      if (!v || !v.url || seen.has(v.url)) return false;
      seen.add(v.url);
      return true;
    });
  }

  const usable = items.filter((i) => i.variants.length > 0);
  if (usable.length === 0) return null;

  let type = detectType(data, ctx.kind);
  if (usable.length > 1) type = "album";
  else if (!type) type = usable[0].type;

  const author = normalizeAuthor(data);
  const caption = pickFirst(
    typeof data.caption === "string" ? data.caption : undefined,
    data.caption?.text,
    data.description,
    data.title,
  );

  const duration = num(pickFirst(data.duration, data.video_duration, data.length, data.duration_seconds));

  const thumbnail =
    pickFirst(data.thumbnail, data.thumbnail_src, data.display_url, data.cover) ||
    usable[0].thumbnail ||
    usable[0].variants[0]?.url;

  usable.forEach((item, i) => {
    item.index = i;
    item.type = item.type === "album" ? "image" : item.type;
    if (!item.thumbnail) item.thumbnail = item.variants[0]?.url;
    // Derive clean filenames for each variant.
    item.variants.forEach((v) => {
      v.filename = buildFilename(author.username || "instagram", ctx.shortcode, usable.length > 1 ? i + 1 : 0, extFromUrl(v.url, v.mime?.startsWith("image") ? "jpg" : "mp4"));
    });
  });

  return {
    type,
    author,
    caption: caption ? String(caption) : "",
    thumbnail: thumbnail || null,
    items: usable,
    duration: duration || null,
    source_url: ctx.canonical,
    shortcode: ctx.shortcode,
    provider,
    variants_count: usable.reduce((sum, i) => sum + i.variants.length, 0),
  };
}

function normalizeAuthor(data) {
  const a = (data.author && typeof data.author === "object" ? data.author : null) ||
    (data.owner && typeof data.owner === "object" ? data.owner : null) ||
    {};
  const username = pickFirst(
    typeof data.author === "string" ? data.author : undefined,
    data.username,
    data.owner_username,
    a.username,
    a.user_name,
  );
  const fullName = pickFirst(data.full_name, data.owner_full_name, a.full_name, a.name);
  const avatar = pickFirst(data.avatar, data.profile_pic_url, data.owner_profile_pic_url, a.avatar, a.profile_pic_url);
  return {
    username: username ? String(username).replace(/^@/, "") : null,
    full_name: fullName ? String(fullName) : null,
    avatar: avatar ? String(avatar) : null,
  };
}
