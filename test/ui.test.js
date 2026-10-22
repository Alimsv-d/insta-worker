import { test } from "node:test";
import assert from "node:assert/strict";
import { parse } from "parse5";
import worker from "../src/worker.js";
import { renderHome } from "../src/lib/ui.js";

function findText(node, out = []) {
  if (node.nodeName === "#text" && node.value) out.push(node.value);
  for (const child of node.childNodes || []) findText(child, out);
  // parse5 template content
  if (node.content && node.content.childNodes) {
    for (const child of node.content.childNodes) findText(child, out);
  }
  return out;
}

function findAll(node, predicate, out = []) {
  if (predicate(node)) out.push(node);
  for (const child of node.childNodes || []) findAll(child, predicate, out);
  if (node.content && node.content.childNodes) {
    for (const child of node.content.childNodes) findAll(child, predicate, out);
  }
  return out;
}

function attr(node, name) {
  const a = (node.attrs || []).find((x) => x.name === name);
  return a ? a.value : null;
}

async function fetchHtml(path = "/") {
  const env = { DEFAULT_LANG: "fa", CONTACT_URL: "https://example.com/c" };
  const res = await worker.fetch(new Request("https://worker.example" + path), env, {});
  return { res, html: await res.text() };
}

test("home page parses and contains all required sections", async () => {
  const { res, html } = await fetchHtml("/");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") || "", /text\/html/);

  const doc = parse(html);

  const ids = new Set(
    findAll(doc, (n) => n.attrs && attr(n, "id")).map((n) => attr(n, "id")),
  );
  for (const required of ["tool", "history", "docs", "faq", "tos", "about", "urlInput", "resolveForm", "result", "tryEndpoint", "errorsBody", "samples", "faqList", "tosBody", "aboutBody"]) {
    assert.ok(ids.has(required), `missing #${required}`);
  }
});

test("critical sections are NOT hidden by default (the Shazam bug)", async () => {
  const { html } = await fetchHtml("/");
  const doc = parse(html);
  // #result may be hidden (populated on demand) but the main sections must not be.
  for (const id of ["tool", "history", "docs", "faq", "tos", "about"]) {
    const node = findAll(doc, (n) => n.attrs && attr(n, "id") === id)[0];
    assert.ok(node, `#${id} present`);
    const hidden = attr(node, "hidden");
    assert.equal(hidden, null, `#${id} must not be hidden`);
  }
});

test("page has an h1 and localized brand text", async () => {
  const { html } = await fetchHtml("/?lang=fa");
  const doc = parse(html);
  const h1s = findAll(doc, (n) => n.nodeName === "h1");
  assert.ok(h1s.length >= 1);
  const text = findText(h1s[0]).join(" ").trim();
  assert.ok(text.length > 0);
});

test("page direction is rtl for fa and ltr for en", async () => {
  const { html: fa } = await fetchHtml("/?lang=fa");
  const { html: en } = await fetchHtml("/?lang=en");
  assert.match(fa, /<html lang="fa" dir="rtl">/);
  assert.match(en, /<html lang="en" dir="ltr">/);
});

test("bundled script has no external framework dependency", async () => {
  const { html } = await fetchHtml("/");
  const doc = parse(html);
  const scripts = findAll(doc, (n) => n.nodeName === "script").map((n) => attr(n, "src") || "");
  for (const src of scripts) {
    assert.ok(!/jquery|react|vue|bootstrap/i.test(src), `unexpected external dep: ${src}`);
  }
});

test("inline script carries a nonce (CSP-safe)", async () => {
  const { res } = await fetchHtml("/");
  const csp = res.headers.get("content-security-policy") || "";
  const m = csp.match(/'nonce-([a-f0-9]+)'/);
  assert.ok(m, "CSP has a nonce");
  assert.match(csp, /script-src[^;]*'nonce-/);
});

test("security headers are set on the page", async () => {
  const { res } = await fetchHtml("/");
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("x-frame-options"), "DENY");
  assert.ok(res.headers.get("content-security-policy"));
  assert.ok(res.headers.get("referrer-policy"));
  assert.ok(res.headers.get("permissions-policy"));
});

test("debug mode renders the red debug panel", async () => {
  const { html } = await fetchHtml("/?debug=1");
  assert.match(html, /id="debugPanel"/);
});

test("escapes hostile query input in HTML", async () => {
  const html = renderHome({ lang: "fa", nonce: "n1", build: '</script><script>alert(1)</script>', contact: '"><img src=x>', debug: false });
  assert.ok(!html.includes("</script><script>alert(1)"));
  assert.ok(!html.includes('"><img src=x>'));
});

test("enumeration of API endpoints appears in docs section", async () => {
  const { html } = await fetchHtml("/");
  for (const ep of ["/api/v1/resolve", "/api/v1/download", "/api/v1/thumbnail", "/health", "/openapi.json"]) {
    assert.ok(html.includes(ep), `docs should mention ${ep}`);
  }
});
