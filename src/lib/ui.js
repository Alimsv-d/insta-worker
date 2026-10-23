// Single-file UI (HTML + CSS + JS) rendered into the worker.
//
// Rendering rules:
//   * the page is fully visible by default. The `js` class is added to <html>
//     in <head>; the scroll-reveal animation is only armed when the browser
//     actually supports IntersectionObserver (`js io`), so a browser without
//     it (or with JS disabled) always shows the content;
//   * a fallback timer reveals everything and is registered OUTSIDE of any
//     error handling, so a failing feature can never leave the page hidden;
//   * every initialisation step is wrapped in its own try/catch;
//   * the CSP has no `unsafe-inline`: the inline <style> carries a nonce;
//   * the webfont is loaded from a pinned CDN version with an SRI hash.

import { escapeHtml } from "./security.js";
import { uiStrings, docsFor } from "./i18n.js";

const FONT_CDN = "https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css";
// sha384 of the pinned CSS file above. The stylesheet is immutable at that
// tag, so the hash stays valid; if it ever breaks the page falls back to the
// system font stack.
const FONT_SRI = "sha384-Msg4vA+dMlGceTVAySThtI+13Iz0xL9HBixehPxtwyz69HyraW1QWhcuiIqRF9Rs";

/**
 * Only absolute https URLs are allowed in href/src attributes.
 * @param {string} value
 * @param {string} fallback
 */
export function safeHref(value, fallback = "#") {
  const raw = String(value == null ? "" : value).trim();
  if (!raw) return fallback;
  if (raw.startsWith("#")) return raw;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return fallback;
    return u.toString();
  } catch {
    return fallback;
  }
}

/**
 * @param {{lang:string, nonce:string, styleNonce?:string, build:string, contact:string, defaultLang:string, debug?:boolean}} opts
 */
export function renderHome(opts) {
  const lang = opts.lang === "en" ? "en" : "fa";
  const S = uiStrings(lang);
  const nonce = opts.nonce || "";
  const styleNonce = opts.styleNonce || nonce;
  const build = escapeHtml(opts.build || "dev");
  const contact = safeHref(opts.contact || "", "#");
  const debug = !!opts.debug;

  const bootData = scriptJson({
    lang,
    defaultLang: opts.defaultLang || "fa",
    build: opts.build || "dev",
    contact: contact === "#" ? "" : contact,
    debug,
    strings: S,
    docs: docsFor(lang),
  });

  return `<!doctype html>
<html lang="${lang}" dir="${S.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(S.brand)} — ${escapeHtml(S.tagline)}</title>
<meta name="description" content="${escapeHtml(S.tagline)}">
<meta name="referrer" content="no-referrer">
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="stylesheet" href="${FONT_CDN}" integrity="${FONT_SRI}" crossorigin="anonymous">
<style nonce="${styleNonce}">${CSS}</style>
<script nonce="${nonce}">${HEAD_JS}</script>
</head>
<body data-lang="${lang}">
<a class="skip" href="#tool">${escapeHtml(S.skip_to_tool)}</a>
<header class="topbar">
  <div class="wrap row">
    <a class="brand" href="/">
      <span class="logo" aria-hidden="true">${LOGO_SVG}</span>
      <span class="brand-text"><strong>${escapeHtml(S.brand)}</strong><small>${escapeHtml(S.tagline)}</small></span>
    </a>
    <nav id="nav" class="nav" aria-label="primary">
      <a href="#tool">${escapeHtml(S.nav_tool)}</a>
      <a href="#history">${escapeHtml(S.nav_history)}</a>
      <a href="#docs">${escapeHtml(S.nav_docs)}</a>
      <a href="#faq">${escapeHtml(S.nav_faq)}</a>
      <a href="#tos">${escapeHtml(S.nav_tos)}</a>
      <a href="#about">${escapeHtml(S.nav_about)}</a>
    </nav>
    <div class="actions">
      <button id="menuBtn" class="icon-btn nav-toggle" type="button" aria-label="${escapeHtml(S.menu_open)}" aria-expanded="false" aria-controls="nav">${ICONS.menu}</button>
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

    <h3>${escapeHtml(S.samples_title)}</h3>
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
  <p><a href="${escapeHtml(contact)}" rel="noopener nofollow" target="_blank">${escapeHtml(S.contact)}</a> · ${escapeHtml(S.build)}: <code>${build}</code></p>
</footer>

<div id="toast" class="toast" role="status" aria-live="polite" hidden></div>
${debug ? `<aside id="debugPanel" class="debug"><header>${escapeHtml(S.debug_panel)} <button id="debugClear" type="button">×</button></header><ol id="debugList"></ol></aside>` : ""}

<script id="boot" type="application/json">${bootData}</script>
<script nonce="${nonce}">${CLIENT_JS}</script>
</body>
</html>`;
}

function scriptJson(value) {
  // Safe embedding inside <script type="application/json">.
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

// ---------------------------------------------------------------------------
// Inline SVG icons
// ---------------------------------------------------------------------------
export const ICONS = {
  globe: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18"/></svg>`,
  moon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.5 6.5 0 0 0 9.8 9.8z"/></svg>`,
  menu: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`,
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
[hidden]{display:none!important}
.wrap{max-width:var(--max);margin:0 auto;padding:0 18px}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.skip{position:absolute;inset-inline-start:-9999px;top:8px;background:var(--card);padding:8px 12px;border-radius:8px;z-index:50}
.skip:focus{inset-inline-start:8px}
.topbar{position:sticky;top:0;z-index:40;background:color-mix(in srgb,var(--bg) 82%,transparent);
  backdrop-filter:saturate(1.4) blur(10px);border-bottom:1px solid var(--line)}
.topbar .row{display:flex;align-items:center;gap:14px;min-height:64px;position:relative}
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
.nav-toggle{display:inline-flex}
@media(min-width:900px){.nav-toggle{display:none}}
.nav.open{display:flex;position:absolute;inset-inline:0;top:100%;flex-direction:column;gap:4px;
  background:var(--card);border-bottom:1px solid var(--line);padding:10px 18px;box-shadow:var(--shadow)}
section{padding:38px 0;scroll-margin-top:78px}
h1{font-size:clamp(1.8rem,5vw,2.8rem);margin:.2em 0}
h2{font-size:clamp(1.3rem,3.4vw,1.9rem);margin:.2em 0}
h3{margin-top:1.4em}
.lede{color:var(--muted);font-size:1.08rem;margin-top:-.4em}
/* Gradient text is a progressive enhancement: without background-clip the
   headline keeps its normal colour instead of becoming invisible. */
.hero h1{color:var(--brand)}
@supports ((-webkit-background-clip:text) or (background-clip:text)){
  .hero h1{background:linear-gradient(120deg,var(--brand),var(--brand2));
    -webkit-background-clip:text;background-clip:text;color:transparent}
}
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:18px}
.tool-card{display:grid;gap:12px;margin-top:8px}
.tool-card label{font-weight:700;font-size:.95rem}
.input-row{display:flex;gap:10px;flex-wrap:wrap}
.input-row>*{flex:1 1 160px;min-width:0}
input,select{width:100%;padding:13px 14px;border:1px solid var(--line);border-radius:12px;
  background:var(--bg2);color:var(--fg);font:inherit;transition:.2s}
input[type=radio]{width:auto;padding:0;accent-color:var(--brand);flex:none;margin:0}
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
.variant label{flex:1 1 180px;cursor:pointer}
.variant .v-info b{display:block}
.variant .v-info span{color:var(--muted);font-size:.85rem}
.download-row{display:flex;gap:10px;flex-wrap:wrap;margin-top:10px}
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
  /* Only browsers that support IntersectionObserver AND run JS get the
     hidden state; everything else shows the content immediately. */
  .js.io .reveal{opacity:0;transform:translateY(14px);transition:opacity .5s ease,transform .5s ease}
  .js.io .reveal.in{opacity:1;transform:none}
  @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
}
`;

const DOWNLOAD_ICON_SVG = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16"/></svg>`;

/**
 * Runs in <head>, before the body is parsed. It only marks the document:
 * `js` = JavaScript is available, `io` = IntersectionObserver is available.
 * The CSS only hides the content when BOTH classes are present.
 */
const HEAD_JS = `(function(){var d=document.documentElement;d.className=(d.className+' js').trim();if('IntersectionObserver' in window){d.className=(d.className+' io').trim();}})();`;

const CLIENT_JS = `
(function(){
  "use strict";
  var ICON_DL = ${JSON.stringify(DOWNLOAD_ICON_SVG)};
  var boot = {};
  try { boot = JSON.parse(document.getElementById('boot').textContent || '{}'); } catch(e){ boot = {}; }
  var S = boot.strings || {};
  var D = boot.docs || { endpoints:[], errors:[], faq:[], tos:[], about:[] };
  var debug = !!boot.debug;
  var errors = [];
  var ZIP_CONCURRENCY = 3;

  function report(msg){
    errors.push(String(msg));
    if(!debug) return;
    var list = document.getElementById('debugList');
    if(list){ var li=document.createElement('li'); li.textContent = String(msg); list.appendChild(li); }
  }
  function onError(fn){ try{ fn(); }catch(e){ report('init failed: ' + ((e && e.message) || e)); } }

  if(debug){
    window.addEventListener('error', function(ev){ report('Error: ' + (ev.message||'') + ' @' + (ev.filename||'') + ':' + (ev.lineno||'')); });
    window.addEventListener('unhandledrejection', function(ev){ report('UnhandledRejection: ' + (ev.reason && ev.reason.message ? ev.reason.message : ev.reason)); });
  }

  function $(id){ return document.getElementById(id); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }
  function safeHref(value, fallback){
    var raw = String(value==null?'':value).trim();
    if(!raw) return fallback || '#';
    if(raw.charAt(0)==='#') return raw;
    try{
      var u = new URL(raw);
      if(u.protocol !== 'https:') return fallback || '#';
      return u.toString();
    }catch(e){ return fallback || '#'; }
  }
  function toast(msg){
    var t = $('toast'); if(!t) return;
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(function(){ t.hidden = true; }, 2200);
  }
  function api(path){
    return fetch(path, { headers: { 'accept': 'application/json' } }).then(function(r){
      return r.text().then(function(txt){
        var body = null;
        try{ body = txt ? JSON.parse(txt) : null; }catch(e){ body = null; }
        return { status: r.status, ok: r.ok, body: body };
      });
    });
  }
  function fmtBytes(n){
    if(n==null||isNaN(Number(n))) return null; var b=Number(n), u=['B','KB','MB','GB'], i=0;
    while(b>=1024&&i<u.length-1){b/=1024;i++;} return (b>=10||i===0?b.toFixed(0):b.toFixed(1))+' '+u[i];
  }
  /**
   * Durations may arrive in seconds or in milliseconds. Values below 1000 are
   * seconds, everything else is milliseconds. The result is always m:ss.
   */
  function fmtDuration(n){
    n = Number(n);
    if(!isFinite(n)||n<=0) return null;
    var secs = n >= 1000 ? n/1000 : n;
    var s = Math.round(secs), m = Math.floor(s/60), sec = s%60;
    return m>0 ? (m+':'+(sec<10?'0':'')+sec) : (sec+'s');
  }

  // ---- theme ----
  function applyTheme(mode){ try{ if(mode==='dark'||mode==='light'){document.documentElement.setAttribute('data-theme',mode);} }catch(e){} }
  onError(function(){ try{ applyTheme(localStorage.getItem('iw-theme')); }catch(e){} });
  onError(function(){
    var themeBtn=$('themeBtn');
    if(!themeBtn) return;
    themeBtn.addEventListener('click', function(){
      var cur = document.documentElement.getAttribute('data-theme');
      var dark = cur ? cur==='dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
      var next = dark ? 'light':'dark';
      applyTheme(next);
      try{ localStorage.setItem('iw-theme', next); }catch(e){}
    });
  });

  // ---- language ----
  onError(function(){
    var langBtn=$('langBtn');
    if(!langBtn) return;
    langBtn.addEventListener('click', function(){
      var cur = document.documentElement.getAttribute('lang')==='en' ? 'en':'fa';
      var next = cur==='en' ? 'fa':'en';
      var u = new URL(location.href); u.searchParams.set('lang', next); location.href = u.toString();
    });
  });

  // ---- mobile menu ----
  onError(function(){
    var menuBtn=$('menuBtn'), nav=$('nav');
    if(!menuBtn||!nav) return;
    function setOpen(open){
      nav.classList.toggle('open', open);
      menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      menuBtn.setAttribute('aria-label', open ? (S.menu_close||'') : (S.menu_open||''));
    }
    menuBtn.addEventListener('click', function(){ setOpen(!nav.classList.contains('open')); });
    nav.addEventListener('click', function(ev){ if(ev.target && ev.target.tagName==='A') setOpen(false); });
    document.addEventListener('keydown', function(ev){ if(ev.key==='Escape') setOpen(false); });
    window.addEventListener('resize', function(){ if(window.innerWidth>=900) setOpen(false); });
  });

  // ---- static docs content (localized, comes from the server catalogue) ----
  onError(function(){
    var ep = $('endpoints');
    if(ep) ep.innerHTML = (D.endpoints||[]).map(function(e){
      return '<div class="endpoint"><code>'+esc(e[0])+'</code><p>'+esc(e[1])+'</p><p><small>'+esc(e[2])+'</small></p></div>';
    }).join('');
    var eb = $('errorsBody');
    if(eb) eb.innerHTML = (D.errors||[]).map(function(e){ return '<tr><td><code>'+esc(e[0])+'</code></td><td>'+esc(e[1])+'</td><td>'+esc(e[2])+'</td></tr>'; }).join('');
    var fq = $('faqList');
    if(fq) fq.innerHTML = (D.faq||[]).map(function(f){ return '<details><summary>'+esc(f[0])+'</summary><p>'+esc(f[1])+'</p></details>'; }).join('');
    var tb = $('tosBody');
    if(tb) tb.innerHTML = '<ul>'+(D.tos||[]).map(function(x){ return '<li>'+esc(x)+'</li>'; }).join('')+'</ul>';
    var ab = $('aboutBody');
    if(ab) ab.innerHTML = '<ul>'+(D.about||[]).map(function(x){ return '<li>'+esc(x)+'</li>'; }).join('')+'</ul>';
    var sm = $('samples');
    if(sm){
      var base = location.origin;
      var sampleUrl = base+'/api/v1/resolve?url='+encodeURIComponent('https://www.instagram.com/reel/ABC123/');
      sm.innerHTML = [
        ['curl', 'curl "'+sampleUrl+'"'],
        ['Python', 'import requests\\nr = requests.get("'+base+'/api/v1/resolve", params={"url":"https://www.instagram.com/reel/ABC123/"})\\nprint(r.json())'],
        ['PHP', '$j = file_get_contents("'+base+'/api/v1/resolve?url=".urlencode("https://www.instagram.com/reel/ABC123/"));\\necho $j;'],
        ['JavaScript', 'const j = await (await fetch("'+sampleUrl+'")).json();\\nconsole.log(j);'],
        ['Node.js', 'const res = await fetch("'+sampleUrl+'");\\nconsole.log(await res.json());']
      ].map(function(s){ return '<div class="card"><b>'+esc(s[0])+'</b><pre class="code-block">'+esc(s[1])+'</pre></div>'; }).join('');
    }
  });

  // ---- reveal on scroll (progressive) ----
  // The fallback timer is registered BEFORE any code that can throw, so the
  // content can never stay invisible because of a failing feature.
  onError(function(){
    var els = document.querySelectorAll('.reveal');
    var ioActive = false;
    var fallback = setTimeout(function(){
      if(ioActive) return;
      els.forEach(function(el){ el.classList.add('in'); });
    }, 1200);
    try{
      if('IntersectionObserver' in window){
        var io = new IntersectionObserver(function(entries){
          entries.forEach(function(en){ if(en.isIntersecting){ en.target.classList.add('in'); io.unobserve(en.target); } });
        }, { rootMargin: '0px 0px -10% 0px', threshold: 0.05 });
        els.forEach(function(el){ io.observe(el); });
        ioActive = true;
      } else {
        els.forEach(function(el){ el.classList.add('in'); });
      }
    }catch(e){
      els.forEach(function(el){ el.classList.add('in'); });
      report('reveal failed: ' + ((e && e.message) || e));
    }
    window.setTimeout(function(){ clearTimeout(fallback); }, 5000);
  });

  // ---- history ----
  var HK = 'iw-history';
  function getHistory(){ try{ var v=JSON.parse(localStorage.getItem(HK)||'[]'); return Array.isArray(v)?v:[]; }catch(e){ return []; } }
  function setHistory(h){ try{ localStorage.setItem(HK, JSON.stringify(h.slice(0,20))); }catch(e){} }
  function renderHistory(){
    var wrap = $('historyList'); if(!wrap) return;
    var h = getHistory();
    if(!h.length){ wrap.innerHTML = '<p class="hint">'+esc(S.history_empty)+'</p>'; return; }
    wrap.innerHTML = h.map(function(it,i){
      var thumb = it.thumbnail ? '<img src="/api/v1/thumbnail?url='+encodeURIComponent(it.thumbnail)+'" alt="" loading="lazy" data-fallback>' : '<img alt="" data-fallback>';
      return '<div class="history-card" data-i="'+i+'" role="button" tabindex="0">'+ thumb +
        '<div class="hc-body"><b>@'+esc(it.author||'instagram')+'</b><small>'+esc(it.type||'')+' · '+esc(it.shortcode||'')+'</small></div></div>';
    }).join('');
    // No inline onerror: broken thumbnails are hidden with a listener.
    wrap.querySelectorAll('img[data-fallback]').forEach(function(img){
      img.addEventListener('error', function(){ img.style.visibility='hidden'; });
    });
    wrap.querySelectorAll('.history-card').forEach(function(c){
      function open(){ var it = getHistory()[Number(c.getAttribute('data-i'))]; if(it){ $('urlInput').value = it.url; resolve(); } }
      c.addEventListener('click', open);
      c.addEventListener('keydown', function(e){ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); open(); } });
    });
  }
  onError(renderHistory);
  onError(function(){
    var ch = $('clearHistory');
    if(ch) ch.addEventListener('click', function(){ setHistory([]); renderHistory(); toast(S.history_clear); });
  });

  // ---- resolve ----
  function variantLabel(v){
    var parts = [v.quality || 'default'];
    if(v.width && v.height) parts.push(v.width+'×'+v.height);
    var b = fmtBytes(v.size); if(b) parts.push(b);
    if(v.mime) parts.push(String(v.mime).replace('video/','').replace('image/',''));
    return parts.join(' · ');
  }
  function thumbUrl(u){ return '/api/v1/thumbnail?url=' + encodeURIComponent(u); }
  function dlUrl(url, quality, index, inline){
    return '/api/v1/download?url='+encodeURIComponent(url)+'&quality='+encodeURIComponent(quality||'best')+'&index='+(index||0)+(inline?'&inline=1':'');
  }
  function setStatus(msg, kind){ var s=$('status'); if(!s) return; s.textContent=msg||''; s.className='status'+(kind?' '+kind:''); }

  var resolveSeq = 0;
  var resolveAbort = null;

  function renderResult(data){
    var box = $('result'); if(!box) return;
    box.hidden = false;
    var a = data.author || {};
    var typeMap = { video: S.type_video, image: S.type_image, album: S.type_album };
    var sourceHref = safeHref(data.source_url, '#');
    var html = '';
    html += '<div class="card preview">';
    html += '<div class="media-box">';
    if(data.type==='video' && data.items[0] && data.items[0].variants[0]){
      var v0 = data.items[0].variants[0];
      html += '<video id="player" controls preload="metadata" playsinline poster="'+(data.thumbnail?esc(thumbUrl(data.thumbnail)):'')+'" src="'+esc(dlUrl(data.source_url, v0.quality, 0, true))+'"></video>';
    } else if(data.thumbnail){
      html += '<img src="'+esc(thumbUrl(data.thumbnail))+' alt="preview" loading="lazy">';
    } else { html += '<div class="hint" style="padding:20px">'+esc(S.empty_result)+'</div>'; }
    html += '</div>';
    html += '<div class="meta">';
    html += '<div class="author">';
    if(a.avatar) html += '<img src="'+esc(thumbUrl(a.avatar))+' alt="" loading="lazy">';
    html += '<div><b>@'+esc(a.username||'instagram')+'</b>'+(a.full_name?'<div class="hint">'+esc(a.full_name)+'</div>':'')+'</div></div>';
    html += '<div class="chips"><span class="pill">'+esc(typeMap[data.type]||data.type)+'</span>';
    html += '<span class="pill">'+esc(S.items)+': '+data.items.length+'</span>';
    if(data.duration) html += '<span class="pill">'+esc(S.duration)+': '+esc(fmtDuration(data.duration))+'</span>';
    if(data.items[0] && data.items[0].variants[0] && data.items[0].variants[0].width && data.items[0].variants[0].height) {
      html += '<span class="pill">'+esc(S.dimensions)+': '+data.items[0].variants[0].width+'×'+data.items[0].variants[0].height+'</span>';
    }
    if(data.variants_count) html += '<span class="pill">'+esc(S.variants_label)+': '+data.variants_count+'</span>';
    html += '</div>';
    html += '<div class="hint">'+esc(S.source)+': <a dir="ltr" href="'+esc(sourceHref)+'" rel="noopener nofollow" target="_blank">'+esc(data.source_url)+'</a></div>';
    if(data.caption) html += '<div class="caption">'+esc(data.caption)+'</div>';

    if(data.type!=='album'){
      var item = data.items[0];
      var variants = item.variants || [];
      html += '<div class="variants" role="radiogroup" aria-label="'+esc(S.quality_label)+'">';
      variants.forEach(function(v, vi){
        html += '<div class="variant">';
        html += '<input type="radio" id="q'+vi+'" name="quality" value="'+esc(v.quality)+'" data-index="'+vi+'"'+(vi===0?' checked':'')+'>';
        html += '<label for="q'+vi+'" class="v-info"><b>'+esc(variantLabel(v))+'</b>'+(v.has_audio===false?'<span>'+esc(S.audio_only)+'</span>':'')+'</label>';
        html += '</div>';
      });
      html += '</div>';
      if(variants.length<2) html += '<p class="hint">'+esc(S.only_one_quality)+'</p>';
      // The download link lives OUTSIDE the labels and follows the selection.
      html += '<div class="download-row"><a id="primaryDownload" class="btn primary" href="'+esc(dlUrl(data.source_url, variants[0].quality, 0))+'" download="'+esc(variants[0].filename||'media')+'">'+ICON_DL+'<span>'+esc(S.download)+'</span></a></div>';
    } else {
      html += '<div class="album-grid">';
      data.items.forEach(function(item, ii){
        var v = (item.variants && item.variants[0]) || {};
        html += '<div class="album-item"><div class="thumb">';
        if(item.type==='video') html += '<video controls preload="metadata" playsinline src="'+esc(dlUrl(data.source_url, v.quality, ii, true))+'"></video>';
        else html += '<img loading="lazy" src="'+esc(thumbUrl(item.thumbnail||v.url))+' alt="">';
        html += '</div><div class="body"><small>'+esc(S.album_item)+' '+(ii+1)+'</small>';
        html += '<a class="btn primary small" href="'+esc(dlUrl(data.source_url, v.quality, ii))+'">'+ICON_DL+'<span>'+esc(S.download)+'</span></a>';
        html += '</div></div>';
      });
      html += '</div>';
      html += '<div class="download-row"><button id="zipBtn" class="btn ghost" type="button">'+esc(S.btn_download_all)+'</button></div>';
    }
    html += '<div class="download-row">';
    html += '<button class="btn ghost small" id="copyBtn" type="button">'+esc(S.btn_copy)+'</button>';
    html += '<button class="btn ghost small" id="shareBtn" type="button">'+esc(S.btn_share)+'</button>';
    html += '<a class="btn ghost small" href="'+esc(safeHref(boot.contact,'#'))+'" rel="noopener nofollow" target="_blank">'+esc(S.btn_report)+'</a>';
    html += '</div>';
    html += '</div></div>';
    box.innerHTML = html;

    // The radio group really drives the download link.
    var radios = box.querySelectorAll('input[name=quality]');
    var primary = $('primaryDownload');
    function syncDownload(){
      if(!primary) return;
      var checked = box.querySelector('input[name=quality]:checked');
      if(!checked) return;
      var vi = Number(checked.getAttribute('data-index'));
      var v = (data.items[0].variants||[])[vi];
      if(!v) return;
      primary.setAttribute('href', dlUrl(data.source_url, v.quality, 0));
      primary.setAttribute('download', v.filename || 'media');
    }
    radios.forEach(function(r){ r.addEventListener('change', syncDownload); });
    syncDownload();

    onError(function(){
      var copyBtn=$('copyBtn');
      if(copyBtn) copyBtn.addEventListener('click', function(){
        if(!navigator.clipboard){ toast(S.paste_fail); return; }
        navigator.clipboard.writeText(data.source_url).then(function(){ toast(S.copy_success); }, function(){ toast(S.paste_fail); });
      });
    });
    onError(function(){
      var shareBtn=$('shareBtn');
      if(shareBtn) shareBtn.addEventListener('click', function(){
        if(navigator.share){ navigator.share({ title: S.brand, url: data.source_url }); }
        else if(navigator.clipboard){ navigator.clipboard.writeText(data.source_url).then(function(){ toast(S.copy_success); }, function(){ toast(S.paste_fail); }); }
        else { toast(S.paste_fail); }
      });
    });
    onError(function(){
      var zipBtn=$('zipBtn');
      if(zipBtn) zipBtn.addEventListener('click', function(){ downloadAlbumZip(data); });
    });

    addHistory({ shortcode:data.shortcode, url:data.source_url, author:a.username, type:data.type, thumbnail:data.thumbnail });
  }

  // ---- album ZIP (browser side, streaming, no dependencies) ----
  var CRC_TABLE = (function(){
    var table = new Uint32Array(256);
    for(var n=0;n<256;n++){
      var c = n;
      for(var k=0;k<8;k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();
  function crc32Update(crc, bytes){
    for(var i=0;i<bytes.length;i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return crc >>> 0;
  }
  function u16(v){ return new Uint8Array([v & 0xff, (v >>> 8) & 0xff]); }
  function u32(v){ return new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]); }
  function cat(arrays){
    var len = 0, i;
    for(i=0;i<arrays.length;i++) len += arrays[i].length;
    var out = new Uint8Array(len), pos = 0;
    for(i=0;i<arrays.length;i++){ out.set(arrays[i], pos); pos += arrays[i].length; }
    return out;
  }
  function zipHeader(nameBytes, crc, size, offset, isCentral){
    var head;
    if(isCentral){
      head = new Uint8Array(46 + nameBytes.length);
      var dv = new DataView(head.buffer);
      dv.setUint32(0, 0x02014b50, true);
      dv.setUint16(4, 20, true); dv.setUint16(6, 20, true);
      dv.setUint16(8, 0x0808, true);   // UTF-8 names + data descriptor
      dv.setUint16(10, 0, true); dv.setUint16(12, 0, true); dv.setUint16(14, 0, true);
      dv.setUint32(16, crc >>> 0, true);
      dv.setUint32(20, size >>> 0, true);
      dv.setUint32(24, size >>> 0, true);
      dv.setUint16(28, nameBytes.length, true);
      dv.setUint16(30, 0, true); dv.setUint16(32, 0, true);
      dv.setUint16(34, 0, true); dv.setUint16(36, 0, true);
      dv.setUint32(38, 0, true);
      dv.setUint32(42, offset >>> 0, true);
    } else {
      head = new Uint8Array(30 + nameBytes.length);
      var dv2 = new DataView(head.buffer);
      dv2.setUint32(0, 0x04034b50, true);
      dv2.setUint16(4, 20, true);
      dv2.setUint16(6, 0x0808, true);   // UTF-8 names + data descriptor
      dv2.setUint16(8, 0, true); dv2.setUint16(10, 0, true); dv2.setUint16(12, 0, true);
      dv2.setUint32(14, 0, true); dv2.setUint32(18, 0, true); dv2.setUint32(22, 0, true);
      dv2.setUint16(26, nameBytes.length, true);
      dv2.setUint16(28, 0, true);
    }
    head.set(nameBytes, isCentral ? 46 : 30);
    return head;
  }
  function zipDescriptor(crc, size){
    return cat([u32(0x08074b50), u32(crc >>> 0), u32(size >>> 0), u32(size >>> 0)]);
  }
  function zipEnd(entries, centralSize, centralOffset){
    var end = new Uint8Array(22);
    var dv = new DataView(end.buffer);
    dv.setUint32(0, 0x06054b50, true);
    dv.setUint16(4, 0, true); dv.setUint16(6, 0, true);
    dv.setUint16(8, entries, true); dv.setUint16(10, entries, true);
    dv.setUint32(12, centralSize, true); dv.setUint32(16, centralOffset, true);
    dv.setUint16(20, 0, true);
    return end;
  }

  /**
   * Download every album item and pack them into a ZIP.
   * - at most ZIP_CONCURRENCY downloads run in parallel
   * - the entries are written in a FIXED order (album order)
   * - file names are written with the UTF-8 flag (0x0800)
   * - failures are reported, the ZIP is still created from what succeeded
   */
  function downloadAlbumZip(data){
    toast(S.zip_preparing);
    var items = (data.items || []).map(function(item, ii){
      var v = (item.variants && item.variants[0]) || {};
      return {
        index: ii,
        url: dlUrl(data.source_url, v.quality, ii),
        name: v.filename || ('item_'+(ii+1)+'.bin')
      };
    });
    if(!items.length){ toast(S.empty_result); return; }

    var enc = new TextEncoder();
    var results = new Array(items.length);
    var failed = [];
    var next = 0;
    var parts = [];
    var central = [];
    var offset = 0;

    function fetchItem(item){
      return fetch(item.url, { headers: { 'accept': '*/*' } }).then(function(res){
        if(!res.ok) throw new Error('http_'+res.status);
        if(!res.body || !res.body.getReader) throw new Error('no_stream');
        var reader = res.body.getReader();
        var chunks = [];
        function pump(){
          return reader.read().then(function(part){
            if(part.done) return { chunks: chunks, size: chunks.reduce(function(s,c){ return s + c.length; }, 0) };
            chunks.push(part.value);
            return pump();
          });
        }
        return pump();
      });
    }

    function worker(){
      if(next >= items.length) return Promise.resolve();
      var item = items[next++];
      return fetchItem(item).then(function(res){
        results[item.index] = res;
      }).catch(function(err){
        failed.push(item.index);
        report('zip item ' + item.index + ' failed: ' + ((err && err.message) || err));
      }).then(worker);
    }

    var pool = [];
    for(var i=0;i<Math.min(ZIP_CONCURRENCY, items.length);i++) pool.push(worker());

    Promise.all(pool).then(function(){
      var written = 0;
      items.forEach(function(item){
        var res = results[item.index];
        if(!res) return;
        var nameBytes = enc.encode(item.name);
        var crc = 0xffffffff;
        var size = 0;
        res.chunks.forEach(function(c){ crc = crc32Update(crc, c); size += c.length; });
        crc = (crc ^ 0xffffffff) >>> 0;
        var local = zipHeader(nameBytes, 0, 0, 0, false);
        parts.push(local);
        res.chunks.forEach(function(c){ parts.push(c); });
        parts.push(zipDescriptor(crc, size));
        central.push(zipHeader(nameBytes, crc, size, offset, true));
        offset += local.length + size + 16;
        written++;
      });
      if(!written){ toast(S.zip_failed); return; }
      var centralSize = central.reduce(function(s,c){ return s + c.length; }, 0);
      var blob = new Blob(parts.concat(central, [zipEnd(written, centralSize, offset)]), { type: 'application/zip' });
      var a = document.createElement('a');
      var href = URL.createObjectURL(blob);
      a.href = href;
      a.download = ((data.author && data.author.username) ? data.author.username : 'instagram') + '_' + data.shortcode + '.zip';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function(){ URL.revokeObjectURL(href); }, 4000);
      toast(failed.length ? S.zip_partial : S.zip_done);
    }).catch(function(err){
      report('zip failed: ' + ((err && err.message) || err));
      toast(S.zip_failed);
    });
  }

  function resolve(){
    var input = $('urlInput'); if(!input) return;
    var url = (input.value||'').trim();
    if(!url){ setStatus(S.err_prefix+': '+S.input_label, 'err'); return; }
    // Only the newest request may update the UI.
    var seq = ++resolveSeq;
    if(resolveAbort){ try{ resolveAbort.abort(); }catch(e){} }
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    resolveAbort = controller;
    setStatus(S.resolving);
    var sk = $('skeleton'); if(sk) sk.hidden=false;
    var res = $('result'); if(res) res.hidden=true;
    var key = $('apiKeyInput') ? $('apiKeyInput').value.trim() : '';
    var headers = { 'accept':'application/json' };
    if(key) headers['x-api-key'] = key;
    fetch('/api/v1/resolve?url='+encodeURIComponent(url), { headers: headers, signal: controller ? controller.signal : undefined })
      .then(function(r){
        return r.text().then(function(txt){
          var body = null;
          try{ body = txt ? JSON.parse(txt) : null; }catch(e){ body = null; }
          return { status: r.status, body: body };
        });
      })
      .then(function(res2){
        if(seq !== resolveSeq) return;   // a newer request won
        var sk2 = $('skeleton'); if(sk2) sk2.hidden=true;
        if(!res2.body || res2.body.ok!==true){
          var code = res2.body && res2.body.error ? res2.body.error.code : 'E_INTERNAL';
          var msg = res2.body && res2.body.error ? res2.body.error.message : S.empty_result;
          setStatus(S.err_prefix+' '+code+': '+msg, 'err'); return;
        }
        setStatus(S.ok, 'ok');
        renderResult(res2.body.data);
        try{ var rbox=$('result'); if(rbox) rbox.scrollIntoView({behavior:'smooth', block:'start'}); }catch(e){}
      })
      .catch(function(err){
        if(seq !== resolveSeq) return;
        var sk3 = $('skeleton'); if(sk3) sk3.hidden=true;
        if(err && err.name === 'AbortError') return;
        setStatus(S.err_prefix+': ' + (S.offline_hint || (err && err.message) || ''), 'err');
        report('resolve failed: ' + ((err && err.message) || err));
      });
  }

  onError(function(){
    var form = $('resolveForm');
    if(form) form.addEventListener('submit', function(e){ e.preventDefault(); resolve(); });
  });
  onError(function(){
    var pasteBtn = $('pasteBtn');
    if(!pasteBtn) return;
    pasteBtn.addEventListener('click', function(){
      if(navigator.clipboard && navigator.clipboard.readText){
        navigator.clipboard.readText().then(function(txt){ $('urlInput').value = txt.trim(); }, function(){ toast(S.paste_fail); });
      } else { toast(S.paste_fail); }
    });
  });
  onError(function(){
    var clearBtn = $('clearBtn');
    if(!clearBtn) return;
    clearBtn.addEventListener('click', function(){ $('urlInput').value=''; var r=$('result'); if(r) r.hidden=true; setStatus(''); });
  });

  // ---- try it ----
  onError(function(){
    var trySend = $('trySend');
    if(!trySend) return;
    trySend.addEventListener('click', function(){
      var ep = $('tryEndpoint').value; var u = $('tryUrl').value.trim();
      var q = ep.indexOf('?')>=0?'&':'?';
      var url = ep + (u? (q+'url='+encodeURIComponent(u)) : '');
      $('tryOut').textContent = S.resolving;
      api(url).then(function(res){ $('tryOut').textContent = JSON.stringify(res.body, null, 2); })
        .catch(function(err){ $('tryOut').textContent = (err && err.message) || S.offline_hint; });
    });
  });

  // Expose the internals for tests / debugging — ONLY in debug mode.
  if(debug){
    window.__insta = { resolve: resolve, renderResult: renderResult, fmtBytes: fmtBytes, fmtDuration: fmtDuration, errors: errors };
  }
})();
`;
