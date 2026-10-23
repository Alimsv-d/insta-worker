// Bilingual message catalogue. fa (default) + en.
//
// Two layers live here:
//   * API_MESSAGES — error/success messages referenced by the router, the
//     provider layer and the tests (keys are error codes).
//   * UI_MESSAGES  — every string rendered by the single-file UI, including
//     the ones the client script needs (S.ok, S.type_*, ...).
//
// Both layers are merged per language and exposed through `t(lang, key)` so
// that no user-visible English text is hard-coded in the client script.

export const LANGS = ["fa", "en"];
export const DEFAULT_LANG = "fa";

const API_MESSAGES = {
  fa: {
    ok: "عملیات با موفقیت انجام شد",
    E_INVALID_URL: "لینک نامعتبر است. فقط لینک پست/ریل/IGTV اینستاگرام پذیرفته می‌شود.",
    E_INVALID_REQUEST: "درخواست نامعتبر است.",
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
    E_FORBIDDEN: "این عملیات مجاز نیست.",
    E_INTERNAL: "خطای داخلی سرور.",
    E_NO_VARIANTS: "هیچ کیفیت قابل دانلودی برای این محتوا پیدا نشد.",
    E_KEY_DISABLED: "این کلید API غیرفعال شده است و دوباره فعال نمی‌شود.",
    E_KEY_EXISTS: "این کلید API از قبل وجود دارد.",
    E_UPSTREAM_UNAVAILABLE: "هیچ provider در دسترس نیست.",
    quality_best: "بهترین کیفیت",
    type_video: "ویدیو",
    type_image: "عکس",
    type_album: "آلبوم",
  },
  en: {
    ok: "Success",
    E_INVALID_URL: "Invalid link. Only public Instagram post/reel/IGTV links are accepted.",
    E_INVALID_REQUEST: "Invalid request.",
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
    E_FORBIDDEN: "This operation is not allowed.",
    E_INTERNAL: "Internal server error.",
    E_NO_VARIANTS: "No downloadable variant was found for this content.",
    E_KEY_DISABLED: "This API key is disabled and cannot be re-enabled.",
    E_KEY_EXISTS: "This API key already exists.",
    E_UPSTREAM_UNAVAILABLE: "No provider is available.",
    quality_best: "Best quality",
    type_video: "Video",
    type_image: "Image",
    type_album: "Album",
  },
};

const UI_MESSAGES = {
  fa: {
    dir: "rtl",
    langName: "فارسی",
    brand: "اینستا دانلودر",
    tagline: "دانلود پست، ریل و IGTV اینستاگرام — سریع، تمیز و بدون تبلیغ",
    nav_tool: "ابزار",
    nav_history: "تاریخچه",
    nav_docs: "مستندات API",
    nav_faq: "سؤالات متداول",
    nav_tos: "شرایط استفاده",
    nav_about: "درباره",
    theme_toggle: "تغییر تم",
    lang_toggle: "English",
    menu_open: "باز کردن منو",
    menu_close: "بستن منو",
    input_label: "لینک اینستاگرام",
    input_placeholder: "https://www.instagram.com/reel/...",
    btn_resolve: "دریافت",
    btn_paste: "چسباندن",
    btn_clear: "پاک کردن",
    resolving: "در حال دریافت پیش‌نمایش…",
    quality_label: "کیفیت / فرمت",
    btn_download: "دانلود",
    btn_download_all: "دانلود همه (ZIP)",
    btn_copy: "کپی لینک",
    btn_share: "اشتراک‌گذاری",
    btn_report: "گزارش/حذف محتوا",
    btn_play: "پخش پیش‌نمایش",
    type: "نوع",
    items: "تعداد آیتم",
    duration: "مدت",
    dimensions: "ابعاد",
    file_size: "حجم تقریبی",
    source: "لینک اصلی",
    author: "صاحب محتوا",
    caption: "کپشن",
    only_one_quality: "فقط یک نسخه موجود است؛ کیفیت دیگری در دسترس نیست.",
    best: "بهترین",
    history_title: "تاریخچهٔ اخیر",
    history_empty: "هنوز چیزی جستجو نکرده‌اید.",
    history_clear: "پاک کردن تاریخچه",
    docs_title: "مستندات API",
    docs_intro: "این API نسخه‌دار، JSON استاندارد برمی‌گرداند و برای برنامه‌نویس‌ها رایگان است.",
    try_it: "امتحان زنده",
    send: "ارسال",
    errors_table: "جدول خطاها",
    samples_title: "نمونهٔ کد",
    code: "کد",
    http: "HTTP",
    meaning: "معنی",
    copy_success: "کپی شد!",
    paste_fail: "دسترسی به کلیپ‌بورد ممکن نشد.",
    err_prefix: "خطا",
    download: "دانلود",
    stream_note: "دانلود از طریق همین سرویس و با پشتیبانی از Range و پخش داخل صفحه انجام می‌شود.",
    faq_title: "سؤالات متداول",
    tos_title: "شرایط استفاده و سلب مسئولیت (DMCA)",
    about_title: "درباره و راه‌اندازی",
    footer_note: "این پروژه مستقل است و به اینستاگرام یا متا وابسته نیست.",
    contact: "تماس/گزارش",
    build: "نسخهٔ ساخت",
    empty_result: "نتیجه‌ای یافت نشد.",
    album_item: "آیتم",
    audio_only: "فقط صدا",
    debug_panel: "پنل خطاهای JS (debug)",
    no_errors: "خطایی ثبت نشد.",
    api_key: "کلید API (اختیاری)",
    api_key_ph: "برای سقف بالاتر",
    variants_label: "کیفیت‌های موجود",
    selected_quality: "انتخاب‌شده",
    zip_preparing: "آماده‌سازی ZIP…",
    zip_progress: "دانلود آیتم‌ها…",
    zip_done: "ZIP آماده شد.",
    zip_failed: "ساخت ZIP ناموفق بود.",
    zip_partial: "بعضی آیتم‌ها دانلود نشدند؛ ZIP ناقص است.",
    download_started: "دانلود آغاز شد.",
    offline_hint: "ارتباط با سرور برقرار نشد.",
    skip_to_tool: "پرش به ابزار",
  },
  en: {
    dir: "ltr",
    langName: "English",
    brand: "Insta Downloader",
    tagline: "Download Instagram posts, reels and IGTV — fast, clean, ad-free",
    nav_tool: "Tool",
    nav_history: "History",
    nav_docs: "API Docs",
    nav_faq: "FAQ",
    nav_tos: "Terms",
    nav_about: "About",
    theme_toggle: "Toggle theme",
    lang_toggle: "فارسی",
    menu_open: "Open menu",
    menu_close: "Close menu",
    input_label: "Instagram link",
    input_placeholder: "https://www.instagram.com/reel/...",
    btn_resolve: "Fetch",
    btn_paste: "Paste",
    btn_clear: "Clear",
    resolving: "Fetching preview…",
    quality_label: "Quality / format",
    btn_download: "Download",
    btn_download_all: "Download all (ZIP)",
    btn_copy: "Copy link",
    btn_share: "Share",
    btn_report: "Report/Remove content",
    btn_play: "Play preview",
    type: "Type",
    items: "Items",
    duration: "Duration",
    dimensions: "Dimensions",
    file_size: "Approx. size",
    source: "Source link",
    author: "Author",
    caption: "Caption",
    only_one_quality: "Only one version is available; no other quality exists.",
    best: "Best",
    history_title: "Recent history",
    history_empty: "Nothing searched yet.",
    history_clear: "Clear history",
    docs_title: "API Documentation",
    docs_intro: "A versioned API returning a standard JSON envelope, free for developers.",
    try_it: "Live try it",
    send: "Send",
    errors_table: "Error table",
    samples_title: "Code samples",
    code: "Code",
    http: "HTTP",
    meaning: "Meaning",
    copy_success: "Copied!",
    paste_fail: "Clipboard access was denied.",
    err_prefix: "Error",
    download: "Download",
    stream_note: "Downloads are proxied through this service with Range support and in-page playback.",
    faq_title: "FAQ",
    tos_title: "Terms of Use & Disclaimer (DMCA)",
    about_title: "About & Setup",
    footer_note: "This is an independent project, not affiliated with Instagram or Meta.",
    contact: "Contact/Report",
    build: "Build",
    empty_result: "No result found.",
    album_item: "Item",
    audio_only: "Audio only",
    debug_panel: "JS error panel (debug)",
    no_errors: "No errors captured.",
    api_key: "API key (optional)",
    api_key_ph: "For a higher limit",
    variants_label: "Available qualities",
    selected_quality: "Selected",
    zip_preparing: "Preparing ZIP…",
    zip_progress: "Downloading items…",
    zip_done: "ZIP is ready.",
    zip_failed: "Could not build the ZIP.",
    zip_partial: "Some items failed to download; the ZIP is incomplete.",
    download_started: "Download started.",
    offline_hint: "Could not reach the server.",
    skip_to_tool: "Skip to the tool",
  },
};

const MESSAGES = {
  fa: { ...API_MESSAGES.fa, ...UI_MESSAGES.fa },
  en: { ...API_MESSAGES.en, ...UI_MESSAGES.en },
};

// ---------------------------------------------------------------------------
// Documentation catalogue (rendered by the client script and served to it in
// the boot payload, so the page contains no hard-coded English text).
//
// Shape:
//   endpoints: [ [ "METHOD /path", description, parameters ], ... ]
//   errors:    [ [ code, httpStatus, meaning ], ... ]
//   faq:       [ [ question, answer ], ... ]
//   tos:       [ paragraph, ... ]
//   about:     [ paragraph, ... ]
// ---------------------------------------------------------------------------
const DOCS = {
  fa: {
    endpoints: [
      ["GET /api/v1/resolve", "دریافت متادیتا و فهرست کیفیت‌های یک پست/ریل/IGTV عمومی", "url (اجباری)، lang، X-API-Key (اختیاری)"],
      ["GET /api/v1/download", "دانلود یا استریم یک نسخه با پشتیبانی کامل از Range", "url (اجباری)، quality، index، inline=1 (پخش در صفحه)، lang"],
      ["GET /api/v1/thumbnail", "پروکسی امن تصویر بندانگشتی از CDN مجاز", "url (اجباری)، lang"],
      ["GET /health", "وضعیت سرویس، providerها و محدودیت‌ها", "deep=1 (بررسی زندهٔ providerها)"],
      ["GET /openapi.json", "مشخصات OpenAPI همین سرویس", "-"],
      ["GET /api/v1/admin/keys", "مدیریت کلیدهای API (نیازمند ADMIN_TOKEN)", "Bearer <ADMIN_TOKEN>"],
    ],
    errors: [
      ["E_INVALID_URL", 400, "لینک نامعتبر است"],
      ["E_INVALID_REQUEST", 400, "بدنه یا پارامترهای درخواست نامعتبر است"],
      ["E_BAD_QUALITY", 400, "کیفیت انتخاب‌شده وجود ندارد"],
      ["E_BAD_INDEX", 400, "شمارهٔ آیتم خارج از محدوده است"],
      ["E_METHOD", 405, "متد HTTP مجاز نیست"],
      ["E_UNAUTHORIZED", 401, "توکن ادمین نامعتبر یا غایب است"],
      ["E_FORBIDDEN", 403, "این عملیات مجاز نیست"],
      ["E_NOT_FOUND", 404, "مسیر یافت نشد"],
      ["E_NOT_ALLOWED_HOST", 400, "میزبان فایل در allowlist نیست"],
      ["E_NOT_ALLOWED_TYPE", 400, "نوع محتوای فایل قابل پروکسی نیست"],
      ["E_RATE_LIMIT", 429, "محدودیت نرخ درخواست"],
      ["E_TOO_LARGE", 413, "حجم فایل از سقف مجاز بیشتر است"],
      ["E_PRIVATE_OR_NOT_FOUND", 404, "محتوا عمومی نیست یا حذف شده است"],
      ["E_NO_VARIANTS", 404, "هیچ نسخهٔ قابل دانلودی یافت نشد"],
      ["E_KEY_DISABLED", 409, "کلید API غیرفعال شده است"],
      ["E_KEY_EXISTS", 409, "کلید API از قبل وجود دارد"],
      ["E_UPSTREAM_FAILED", 502, "خطای سرویس منبع"],
      ["E_UPSTREAM_UNAVAILABLE", 502, "هیچ provider در دسترس نیست"],
      ["E_INTERNAL", 500, "خطای داخلی سرور"],
    ],
    faq: [
      ["آیا محتوای خصوصی قابل دانلود است؟", "نه. فقط پست‌ها، ریل‌ها و IGTV عمومی. ورود به حساب، کوکی و استخراج انبوه پیاده‌سازی نشده است."],
      ["چرا بعضی لینک‌ها فقط یک کیفیت دارند؟", "چون منبع فقط یک نسخه برمی‌گرداند. ما کیفیت جعلی نمی‌سازیم و صادقانه اطلاع می‌دهیم."],
      ["آیا لینک‌های دانلود دائمی هستند؟", "خیر. لینک‌های اینستاگرام امضادار و کوتاه‌عمرند؛ دانلود از طریق پروکسی همین سرویس انجام می‌شود."],
      ["داده‌های من ذخیره می‌شود؟", "فقط آمار ناشناس؛ IP خام هرگز ذخیره نمی‌شود و به‌جای آن یک hash یکتا (HMAC) در KV ثبت می‌گردد. تاریخچهٔ جست‌وجوی شما فقط در مرورگر (localStorage) می‌ماند."],
      ["آیا می‌توانم از این سرویس در برنامهٔ خودم استفاده کنم؟", "بله. API بدون وابستگی به SDK و با پاسخ JSON یکدست است. برای سقف نرخ بالاتر یک کلید API بسازید."],
      ["از کجا می‌توانم محتوا را گزارش کنم؟", "از لینک «تماس/گزارش» در پاورقی صفحه استفاده کنید. درخواست‌های حذف محتوا (DMCA) هم از همان مسیر پیگیری می‌شوند."],
    ],
    tos: [
      "این سرویس فقط برای مصارف شخصی و محتوای کاملاً عمومی طراحی شده است.",
      "استفادهٔ تجاری، انبوه یا دور زدن محدودیت‌های اینستاگرام مجاز نیست.",
      "مسئولیت رعایت حق نشر بر عهدهٔ کاربر است؛ نام صاحب محتوا و لینک اصلی نمایش داده می‌شود.",
      "هیچ گذرواژه، کوکی یا توکن نشستی جمع‌آوری یا ذخیره نمی‌شود.",
      "برای درخواست حذف (DMCA / Takedown) از لینک تماس پایین صفحه استفاده کنید.",
      "سرویس «همان‌طور که هست» ارائه می‌شود و هیچ تضمینی برای در دسترس بودن یا صحت نتایج نیست.",
    ],
    about: [
      "این یک Worker مستقل روی زیرساخت Cloudflare است و کاملاً مستقل از اینستاگرام و متا عمل می‌کند.",
      "معماری: لایهٔ provider قابل‌تعویض، نرمال‌سازی پاسخ، پروکسی امن با allowlist و محافظ SSRF، KV برای کش و محدودیت نرخ، D1 برای آمار.",
      "راه‌اندازی: مخزن را fork کنید، متغیرهای محیطی را تنظیم کنید و با Wrangler یا GitHub Actions منتشر کنید.",
      "همهٔ متون رابط کاربری دو‌زبانه (فارسی/انگلیسی) و بدون وابستگی به فریم‌ورک است.",
    ],
  },
  en: {
    endpoints: [
      ["GET /api/v1/resolve", "Fetch metadata and the quality list of a public post/reel/IGTV", "url (required), lang, X-API-Key (optional)"],
      ["GET /api/v1/download", "Download or stream one variant with full Range support", "url (required), quality, index, inline=1 (in-page playback), lang"],
      ["GET /api/v1/thumbnail", "Safely proxy a thumbnail from an allowlisted CDN", "url (required), lang"],
      ["GET /health", "Service status, providers and limits", "deep=1 (live provider check)"],
      ["GET /openapi.json", "OpenAPI specification of this service", "-"],
      ["GET /api/v1/admin/keys", "Manage API keys (requires ADMIN_TOKEN)", "Bearer <ADMIN_TOKEN>"],
    ],
    errors: [
      ["E_INVALID_URL", 400, "The link is not a valid Instagram URL"],
      ["E_INVALID_REQUEST", 400, "The request body or parameters are invalid"],
      ["E_BAD_QUALITY", 400, "The selected quality does not exist"],
      ["E_BAD_INDEX", 400, "The item index is out of range"],
      ["E_METHOD", 405, "The HTTP method is not allowed"],
      ["E_UNAUTHORIZED", 401, "The admin token is missing or invalid"],
      ["E_FORBIDDEN", 403, "This operation is not allowed"],
      ["E_NOT_FOUND", 404, "Route not found"],
      ["E_NOT_ALLOWED_HOST", 400, "The file host is not in the allowlist"],
      ["E_NOT_ALLOWED_TYPE", 400, "The content type cannot be proxied"],
      ["E_RATE_LIMIT", 429, "Rate limit exceeded"],
      ["E_TOO_LARGE", 413, "The file exceeds the size cap"],
      ["E_PRIVATE_OR_NOT_FOUND", 404, "The content is not public or was removed"],
      ["E_NO_VARIANTS", 404, "No downloadable variant was found"],
      ["E_KEY_DISABLED", 409, "The API key is disabled"],
      ["E_KEY_EXISTS", 409, "The API key already exists"],
      ["E_UPSTREAM_FAILED", 502, "The upstream service failed"],
      ["E_UPSTREAM_UNAVAILABLE", 502, "No provider is available"],
      ["E_INTERNAL", 500, "Internal server error"],
    ],
    faq: [
      ["Can private content be downloaded?", "No. Only public posts, reels and IGTV. There is no account login, no cookies and no bulk extraction."],
      ["Why does some link have only one quality?", "Because the upstream returns a single version. We never invent fake qualities and we say so honestly."],
      ["Are the download links permanent?", "No. Instagram links are signed and short-lived; downloads are proxied through this service."],
      ["Is my data stored?", "Only anonymous stats. A raw IP is never stored — a unique HMAC hash is kept in KV instead. Your search history stays in your browser (localStorage)."],
      ["Can I use this service in my own app?", "Yes. The API is dependency-free and returns a uniform JSON envelope. Create an API key for a higher rate limit."],
      ["Where can I report content?", "Use the contact/report link in the footer. DMCA takedown requests follow the same route."],
    ],
    tos: [
      "This service is designed for personal use with fully public content only.",
      "Commercial or bulk use, or circumventing Instagram limits, is not allowed.",
      "You are responsible for respecting copyright; the author name and the source link are shown.",
      "No password, cookie or session token is ever collected or stored.",
      "For DMCA / takedown requests use the contact link in the footer.",
      "The service is provided as-is, without any guarantee of availability or result accuracy.",
    ],
    about: [
      "This is an independent Worker running on Cloudflare infrastructure and is not affiliated with Instagram or Meta.",
      "Architecture: a pluggable provider layer, response normalisation, an allowlisted secure proxy with SSRF protection, KV for cache and rate limiting, D1 for statistics.",
      "Setup: fork the repository, configure the environment variables and deploy with Wrangler or GitHub Actions.",
      "The whole user interface is bilingual (Persian/English) and framework-free.",
    ],
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

/**
 * Look up a message. Unknown languages fall back to fa, unknown keys fall
 * back to English and finally to the key itself, so a missing translation is
 * visible instead of rendering "undefined".
 */
export function t(lang, key) {
  const table = MESSAGES[lang] || MESSAGES[DEFAULT_LANG];
  if (key in table) return table[key];
  if (key in MESSAGES.en) return MESSAGES.en[key];
  return String(key);
}

/** The whole UI catalogue for a language (handed to the client script). */
export function uiStrings(lang) {
  const table = MESSAGES[lang] || MESSAGES[DEFAULT_LANG];
  return { ...table };
}

/**
 * The documentation catalogue for a language (handed to the client script).
 * Unknown languages fall back to the default one.
 */
export function docsFor(lang) {
  const docs = DOCS[lang] || DOCS[DEFAULT_LANG];
  return {
    endpoints: docs.endpoints.map((row) => [...row]),
    errors: docs.errors.map((row) => [...row]),
    faq: docs.faq.map((row) => [...row]),
    tos: [...docs.tos],
    about: [...docs.about],
  };
}

/** Keys present in one language but missing in another (test helper). */
export function missingKeys(lang) {
  const table = MESSAGES[lang] || {};
  return Object.keys(MESSAGES.en).filter((k) => !(k in table));
}

export function isRtl(lang) {
  return lang === "fa";
}
