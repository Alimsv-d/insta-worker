// Single-file UI (HTML + CSS + JS) rendered into the worker. No third-party
// JS frameworks. Content is visible by default (no hidden-until-scroll or
// hidden-until-JS sections); animations are progressive enhancements; a
// /?debug=1 mode surfaces JS errors in a red panel.

import { escapeHtml } from "./security.js";

const FONT_CDN = "https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css";

const STRINGS = {
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
    footer_note: "این پروژه مستقل است و به اینستاگرام وابسته یا وابسته به متا نیست.",
    contact: "تماس/گزارش",
    build: "نسخهٔ ساخت",
    empty_result: "نتیجه‌ای یافت نشد.",
    album_item: "آیتم",
    audio_only: "فقط صدا",
    debug_panel: "پنل خطاهای JS (debug)",
    no_errors: "خطایی ثبت نشد.",
    api_key: "کلید API (اختیاری)",
    api_key_ph: "برای سقف بالاتر",
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
  },
};

function fmtBytes(n) {
  if (!n || !Number.isFinite(Number(n))) return null;
  const b = Number(n);
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = b;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function scriptJson(value) {
  // Safe embedding inside <script type="application/json">.
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

/**
 * @param {{lang:string, nonce:string, build:string, contact:string, defaultLang:string}} opts
 */
export function renderHome(opts) {
  const lang = STRINGS[opts.lang] ? opts.lang : "fa";
  const S = STRINGS[lang];
  const nonce = opts.nonce;
  const build = escapeHtml(opts.build || "dev");
  const contact = escapeHtml(opts.contact || "#");
  const debug = !!opts.debug;

  const bootData = scriptJson({
    lang,
    defaultLang: opts.defaultLang || "fa",
    build: opts.build || "dev",
    contact: opts.contact || "",
    debug,
    strings: S,
  });

  return `<!doctype html>
<html lang="${lang}" dir="${S.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(S.brand)} — ${escapeHtml(S.tagline)}</title>
<meta name="description" content="${escapeHtml(S.tagline)}">
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="stylesheet" href="${FONT_CDN}">
<style>${CSS}</style>
</head>
<body data-lang="${lang}">
<a class="skip" href="#tool">${escapeHtml(S.nav_tool)}</a>
<header class="topbar">
  <div class="wrap row">
    <a class="brand" href="/">
      <span class="logo" aria-hidden="true">${LOGO_SVG}</span>
      <span class="brand-text"><strong>${escapeHtml(S.brand)}</strong><small>${escapeHtml(S.tagline)}</small></span>
    </a>
    <nav class="nav" aria-label="primary">
      <a href="#tool">${escapeHtml(S.nav_tool)}</a>
      <a href="#history">${escapeHtml(S.nav_history)}</a>
      <a href="#docs">${escapeHtml(S.nav_docs)}</a>
      <a href="#faq">${escapeHtml(S.nav_faq)}</a>
      <a href="#tos">${escapeHtml(S.nav_tos)}</a>
      <a href="#about">${escapeHtml(S.nav_about)}</a>
    </nav>
    <div class="actions">
      <button id="langBtn" class="icon-btn" type="button" aria-label="${escapeHtml(S.lang_toggle)}">${ICONS.globe}<span class="sr-only">${escapeHtml(S.lang_toggle)}</span></button>
      <button id="themeBtn" class="icon-btn" type="button" aria-label="${escapeHtml(S.theme_toggle)}">${ICONS.moon}<span class="sr-only">${escapeHtml(S.theme_toggle)}</span></button>
    </div>
  </div>
</header>

<main class="wrap">
  <!-- TOOL -->
  <section id="tool" class="hero reveal">
    <h1>${escapeHtml(S.brand)}</h1>
    <p class="lede">${escapeHtml(S.tagline)}</p>
    <form id="resolveForm" class="card tool-card" autocomplete="off">
      <label for="urlInput">${escapeHtml(S.input_label)}</label>
      <div class="input-row">
        <input id="urlInput" name="url" type="url" inputmode="url" dir="ltr" placeholder="${escapeHtml(S.input_placeholder)}" aria-describedby="urlHelp">
        <button type="button" id="pasteBtn" class="btn ghost">${ICONS.clipboard}<span>${escapeHtml(S.btn_paste)}</span></button>
        <button type="button" id="clearBtn" class="btn ghost">${ICONS.x}<span>${escapeHtml(S.btn_clear)}</span></button>
      </div>
      <div class="input-row">
        <input id="apiKeyInput" type="password" dir="ltr" placeholder="${escapeHtml(S.api_key_ph)}" aria-label="${escapeHtml(S.api_key)}">
        <button type="submit" id="resolveBtn" class="btn primary">${ICONS.search}<span>${escapeHtml(S.btn_resolve)}</span></button>
      </div>
      <p id="urlHelp" class="hint">${escapeHtml(S.stream_note)}</p>
    </form>

    <div id="status" class="status" role="status" aria-live="polite"></div>
    <div id="skeleton" class="skeleton card" hidden aria-hidden="true">
      <div class="sk-line"></div><div class="sk-media"></div><div class="sk-line short"></div>
    </div>

    <div id="result" class="result" hidden></div>
  </section>

  <!-- HISTORY -->
  <section id="history" class="reveal">
    <div class="sec-head">
      <h2>${escapeHtml(S.history_title)}</h2>
      <button id="clearHistory" class="btn ghost small" type="button">${escapeHtml(S.history_clear)}</button>
    </div>
    <div id="historyList" class="history-grid"></div>
  </section>

  <!-- DOCS -->
  <section id="docs" class="reveal">
    <h2>${escapeHtml(S.docs_title)}</h2>
    <p>${escapeHtml(S.docs_intro)}</p>
    <div class="endpoints" id="endpoints"></div>

    <h3>${escapeHtml(S.try_it)}</h3>
    <div class="card try-card">
      <div class="input-row">
        <select id="tryEndpoint" aria-label="endpoint">
          <option value="/api/v1/resolve">GET /api/v1/resolve</option>
          <option value="/api/v1/thumbnail">GET /api/v1/thumbnail</option>
          <option value="/api/v1/download">GET /api/v1/download</option>
          <option value="/health">GET /health</option>
          <option value="/openapi.json">GET /openapi.json</option>
        </select>
        <input id="tryUrl" dir="ltr" placeholder="${escapeHtml(S.input_placeholder)}">
        <button id="trySend" class="btn primary" type="button">${escapeHtml(S.send)}</button>
      </div>
      <pre id="tryOut" class="code-block" aria-live="polite"></pre>
    </div>

    <h3>${escapeHtml(S.errors_table)}</h3>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>${escapeHtml(S.code)}</th><th>${escapeHtml(S.http)}</th><th>${escapeHtml(S.meaning)}</th></tr></thead>
      <tbody id="errorsBody"></tbody>
    </table></div>

    <h3>Samples</h3>
    <div class="samples" id="samples"></div>
  </section>

  <!-- FAQ -->
  <section id="faq" class="reveal">
    <h2>${escapeHtml(S.faq_title)}</h2>
    <div id="faqList" class="faq"></div>
  </section>

  <!-- TOS -->
  <section id="tos" class="reveal">
    <h2>${escapeHtml(S.tos_title)}</h2>
    <div id="tosBody" class="prose"></div>
  </section>

  <!-- ABOUT -->
  <section id="about" class="reveal">
    <h2>${escapeHtml(S.about_title)}</h2>
    <div id="aboutBody" class="prose"></div>
  </section>
</main>

<footer class="footer wrap">
  <p>${escapeHtml(S.footer_note)}</p>
  <p><a href="${contact}" rel="noopener">${escapeHtml(S.contact)}</a> · ${escapeHtml(S.build)}: <code>${build}</code></p>
</footer>

<div id="toast" class="toast" role="status" aria-live="polite" hidden></div>
${debug ? `<aside id="debugPanel" class="debug"><header>${escapeHtml(S.debug_panel)} <button id="debugClear" type="button">×</button></header><ol id="debugList"></ol></aside>` : ""}

<script id="boot" type="application/json">${bootData}</script>
<script nonce="${nonce}">${CLIENT_JS}</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Inline SVG icons
// ---------------------------------------------------------------------------
export const ICONS = {
  globe: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18"/></svg>`,
  moon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.5 6.5 0 0 0 9.8 9.8z"/></svg>`,
  clipboard: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/></svg>`,
  x: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  search: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>`,
  download: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16"/></svg>`,
  play: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>`,
  share: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3v13m0-13l-4 4m4-4l4 4M5 21h14"/></svg>`,
  report: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 21V4h11l-1 3h6l-1 3h-5l1 3H4"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-8 0l1 14h8l1-14"/></svg>`,
};

export const LOGO_SVG = `<svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f9ce34"/><stop offset=".5" stop-color="#ee2a7b"/><stop offset="1" stop-color="#6228d7"/></linearGradient></defs><rect x="4" y="4" width="40" height="40" rx="12" fill="url(#lg)"/><rect x="14" y="14" width="20" height="20" rx="6" fill="none" stroke="#fff" stroke-width="2.6"/><circle cx="24" cy="24" r="5" fill="none" stroke="#fff" stroke-width="2.6"/><circle cx="31" cy="17" r="1.8" fill="#fff"/></svg>`;

const CSS = `
:root{
  --bg:#f6f7fb; --bg2:#ffffff; --fg:#12141a; --muted:#5b6472; --line:#e4e7ef;
  --card:#ffffff; --shadow:0 10px 30px rgba(16,24,40,.08); --brand:#e1306c; --brand2:#6228d7;
  --ok:#0f9d58; --err:#d93025; --warn:#b06000; --radius:16px; --max:1080px;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --bg:#0e1016; --bg2:#141823; --fg:#eef1f7; --muted:#9aa4b6; --line:#242b39;
    --card:#171c27; --shadow:0 12px 34px rgba(0,0,0,.5);
  }
}
:root[data-theme="dark"]{
  --bg:#0e1016; --bg2:#141823; --fg:#eef1f7; --muted:#9aa4b6; --line:#242b39;
  --card:#171c27; --shadow:0 12px 34px rgba(0,0,0,.5);
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:linear-gradient(180deg,var(--bg),var(--bg2));color:var(--fg);
  font-family:Vazirmatn,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.7;
  -webkit-font-smoothing:antialiased}
a{color:var(--brand);text-decoration:none}
a:hover{text-decoration:underline}
.wrap{max-width:var(--max);margin:0 auto;padding:0 18px}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.skip{position:absolute;inset-inline-start:-9999px;top:8px;background:var(--card);padding:8px 12px;border-radius:8px;z-index:50}
.skip:focus{inset-inline-start:8px}
.topbar{position:sticky;top:0;z-index:40;background:color-mix(in srgb,var(--bg) 82%,transparent);
  backdrop-filter:saturate(1.4) blur(10px);border-bottom:1px solid var(--line)}
.topbar .row{display:flex;align-items:center;gap:14px;min-height:64px}
.brand{display:flex;align-items:center;gap:10px;color:inherit}
.brand-text strong{display:block;font-size:1.05rem;line-height:1.2}
.brand-text small{display:none;color:var(--muted);font-size:.72rem}
@media(min-width:820px){.brand-text small{display:block}}
.nav{display:none;gap:6px;margin-inline-start:auto}
@media(min-width:900px){.nav{display:flex}}
.nav a{padding:8px 12px;border-radius:10px;color:var(--muted);font-weight:600;font-size:.92rem}
.nav a:hover,.nav a:focus-visible{background:color-mix(in srgb,var(--brand) 12%,transparent);color:var(--fg);text-decoration:none}
.actions{display:flex;gap:8px;margin-inline-start:auto}
@media(min-width:900px){.actions{margin-inline-start:0}}
.icon-btn{display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;
  border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:12px;cursor:pointer;transition:.2s}
.icon-btn:hover{transform:translateY(-1px);border-color:var(--brand)}
section{padding:38px 0;scroll-margin-top:78px}
h1{font-size:clamp(1.8rem,5vw,2.8rem);margin:.2em 0}
h2{font-size:clamp(1.3rem,3.4vw,1.9rem);margin:.2em 0}
h3{margin-top:1.4em}
.lede{color:var(--muted);font-size:1.08rem;margin-top:-.4em}
.hero h1{background:linear-gradient(120deg,var(--brand),var(--brand2));-webkit-background-clip:text;background-clip:text;color:transparent}
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:18px}
.tool-card{display:grid;gap:12px;margin-top:8px}
.tool-card label{font-weight:700;font-size:.95rem}
.input-row{display:flex;gap:10px;flex-wrap:wrap}
.input-row>*{flex:1 1 160px;min-width:0}
input,select{width:100%;padding:13px 14px;border:1px solid var(--line);border-radius:12px;
  background:var(--bg2);color:var(--fg);font:inherit;transition:.2s}
input:focus-visible,select:focus-visible,button:focus-visible,a:focus-visible{outline:3px solid color-mix(in srgb,var(--brand) 55%,transparent);outline-offset:2px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:12px 16px;border-radius:12px;
  border:1px solid var(--line);background:var(--card);color:var(--fg);font:inherit;font-weight:700;cursor:pointer;transition:.2s;white-space:nowrap}
.btn:hover{transform:translateY(-1px)}
.btn.primary{background:linear-gradient(120deg,var(--brand),var(--brand2));border:0;color:#fff}
.btn.ghost{background:transparent}
.btn.small{padding:7px 11px;font-size:.85rem}
.hint{color:var(--muted);font-size:.85rem;margin:0}
.status{margin:10px 0;min-height:1.4em;font-weight:600}
.status.err{color:var(--err)}
.status.ok{color:var(--ok)}
.result{display:grid;gap:16px}
.result:not([hidden]){animation:fadeUp .45s ease both}
.preview{display:grid;grid-template-columns:1fr;gap:16px}
@media(min-width:760px){.preview{grid-template-columns:320px 1fr}}
.media-box{position:relative;border-radius:14px;overflow:hidden;background:#000;aspect-ratio:9/16;max-height:520px}
.media-box img,.media-box video{width:100%;height:100%;object-fit:contain;display:block}
.meta{display:grid;gap:8px;align-content:start}
.meta .author{display:flex;align-items:center;gap:10px}
.meta .author img{width:44px;height:44px;border-radius:50%;object-fit:cover;border:1px solid var(--line)}
.pill{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:999px;
  background:color-mix(in srgb,var(--brand) 12%,transparent);color:var(--fg);font-size:.82rem;font-weight:600}
.chips{display:flex;flex-wrap:wrap;gap:8px}
.caption{white-space:pre-wrap;word-break:break-word;color:var(--muted);max-height:9em;overflow:auto}
.variants{display:grid;gap:10px}
.variant{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px;border:1px solid var(--line);border-radius:12px}
.variant .v-info{flex:1 1 180px}
.variant .v-info b{display:block}
.variant .v-info span{color:var(--muted);font-size:.85rem}
.album-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px}
.album-item{border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--bg2)}
.album-item .thumb{aspect-ratio:1;background:#000;display:flex;align-items:center;justify-content:center}
.album-item .thumb img,.album-item .thumb video{width:100%;height:100%;object-fit:cover}
.album-item .body{padding:10px;display:grid;gap:8px}
.history-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}
.history-card{display:flex;gap:10px;align-items:center;padding:10px;border:1px solid var(--line);border-radius:12px;background:var(--card);cursor:pointer;text-align:start}
.history-card img{width:56px;height:56px;border-radius:10px;object-fit:cover;flex:none;background:#000}
.history-card .hc-body{min-width:0}
.history-card .hc-body b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.history-card .hc-body small{color:var(--muted)}
.endpoints{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;margin-top:12px}
.endpoint{padding:14px;border:1px solid var(--line);border-radius:12px;background:var(--card)}
.endpoint code{font-weight:700;color:var(--brand)}
.endpoint p{margin:.4em 0;color:var(--muted);font-size:.9rem}
.code-block{background:#0c0f16;color:#d6e2ff;padding:14px;border-radius:12px;overflow:auto;direction:ltr;text-align:left;
  font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.85rem;max-height:420px}
.samples{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
.table-wrap{overflow:auto;border:1px solid var(--line);border-radius:12px}
.table{width:100%;border-collapse:collapse;font-size:.9rem;background:var(--card)}
.table th,.table td{padding:10px 12px;text-align:start;border-bottom:1px solid var(--line)}
.table th{background:color-mix(in srgb,var(--brand) 8%,transparent)}
.table code{color:var(--brand);font-weight:700}
.faq details{border:1px solid var(--line);border-radius:12px;background:var(--card);margin-bottom:10px;padding:6px 14px}
.faq summary{cursor:pointer;font-weight:700;padding:10px 0}
.faq summary::marker{color:var(--brand)}
.faq p{color:var(--muted)}
.prose{max-width:70ch}
.footer{padding:34px 0 60px;color:var(--muted);font-size:.9rem;display:flex;flex-direction:column;gap:6px}
.skeleton{display:grid;gap:12px}
.sk-line,.sk-media{background:linear-gradient(90deg,var(--line),color-mix(in srgb,var(--line) 40%,transparent),var(--line));
  background-size:200% 100%;animation:sk 1.2s infinite;border-radius:10px}
.sk-line{height:16px}.sk-line.short{width:40%}.sk-media{height:280px;border-radius:14px}
@keyframes sk{0%{background-position:200% 0}100%{background-position:-200% 0}}
.toast{position:fixed;inset-block-end:20px;inset-inline:0;margin:auto;width:fit-content;max-width:90vw;
  background:var(--fg);color:var(--bg);padding:10px 16px;border-radius:999px;z-index:60;animation:fadeUp .3s ease both}
.debug{position:fixed;inset-block-end:0;inset-inline:0;max-height:40vh;overflow:auto;background:#7a0b0b;color:#fff;
  z-index:70;font-family:ui-monospace,monospace;font-size:.8rem;padding:0}
.debug header{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:#9b0d0d;font-weight:700;position:sticky;top:0}
.debug ol{margin:0;padding:10px 16px}
.debug li{margin-bottom:6px;white-space:pre-wrap}
.reveal{opacity:1;transform:none}
@media (prefers-reduced-motion: no-preference){
  .reveal{opacity:0;transform:translateY(14px);transition:opacity .5s ease,transform .5s ease}
  .reveal.in{opacity:1;transform:none}
  @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
}
`;

const DOWNLOAD_ICON_SVG = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16"/></svg>`;

const CLIENT_JS = `
(function(){
  "use strict";
  var ICON_DL = ${JSON.stringify(DOWNLOAD_ICON_SVG)};
  var boot = {};
  try { boot = JSON.parse(document.getElementById('boot').textContent || '{}'); } catch(e){}
  var S = boot.strings || {};
  var debug = !!boot.debug;
  var errors = [];
  function report(msg){
    errors.push(msg);
    if(!debug) return;
    var list = document.getElementById('debugList');
    if(list){ var li=document.createElement('li'); li.textContent = msg; list.appendChild(li); }
  }
  if(debug){
    window.addEventListener('error', function(ev){ report('Error: ' + (ev.message||'') + ' @' + (ev.filename||'') + ':' + (ev.lineno||'')); });
    window.addEventListener('unhandledrejection', function(ev){ report('UnhandledRejection: ' + (ev.reason && ev.reason.message ? ev.reason.message : ev.reason)); });
    var dc = document.getElementById('debugClear');
    if(dc) dc.addEventListener('click', function(){ var l=document.getElementById('debugList'); if(l) l.innerHTML=''; });
  }
  window.__instaDebug = errors;

  function $(id){ return document.getElementById(id); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }
  function toast(msg){
    var t = $('toast'); if(!t) return;
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(function(){ t.hidden = true; }, 2200);
  }
  function api(path){
    return fetch(path, { headers: { 'accept': 'application/json' } }).then(function(r){
      return r.json().then(function(j){ return { status: r.status, ok: r.ok, body: j }; });
    });
  }
  function fmtBytes(n){
    if(n==null||isNaN(Number(n))) return null; var b=Number(n), u=['B','KB','MB','GB'], i=0;
    while(b>=1024&&i<u.length-1){b/=1024;i++;} return (b>=10||i===0?b.toFixed(0):b.toFixed(1))+' '+u[i];
  }
  function fmtDuration(n){
    n = Number(n); if(!isFinite(n)||n<=0) return null;
    if(n>1000) n = n/1000; // milliseconds -> seconds
    var s = Math.round(n), m = Math.floor(s/60), sec = s%60;
    return m>0 ? (m+':'+(sec<10?'0':'')+sec) : (sec+'s');
  }

  // ---- theme ----
  function applyTheme(mode){ try{ if(mode==='dark'||mode==='light'){document.documentElement.setAttribute('data-theme',mode);} }catch(e){} }
  try{ applyTheme(localStorage.getItem('iw-theme')); }catch(e){}
  var themeBtn=$('themeBtn');
  if(themeBtn) themeBtn.addEventListener('click', function(){
    var cur = document.documentElement.getAttribute('data-theme');
    var dark = cur ? cur==='dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    var next = dark ? 'light':'dark';
    applyTheme(next);
    try{ localStorage.setItem('iw-theme', next); }catch(e){}
  });

  // ---- language ----
  var langBtn=$('langBtn');
  if(langBtn) langBtn.addEventListener('click', function(){
    var cur = document.documentElement.getAttribute('lang')==='en' ? 'en':'fa';
    var next = cur==='en' ? 'fa':'en';
    var u = new URL(location.href); u.searchParams.set('lang', next); location.href = u.toString();
  });

  // ---- static docs content (localized) ----
  var DOCS = {
    fa: {
      endpoints: [
        ['GET /api/v1/resolve','دریافت متادیتا و لیست کیفیت‌ها','url','lang'],
        ['GET /api/v1/download','دانلود/استریم با پشتیبانی Range','url، quality، index، lang'],
        ['GET /api/v1/thumbnail','پروکسی امن تصویر بندانگشتی','url، lang'],
        ['GET /health','وضعیت سرویس و providerها','-'],
        ['GET /openapi.json','مشخصات OpenAPI','-']
      ],
      errors: [
        ['E_INVALID_URL',400,'لینک نامعتبر'],['E_PRIVATE_OR_NOT_FOUND',404,'عمومی نیست یا حذف شده'],
        ['E_UPSTREAM_FAILED',502,'خطای منبع'],['E_RATE_LIMIT',429,'محدودیت نرخ'],
        ['E_TOO_LARGE',413,'حجم بیش از حد'],['E_NOT_ALLOWED_HOST',400,'میزبان غیرمجاز'],
        ['E_BAD_QUALITY',400,'کیفیت نامعتبر'],['E_NOT_FOUND',404,'مسیر یافت نشد']
      ],
      faq: [
        ['آیا محتوای خصوصی قابل دانلود است؟','نه. فقط پست‌ها/ریل‌های عمومی. ورود به حساب، کوکی و scraping انبوه پیاده‌سازی نشده است.'],
        ['چرا بعضی لینک‌ها کیفیت فقط یکی دارند؟','چون منبع فقط یک نسخه برمی‌گرداند؛ ما کیفیت جعلی نمی‌سازیم و صادقانه اطلاع می‌دهیم.'],
        ['آیا لینک‌ها دائمی‌اند؟','لینک‌های اینستاگرام امضادار و کوتاه‌عمرند؛ دانلود از طریق پروکسی همین سرویس انجام می‌شود.'],
        ['داده‌های من ذخیره می‌شود؟','فقط آمار ناشناس (بدون IP خام، با hash). تاریخچهٔ شما فقط در مرورگر (localStorage) است.']
      ],
      tos: [
        'این سرویس فقط برای مصارف شخصی و محتوای عمومی طراحی شده است.',
        'استفاده تجاری، انبوه یا دورزدن محدودیت‌های اینستاگرام مجاز نیست.',
        'مسئولیت رعایت حق نشر بر عهدهٔ کاربر است. نام صاحب محتوا و لینک اصلی نمایش داده می‌شود.',
        'برای درخواست حذف (DMCA/Takedown) از لینک تماس پایین صفحه استفاده کنید.'
      ],
      about: [
        'این یک Worker مستقل روی Cloudflare است و هیچ بخشی از تلگرام ندارد.',
        'معماری: لایهٔ provider قابل‌تعویض، نرمال‌سازی پاسخ، پروکسی امن با allowlist، KV برای کش/نرخ، D1 برای آمار.',
        'راه‌اندازی: fork کنید، Secretها را در GitHub بگذارید و با دکمهٔ Deploy یا wrangler منتشر کنید.'
      ]
    },
    en: {
      endpoints: [
        ['GET /api/v1/resolve','Fetch metadata and quality list','url, lang'],
        ['GET /api/v1/download','Download/stream with Range support','url, quality, index, lang'],
        ['GET /api/v1/thumbnail','Safely proxy the thumbnail','url, lang'],
        ['GET /health','Service and provider health','-'],
        ['GET /openapi.json','OpenAPI specification','-']
      ],
      errors: [
        ['E_INVALID_URL',400,'Invalid link'],['E_PRIVATE_OR_NOT_FOUND',404,'Not public or removed'],
        ['E_UPSTREAM_FAILED',502,'Upstream failed'],['E_RATE_LIMIT',429,'Rate limited'],
        ['E_TOO_LARGE',413,'Too large'],['E_NOT_ALLOWED_HOST',400,'Host not allowed'],
        ['E_BAD_QUALITY',400,'Bad quality'],['E_NOT_FOUND',404,'Route not found']
      ],
      faq: [
        ['Can private content be downloaded?','No. Only public posts/reels. No account login, cookies or bulk scraping.'],
        ['Why does a link have only one quality?','Because the upstream returns a single version; we never invent fake qualities.'],
        ['Are the links permanent?','Instagram links are signed and short-lived; downloads are proxied through this service.'],
        ['Is my data stored?','Only anonymous stats (no raw IP, hashed). Your history stays in localStorage.']
      ],
      tos: [
        'This service is for personal use with public content only.',
        'Commercial or bulk use, or circumventing Instagram limits, is not allowed.',
        'You are responsible for respecting copyright. The author name and source link are shown.',
        'For DMCA/Takedown requests use the contact link in the footer.'
      ],
      about: [
        'This is an independent Cloudflare Worker with no Telegram components.',
        'Architecture: pluggable provider layer, response normalisation, allowlisted secure proxy, KV for cache/rate, D1 for stats.',
        'Setup: fork, add Secrets on GitHub and deploy via the button or wrangler.'
      ]
    }
  };
  var D = DOCS[boot.lang] || DOCS.fa;

  function renderStatic(){
    var ep = $('endpoints');
    if(ep) ep.innerHTML = D.endpoints.map(function(e){
      return '<div class="endpoint"><code>'+esc(e[0])+'</code><p>'+esc(e[1])+'</p><p><small>'+esc(e[2])+'</small></p></div>';
    }).join('');
    var eb = $('errorsBody');
    if(eb) eb.innerHTML = D.errors.map(function(e){ return '<tr><td><code>'+esc(e[0])+'</code></td><td>'+esc(e[1])+'</td><td>'+esc(e[2])+'</td></tr>'; }).join('');
    var fq = $('faqList');
    if(fq) fq.innerHTML = D.faq.map(function(f){ return '<details><summary>'+esc(f[0])+'</summary><p>'+esc(f[1])+'</p></details>'; }).join('');
    var tb = $('tosBody');
    if(tb) tb.innerHTML = '<ul>'+D.tos.map(function(x){ return '<li>'+esc(x)+'</li>'; }).join('')+'</ul>';
    var ab = $('aboutBody');
    if(ab) ab.innerHTML = '<ul>'+D.about.map(function(x){ return '<li>'+esc(x)+'</li>'; }).join('')+'</ul>';
    var sm = $('samples');
    if(sm){
      var base = location.origin;
      sm.innerHTML = [
        ['curl', 'curl "'+base+'/api/v1/resolve?url=https://www.instagram.com/reel/ABC123/"'],
        ['Python', 'import requests\\nr = requests.get("'+base+'/api/v1/resolve", params={"url":"https://www.instagram.com/reel/ABC123/"})\\nprint(r.json())'],
        ['PHP', '$j = file_get_contents("'+base+'/api/v1/resolve?url=".urlencode("https://www.instagram.com/reel/ABC123/"));\\necho $j;'],
        ['JavaScript', 'const j = await (await fetch("'+base+'/api/v1/resolve?url=https://www.instagram.com/reel/ABC123/")).json();\\nconsole.log(j);'],
        ['Node.js', 'import fetch from "node-fetch";\\nconst j = await (await fetch("'+base+'/api/v1/resolve?url=https://www.instagram.com/reel/ABC123/")).json();']
      ].map(function(s){ return '<div class="card"><b>'+esc(s[0])+'</b><pre class="code-block">'+esc(s[1])+'</pre></div>'; }).join('');
    }
  }
  renderStatic();

  // ---- reveal on scroll (progressive) ----
  try{
    var els = document.querySelectorAll('.reveal');
    if('IntersectionObserver' in window){
      var io = new IntersectionObserver(function(entries){
        entries.forEach(function(en){ if(en.isIntersecting){ en.target.classList.add('in'); io.unobserve(en.target); } });
      }, { rootMargin: '0px 0px -10% 0px', threshold: 0.05 });
      els.forEach(function(el){ io.observe(el); });
      setTimeout(function(){ els.forEach(function(el){ el.classList.add('in'); }); }, 1500);
    } else { els.forEach(function(el){ el.classList.add('in'); }); }
  }catch(e){ document.querySelectorAll('.reveal').forEach(function(el){el.classList.add('in');}); }

  // ---- history ----
  var HK = 'iw-history';
  function getHistory(){ try{ return JSON.parse(localStorage.getItem(HK)||'[]'); }catch(e){ return []; } }
  function setHistory(h){ try{ localStorage.setItem(HK, JSON.stringify(h.slice(0,20))); }catch(e){} }
  function addHistory(item){
    var h = getHistory().filter(function(x){ return x.shortcode !== item.shortcode; });
    h.unshift(item); setHistory(h); renderHistory();
  }
  function renderHistory(){
    var wrap = $('historyList'); if(!wrap) return;
    var h = getHistory();
    if(!h.length){ wrap.innerHTML = '<p class="hint">'+esc(S.history_empty)+'</p>'; return; }
    wrap.innerHTML = h.map(function(it,i){
      return '<div class="history-card" data-i="'+i+'" role="button" tabindex="0">'+
        (it.thumbnail ? '<img src="/api/v1/thumbnail?url='+encodeURIComponent(it.thumbnail)+'" alt="" loading="lazy" onerror="this.style.visibility=\\'hidden\\'">' : '<img alt="">')+
        '<div class="hc-body"><b>@'+esc(it.author||'instagram')+'</b><small>'+esc(it.type||'')+' · '+esc(it.shortcode||'')+'</small></div></div>';
    }).join('');
    wrap.querySelectorAll('.history-card').forEach(function(c){
      function open(){ var it = getHistory()[Number(c.getAttribute('data-i'))]; if(it){ $('urlInput').value = it.url; resolve(); } }
      c.addEventListener('click', open);
      c.addEventListener('keydown', function(e){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); open(); } });
    });
  }
  renderHistory();
  var ch = $('clearHistory');
  if(ch) ch.addEventListener('click', function(){ setHistory([]); renderHistory(); toast(S.history_clear); });

  // ---- resolve ----
  function variantLabel(v){
    var parts = [v.quality || 'default'];
    if(v.width && v.height) parts.push(v.width+'×'+v.height);
    var b = fmtBytes(v.size); if(b) parts.push(b);
    if(v.mime) parts.push(v.mime.replace('video/','').replace('image/',''));
    return parts.join(' · ');
  }
  function thumbUrl(u){ return '/api/v1/thumbnail?url=' + encodeURIComponent(u); }
  function dlUrl(url, quality, index){ return '/api/v1/download?url='+encodeURIComponent(url)+'&quality='+encodeURIComponent(quality||'best')+'&index='+(index||0); }

  function renderResult(data){
    var box = $('result'); box.hidden = false;
    var a = data.author || {};
    var typeMap = { video: S.type_video, image: S.type_image, album: S.type_album };
    var html = '';
    html += '<div class="card preview">';
    html += '<div class="media-box">';
    if(data.type==='video' && data.items[0]){
      var v0 = data.items[0].variants[0];
      html += '<video id="player" controls preload="metadata" playsinline poster="'+(data.thumbnail?esc(thumbUrl(data.thumbnail)):'')+'" src="'+esc(dlUrl(data.source_url, v0.quality, 0))+'" style="max-height:520px"></video>';
    } else if(data.thumbnail){
      html += '<img src="'+esc(thumbUrl(data.thumbnail))+'" alt="preview" loading="lazy">';
    } else { html += '<div class="hint" style="padding:20px">'+esc(S.empty_result)+'</div>'; }
    html += '</div>';
    html += '<div class="meta">';
    html += '<div class="author">';
    if(a.avatar) html += '<img src="'+esc(thumbUrl(a.avatar))+'" alt="">';
    html += '<div><b>@'+esc(a.username||'instagram')+'</b>'+(a.full_name?'<div class="hint">'+esc(a.full_name)+'</div>':'')+'</div></div>';
    html += '<div class="chips"><span class="pill">'+esc(typeMap[data.type]||data.type)+'</span>';
    html += '<span class="pill">'+esc(S.items)+': '+data.items.length+'</span>';
    if(data.duration) html += '<span class="pill">'+esc(S.duration)+': '+esc(fmtDuration(data.duration))+'</span>';
    if(data.items[0] && data.items[0].variants[0] && data.items[0].variants[0].width && data.items[0].variants[0].height) {
      html += '<span class="pill">'+esc(S.dimensions)+': '+data.items[0].variants[0].width+'×'+data.items[0].variants[0].height+'</span>';
    }
    if(data.variants_count) html += '<span class="pill">'+data.variants_count+' variants</span>';
    html += '</div>';
    html += '<div class="hint">'+esc(S.source)+': <a dir="ltr" href="'+esc(data.source_url)+'" rel="noopener nofollow" target="_blank">'+esc(data.source_url)+'</a></div>';
    if(data.caption) html += '<div class="caption">'+esc(data.caption)+'</div>';
    if(data.type!=='album'){
      var item = data.items[0];
      var many = item.variants.length > 1;
      if(!many) html += '<p class="hint">'+esc(S.only_one_quality)+'</p>';
      html += '<div class="variants" role="radiogroup" aria-label="'+esc(S.quality_label)+'">';
      item.variants.forEach(function(v, vi){
        html += '<label class="variant"><input type="radio" name="quality" value="'+esc(v.quality)+'" data-vi="'+vi+'" '+(vi===0?'checked':'')+'>'+
          '<span class="v-info"><b>'+esc(variantLabel(v))+'</b>'+(v.has_audio===false?'<span>'+esc(S.audio_only)+'</span>':'')+'</span>'+
          '<a class="btn primary small" href="'+esc(dlUrl(data.source_url, v.quality, 0))+'" download="'+esc(v.filename||'media')+'">'+ICON_DL+'<span>'+esc(S.download)+'</span></a></label>';
      });
      html += '</div>';
    } else {
      html += '<div class="album-grid">';
      data.items.forEach(function(item, ii){
        html += '<div class="album-item"><div class="thumb">';
        if(item.type==='video') html += '<video controls preload="metadata" playsinline src="'+esc(dlUrl(data.source_url, item.variants[0].quality, ii))+'"></video>';
        else html += '<img loading="lazy" src="'+esc(thumbUrl(item.thumbnail||item.variants[0].url))+'" alt="">';
        html += '</div><div class="body"><small>'+esc(S.album_item)+' '+(ii+1)+'</small>';
        html += '<a class="btn primary small" href="'+esc(dlUrl(data.source_url, item.variants[0].quality, ii))+'">'+ICON_DL+'<span>'+esc(S.download)+'</span></a>';
        html += '</div></div>';
      });
      html += '</div>';
      html += '<button id="zipBtn" class="btn ghost" type="button">'+esc(S.btn_download_all)+'</button>';
    }
    html += '<div class="input-row" style="margin-top:8px">';
    html += '<button class="btn ghost small" id="copyBtn" type="button">'+esc(S.btn_copy)+'</button>';
    html += '<button class="btn ghost small" id="shareBtn" type="button">'+esc(S.btn_share)+'</button>';
    html += '<a class="btn ghost small" href="'+(boot.contact?esc(boot.contact):'#')+'" rel="noopener" target="_blank">'+esc(S.btn_report)+'</a>';
    html += '</div>';
    html += '</div></div>';
    box.innerHTML = html;

    var copyBtn=$('copyBtn');
    if(copyBtn) copyBtn.addEventListener('click', function(){
      navigator.clipboard.writeText(data.source_url).then(function(){ toast(S.copy_success); }, function(){ toast(S.paste_fail); });
    });
    var shareBtn=$('shareBtn');
    if(shareBtn) shareBtn.addEventListener('click', function(){
      if(navigator.share){ navigator.share({ title: S.brand, url: data.source_url }); }
      else { navigator.clipboard.writeText(data.source_url); toast(S.copy_success); }
    });
    var zipBtn=$('zipBtn');
    if(zipBtn) zipBtn.addEventListener('click', function(){ downloadAlbumZip(data); });

    addHistory({ shortcode:data.shortcode, url:data.source_url, author:a.username, type:data.type, thumbnail:data.thumbnail });
  }

  // ---- album ZIP (browser side, no deps) ----
  function crc32(buf){
    var c, crc=0xffffffff;
    for(var i=0;i<buf.length;i++){ c=(crc^buf[i])&0xff; for(var k=0;k<8;k++){ c = c&1 ? (0xEDB88320^(c>>>1)) : (c>>>1); } crc=(crc>>>8)^c; }
    return (crc^0xffffffff)>>>0;
  }
  function downloadAlbumZip(data){
    toast(S.resolving);
    var files = [];
    var jobs = data.items.map(function(item, ii){
      var v = item.variants[0];
      return fetch(dlUrl(data.source_url, v.quality, ii)).then(function(r){ return r.arrayBuffer(); }).then(function(b){
        files.push({ name: v.filename || ('item_'+(ii+1)+'.bin'), data: new Uint8Array(b) });
      }).catch(function(){});
    });
    Promise.all(jobs).then(function(){
      if(!files.length){ toast(S.empty_result); return; }
      var parts = []; var central = []; var offset = 0;
      var enc = new TextEncoder();
      files.forEach(function(f){
        var nameBytes = enc.encode(f.name);
        var crc = crc32(f.data);
        var local = new Uint8Array(30 + nameBytes.length);
        var dv = new DataView(local.buffer);
        dv.setUint32(0,0x04034b50,true); dv.setUint16(4,20,true); dv.setUint16(6,0,true); dv.setUint16(8,0,true);
        dv.setUint16(10,0,true); dv.setUint16(12,0,true); dv.setUint32(14,crc,true);
        dv.setUint32(18,f.data.length,true); dv.setUint32(22,f.data.length,true);
        dv.setUint16(26,nameBytes.length,true); dv.setUint16(28,0,true);
        local.set(nameBytes,30);
        parts.push(local); parts.push(f.data);
        var cen = new Uint8Array(46 + nameBytes.length);
        var cv = new DataView(cen.buffer);
        cv.setUint32(0,0x02014b50,true); cv.setUint16(4,20,true); cv.setUint16(6,20,true);
        cv.setUint16(8,0,true); cv.setUint16(10,0,true); cv.setUint16(12,0,true); cv.setUint16(14,0,true);
        cv.setUint32(16,crc,true); cv.setUint32(20,f.data.length,true); cv.setUint32(24,f.data.length,true);
        cv.setUint16(28,nameBytes.length,true); cv.setUint16(30,0,true); cv.setUint16(32,0,true);
        cv.setUint16(34,0,true); cv.setUint16(36,0,true); cv.setUint32(38,0,true); cv.setUint32(42,offset,true);
        cen.set(nameBytes,46);
        central.push(cen);
        offset += local.length + f.data.length;
      });
      var centralSize = central.reduce(function(s,c){ return s+c.length; },0);
      var end = new Uint8Array(22); var ev = new DataView(end.buffer);
      ev.setUint32(0,0x06054b50,true); ev.setUint16(8,files.length,true); ev.setUint16(10,files.length,true);
      ev.setUint32(12,centralSize,true); ev.setUint32(16,offset,true);
      var all = parts.concat(central, [end]);
      var blob = new Blob(all, { type:'application/zip' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = (data.author && data.author.username ? data.author.username : 'instagram') + '_' + data.shortcode + '.zip';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function(){ URL.revokeObjectURL(a.href); }, 4000);
    });
  }

  function setStatus(msg, kind){ var s=$('status'); s.textContent=msg||''; s.className='status'+(kind?' '+kind:''); }

  function resolve(){
    var input = $('urlInput'); var url = (input.value||'').trim();
    if(!url){ setStatus(S.err_prefix+': '+S.input_label, 'err'); return; }
    setStatus(S.resolving); $('skeleton').hidden=false; $('result').hidden=true;
    var key = $('apiKeyInput') ? $('apiKeyInput').value.trim() : '';
    var headers = { 'accept':'application/json' };
    if(key) headers['x-api-key'] = key;
    fetch('/api/v1/resolve?url='+encodeURIComponent(url), { headers: headers })
      .then(function(r){ return r.json().then(function(j){ return { status:r.status, body:j }; }); })
      .then(function(res){
        $('skeleton').hidden=true;
        if(!res.body || res.body.ok!==true){
          var code = res.body && res.body.error ? res.body.error.code : 'E_INTERNAL';
          var msg = res.body && res.body.error ? res.body.error.message : S.empty_result;
          setStatus(S.err_prefix+' '+code+': '+msg, 'err'); return;
        }
        setStatus(S.ok, 'ok');
        renderResult(res.body.data);
        try{ $('result').scrollIntoView({behavior:'smooth', block:'start'}); }catch(e){}
      })
      .catch(function(err){ $('skeleton').hidden=true; setStatus(S.err_prefix+': '+err.message, 'err'); report('resolve failed: '+err.message); });
  }

  var form = $('resolveForm');
  if(form) form.addEventListener('submit', function(e){ e.preventDefault(); resolve(); });
  var pasteBtn = $('pasteBtn');
  if(pasteBtn) pasteBtn.addEventListener('click', function(){
    if(navigator.clipboard && navigator.clipboard.readText){
      navigator.clipboard.readText().then(function(txt){ $('urlInput').value = txt.trim(); }, function(){ toast(S.paste_fail); });
    } else { toast(S.paste_fail); }
  });
  var clearBtn = $('clearBtn');
  if(clearBtn) clearBtn.addEventListener('click', function(){ $('urlInput').value=''; $('result').hidden=true; setStatus(''); });

  // ---- try it ----
  var trySend = $('trySend');
  if(trySend) trySend.addEventListener('click', function(){
    var ep = $('tryEndpoint').value; var u = $('tryUrl').value.trim();
    var q = ep.indexOf('?')>=0?'&':'?';
    var url = ep + (u? (q+'url='+encodeURIComponent(u)) : '');
    $('tryOut').textContent = S.resolving;
    api(url).then(function(res){ $('tryOut').textContent = JSON.stringify(res.body, null, 2); })
      .catch(function(err){ $('tryOut').textContent = err.message; });
  });

  // expose for tests / debugging
  window.__insta = { resolve: resolve, renderResult: renderResult, fmtBytes: fmtBytes };
})();
`;
