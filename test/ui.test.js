import { test } from "node:test";
import assert from "node:assert/strict";
import { parse } from "parse5";

import { renderHome, safeHref, formatDuration } from "../src/lib/ui.js";
import {
  DEFAULT_UI_LANG,
  docsFor,
  isRtl,
  missingUiKeys,
  uiLangFromRequest,
  uiStrings,
} from "../src/lib/i18n.js";

const PAGE = renderHome({
  lang: "fa",
  nonce: "test-nonce",
  build: "1.0.0",
  debug: false,
  origin: "https://worker.example",
});

const page = (opts = {}) =>
  renderHome({
    lang: "fa",
    nonce: "test-nonce",
    build: "1.0.0",
    debug: false,
    origin: "https://worker.example",
    ...opts,
  });

function* walk(node) {
  yield node;
  for (const child of node.childNodes || []) yield* walk(child);
}

function attr(node, name) {
  const item = (node.attrs || []).find((a) => a.name === name);
  return item ? item.value : null;
}

function hasAttr(node, name) {
  return (node.attrs || []).some((a) => a.name === name);
}

function all(root, tagName) {
  return [...walk(root)].filter((n) => n.tagName === tagName);
}

function byId(root, id) {
  return [...walk(root)].find((n) => attr(n, "id") === id);
}

function text(node) {
  if (node.nodeName === "#text") return node.value || "";
  return (node.childNodes || []).map(text).join("");
}

function first(root, tagName) {
  return all(root, tagName)[0];
}

function styleText(html) {
  const match = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  return match ? match[1] : "";
}

test("the page is server-rendered with all six informational sections", () => {
  const doc = parse(PAGE);
  for (const id of ["tool", "result", "how", "docs", "faq", "legal"]) {
    const section = byId(doc, id);
    assert.ok(section, `missing #${id}`);
    assert.equal(section.tagName, "section", `#${id} should be a section`);
    assert.equal(hasAttr(section, "hidden"), false, `#${id} must not be hidden`);
  }
  assert.equal(all(doc, "h1").length, 1);
  assert.ok(text(first(doc, "h1")).includes("اینستاگرام"));
  assert.ok(byId(doc, "urlInput"));
  assert.ok(byId(doc, "resolveBtn"));
  assert.ok(byId(doc, "resultBox"));
  assert.equal(all(byId(doc, "how"), "li").length, 3);
  assert.ok(all(doc, "details").length >= 5, "FAQ needs at least five items");
  assert.ok(byId(doc, "docs").childNodes.length > 0);
});

test("the empty result state does not hide the section itself", () => {
  const doc = parse(PAGE);
  const box = byId(doc, "resultBox");
  const placeholder = byId(doc, "resultPlaceholder");
  assert.ok(box);
  assert.ok(placeholder);
  assert.equal(hasAttr(box, "hidden"), false);
  assert.equal(hasAttr(placeholder, "hidden"), false);
  assert.ok(text(placeholder).trim().length > 0);
});

test("static content stays visible until JS and the observer are actually armed", () => {
  const css = styleText(PAGE);
  assert.match(css, /\[hidden\]\s*\{\s*display\s*:\s*none\s*!important/i);
  assert.match(css, /prefers-reduced-motion\s*:\s*no-preference/i);
  assert.match(css, /\.js\.io\s+\.reveal/i);

  const hidden = [...css.matchAll(/opacity\s*:\s*0(?:[;}\s]|$)/g)];
  assert.equal(hidden.length, 1, "opacity:0 should only appear once");
  const before = css.slice(Math.max(0, hidden[0].index - 220), hidden[0].index);
  assert.match(before, /\.js\.io\s+\.reveal/, "opacity:0 must be gated by .js.io");

  assert.match(PAGE, /setTimeout\s*\(/);
  assert.match(PAGE, /1000/);
  assert.match(PAGE, /classList\.add\(["']in["']\)/);
  assert.doesNotMatch(PAGE, /<html[^>]*class="[^"]*\bjs\b/);
});

test("no inline handler, inline style attribute, or external asset is emitted", () => {
  const doc = parse(PAGE);
  for (const node of walk(doc)) {
    if (!node.tagName) continue;
    for (const a of node.attrs || []) {
      assert.ok(!/^on/i.test(a.name), `${node.tagName} has inline handler ${a.name}`);
      assert.notEqual(a.name, "style", `${node.tagName} has inline style attribute`);
    }
  }
  assert.equal(all(doc, "link").length, 0);
  assert.doesNotMatch(PAGE, /https?:\/\/fonts\./i);
  assert.doesNotMatch(PAGE, /@import/i);
  assert.doesNotMatch(PAGE, /<script[^>]+src=/i);

  const allowed = (href) =>
    href.startsWith("#") ||
    href.startsWith("?") ||
    href.startsWith("/") ||
    href.startsWith("https://");
  for (const a of all(doc, "a")) {
    const href = attr(a, "href");
    if (href == null) continue;
    assert.ok(allowed(href), `unexpected link target: ${href}`);
  }
});

test("every inline script and the stylesheet carry the CSP nonce", () => {
  const doc = parse(PAGE);
  const style = first(doc, "style");
  assert.equal(attr(style, "nonce"), "test-nonce");
  for (const script of all(doc, "script")) {
    assert.equal(
      attr(script, "nonce"),
      "test-nonce",
      `script ${attr(script, "id") || attr(script, "type") || ""} lacks nonce`,
    );
  }
  const boot = byId(doc, "boot");
  assert.ok(boot);
  assert.equal(attr(boot, "type"), "application/json");
  const bootData = JSON.parse(text(boot));
  assert.equal(bootData.lang, "fa");
  assert.equal(bootData.debug, false);
  assert.ok(bootData.strings.hero_title);
});

test("Persian is the default page, English is an explicit switch", () => {
  assert.equal(DEFAULT_UI_LANG, "fa");
  assert.equal(uiLangFromRequest(new Request("https://w/")), "fa");
  assert.equal(uiLangFromRequest(new Request("https://w/?lang=en")), "en");
  assert.equal(uiLangFromRequest(new Request("https://w/?lang=fa")), "fa");

  const fa = parse(PAGE);
  const htmlFa = first(fa, "html");
  assert.equal(attr(htmlFa, "lang"), "fa");
  assert.equal(attr(htmlFa, "dir"), "rtl");
  const switchFa = all(fa, "a").find((a) => attr(a, "class") === "lang-link");
  assert.equal(attr(switchFa, "href"), "?lang=en");

  const enDoc = parse(page({ lang: "en" }));
  const htmlEn = first(enDoc, "html");
  assert.equal(attr(htmlEn, "lang"), "en");
  assert.equal(attr(htmlEn, "dir"), "ltr");
  const switchEn = all(enDoc, "a").find((a) => attr(a, "class") === "lang-link");
  assert.equal(attr(switchEn, "href"), "?lang=fa");
  assert.ok(PAGE.includes("چطور کار می‌کند"));
  assert.ok(!PAGE.includes("How it works"));
  assert.ok(page({ lang: "en" }).includes("How it works"));
});

test("debug mode alone exposes the error panel and debug bridge", () => {
  assert.equal(byId(parse(PAGE), "debugPanel"), undefined);
  const debug = page({ debug: true });
  const doc = parse(debug);
  assert.ok(byId(doc, "debugPanel"));
  const bootData = JSON.parse(text(byId(doc, "boot")));
  assert.equal(bootData.debug, true);
  assert.match(debug, /window\.__insta/);
  assert.match(debug, /function report\(/);
});

test("docs contain real endpoints, error codes and runnable samples", () => {
  const doc = parse(PAGE);
  const docs = byId(doc, "docs");
  const codes = all(docs, "code").map((n) => text(n));
  for (const path of ["/api/v1/resolve", "/api/v1/download", "/api/v1/thumbnail", "/health", "/openapi.json"]) {
    assert.ok(codes.some((c) => c.includes(path)), `docs missing ${path}`);
  }
  for (const code of [
    "E_INVALID_URL",
    "E_PRIVATE_OR_NOT_FOUND",
    "E_UPSTREAM_TIMEOUT",
    "E_RATE_LIMIT",
    "E_TOO_LARGE",
    "E_NOT_ALLOWED_HOST",
  ]) {
    assert.ok(codes.includes(code), `error table missing ${code}`);
  }
  assert.ok(codes.some((c) => c.includes("curl")));
  assert.ok(codes.some((c) => c.includes("fetch")));
  assert.ok(codes.some((c) => c.includes("requests")));
  const openapi = all(docs, "a").find((a) => attr(a, "href") === "/openapi.json");
  assert.ok(openapi);
});

test("the two language catalogues have identical UI and docs keys", () => {
  assert.deepEqual(missingUiKeys("en"), []);
  assert.deepEqual(missingUiKeys("fa"), []);
  const fa = uiStrings("fa");
  const en = uiStrings("en");
  assert.deepEqual(Object.keys(fa).sort(), Object.keys(en).sort());
  for (const key of Object.keys(fa)) {
    assert.ok(String(fa[key]).trim().length > 0, `fa.${key} is empty`);
    assert.ok(String(en[key]).trim().length > 0, `en.${key} is empty`);
  }
  assert.equal(isRtl("fa"), true);
  assert.equal(isRtl("en"), false);

  const docsFa = docsFor("fa");
  const docsEn = docsFor("en");
  assert.equal(docsFa.endpoints.length, docsEn.endpoints.length);
  assert.equal(docsFa.errors.length, docsEn.errors.length);
  assert.equal(docsFa.faq.length, docsEn.faq.length);
  assert.equal(docsFa.steps.length, docsEn.steps.length);
  assert.ok(docsFa.endpoints.length >= 5);
  assert.ok(docsFa.errors.length >= 12);
});

test("safeHref only allows https and in-page anchors", () => {
  assert.equal(safeHref("https://www.instagram.com/p/abc/"), "https://www.instagram.com/p/abc/");
  assert.equal(safeHref("#result"), "#result");
  assert.equal(safeHref("javascript:alert(1)"), "#");
  assert.equal(safeHref("http://example.com/x"), "#");
  assert.equal(safeHref("data:text/html,x"), "#");
  assert.equal(safeHref(null), "#");
  assert.equal(safeHref(""), "#");
  assert.equal(safeHref(undefined, "#fallback"), "#fallback");
});

test("formatDuration handles seconds, minutes, hours and empty input", () => {
  assert.equal(formatDuration(0), "");
  assert.equal(formatDuration(5, "s"), "0:05");
  assert.equal(formatDuration(5000, "ms"), "0:05");
  assert.equal(formatDuration(7), "0:07");
  assert.equal(formatDuration(67), "1:07");
  assert.equal(formatDuration(3661, "s"), "1:01:01");
  assert.equal(formatDuration(null), "");
  assert.equal(formatDuration("nope"), "");
});
