// Bilingual message catalogue. fa (default) + en. Keep keys stable: they are
// referenced from the router, providers and tests.

export const LANGS = ["fa", "en"];
export const DEFAULT_LANG = "fa";

const MESSAGES = {
  fa: {
    ok: "عملیات با موفقیت انجام شد",
    E_INVALID_URL: "لینک نامعتبر است. فقط لینک پست/ریل/IGTV اینستاگرام پذیرفته می‌شود.",
    E_PRIVATE_OR_NOT_FOUND: "این محتوا عمومی نیست، حذف شده یا در دسترس نیست.",
    E_UPSTREAM_FAILED: "سرور منبع در دسترس نیست. لطفاً کمی بعد دوباره تلاش کنید.",
    E_RATE_LIMIT: "تعداد درخواست‌ها زیاد است. لطفاً کمی صبر کنید.",
    E_TOO_LARGE: "حجم فایل از حد مجاز بیشتر است و قابل دانلود نیست.",
    E_NOT_ALLOWED_HOST: "میزبان فایل در فهرست مجاز نیست.",
    E_BAD_QUALITY: "کیفیت انتخاب‌شده معتبر نیست.",
    E_BAD_INDEX: "شماره آیتم معتبر نیست.",
    E_METHOD: "متد درخواست مجاز نیست.",
    E_NOT_FOUND: "مسیر یافت نشد.",
    E_UNAUTHORIZED: "دسترسی غیرمجاز.",
    E_INTERNAL: "خطای داخلی سرور.",
    E_NO_VARIANTS: "هیچ کیفیت قابل دانلودی برای این محتوا پیدا نشد.",
    quality_best: "بهترین کیفیت",
    type_video: "ویدیو",
    type_image: "عکس",
    type_album: "آلبوم",
  },
  en: {
    ok: "Success",
    E_INVALID_URL: "Invalid link. Only public Instagram post/reel/IGTV links are accepted.",
    E_PRIVATE_OR_NOT_FOUND: "Content is not public, was removed, or is unavailable.",
    E_UPSTREAM_FAILED: "Upstream provider is unavailable. Please try again shortly.",
    E_RATE_LIMIT: "Too many requests. Please slow down.",
    E_TOO_LARGE: "File exceeds the allowed size and cannot be downloaded.",
    E_NOT_ALLOWED_HOST: "File host is not in the allowlist.",
    E_BAD_QUALITY: "Selected quality is invalid.",
    E_BAD_INDEX: "Invalid item index.",
    E_METHOD: "Method not allowed.",
    E_NOT_FOUND: "Route not found.",
    E_UNAUTHORIZED: "Unauthorized.",
    E_INTERNAL: "Internal server error.",
    E_NO_VARIANTS: "No downloadable variant was found for this content.",
    quality_best: "Best quality",
    type_video: "Video",
    type_image: "Image",
    type_album: "Album",
  },
};

export function pickLang(value) {
  if (!value) return DEFAULT_LANG;
  const v = String(value).toLowerCase().split(",")[0].trim();
  if (v.startsWith("fa") || v.startsWith("per") || v.startsWith("iran")) return "fa";
  if (v.startsWith("en")) return "en";
  return DEFAULT_LANG;
}

export function langFromRequest(request, env) {
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("lang");
    if (q) return pickLang(q);
  } catch {
    // ignore
  }
  if (env && env.DEFAULT_LANG) return pickLang(env.DEFAULT_LANG);
  const accept = request.headers.get("accept-language");
  return pickLang(accept);
}

export function t(lang, key) {
  const table = MESSAGES[lang] || MESSAGES[DEFAULT_LANG];
  return table[key] ?? (MESSAGES.en[key] ?? key);
}

export function isRtl(lang) {
  return lang === "fa";
}
