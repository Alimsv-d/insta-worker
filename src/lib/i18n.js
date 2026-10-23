// API error messages. English is the default; `?lang=fa` opts into Persian.
//
// This module only contains machine-facing API text. It has no UI strings and
// no documentation catalogue: the service is API-only.

export const LANGS = ["en", "fa"];
export const DEFAULT_LANG = "en";

const MESSAGES = {
  en: {
    E_INVALID_URL: "Invalid link. Only public Instagram post, reel or IGTV URLs are accepted.",
    E_INVALID_REQUEST: "Invalid request.",
    E_PRIVATE_OR_NOT_FOUND: "Content is not public, was removed, or is unavailable.",
    E_UPSTREAM_FAILED: "The upstream provider failed. Please try again shortly.",
    E_UPSTREAM_UNAVAILABLE: "No upstream provider is available.",
    E_UPSTREAM_TIMEOUT: "The upstream provider timed out. Please try again shortly.",
    E_RATE_LIMIT: "Too many requests. Please slow down.",
    E_TOO_LARGE: "The file exceeds the allowed size and cannot be downloaded.",
    E_NOT_ALLOWED_HOST: "The media host is not in the allowlist.",
    E_NOT_ALLOWED_TYPE: "The upstream returned a non-media content type.",
    E_BAD_QUALITY: "The selected quality is invalid.",
    E_BAD_INDEX: "The item index is invalid.",
    E_NO_VARIANTS: "No downloadable variant was found for this content.",
    E_METHOD: "Method not allowed.",
    E_NOT_FOUND: "Route not found.",
    E_UNAUTHORIZED: "Unauthorized.",
    E_INTERNAL: "Internal server error.",
  },
  fa: {
    E_INVALID_URL: "لینک نامعتبر است. فقط لینک عمومی پست، ریل یا IGTV اینستاگرام پذیرفته می‌شود.",
    E_INVALID_REQUEST: "درخواست نامعتبر است.",
    E_PRIVATE_OR_NOT_FOUND: "این محتوا عمومی نیست، حذف شده یا در دسترس نیست.",
    E_UPSTREAM_FAILED: "سرور منبع خطا داد. لطفاً کمی بعد دوباره تلاش کنید.",
    E_UPSTREAM_UNAVAILABLE: "هیچ سرور منبعی در دسترس نیست.",
    E_UPSTREAM_TIMEOUT: "سرور منبع پاسخ نداد. لطفاً کمی بعد دوباره تلاش کنید.",
    E_RATE_LIMIT: "تعداد درخواست‌ها زیاد است. لطفاً کمی صبر کنید.",
    E_TOO_LARGE: "حجم فایل از حد مجاز بیشتر است و قابل دانلود نیست.",
    E_NOT_ALLOWED_HOST: "میزبان فایل در فهرست مجاز نیست.",
    E_NOT_ALLOWED_TYPE: "نوع محتوای بازگشتی از منبع، رسانه نیست.",
    E_BAD_QUALITY: "کیفیت انتخاب‌شده معتبر نیست.",
    E_BAD_INDEX: "شماره آیتم معتبر نیست.",
    E_NO_VARIANTS: "هیچ کیفیت قابل دانلودی برای این محتوا پیدا نشد.",
    E_METHOD: "متد درخواست مجاز نیست.",
    E_NOT_FOUND: "مسیر یافت نشد.",
    E_UNAUTHORIZED: "دسترسی غیرمجاز.",
    E_INTERNAL: "خطای داخلی سرور.",
  },
};

/** Only `en` and `fa` are supported; anything else falls back to English. */
export function normalizeLang(value) {
  return value === "fa" ? "fa" : DEFAULT_LANG;
}

/** `?lang=fa` (or `?lang=en`) overrides the English default. */
export function langFromRequest(request) {
  try {
    const url = new URL(request.url);
    return normalizeLang(url.searchParams.get("lang"));
  } catch {
    return DEFAULT_LANG;
  }
}

/** The stable error message for a code. Unknown codes return the code itself. */
export function t(lang, code) {
  const table = MESSAGES[normalizeLang(lang)] || MESSAGES[DEFAULT_LANG];
  return table[code] || MESSAGES[DEFAULT_LANG][code] || String(code);
}

/** True when both languages define the code (used by the tests). */
export function hasMessage(lang, code) {
  return Boolean(MESSAGES[normalizeLang(lang)] && MESSAGES[normalizeLang(lang)][code]);
}
