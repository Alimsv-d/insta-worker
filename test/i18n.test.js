import { test } from "node:test";
import assert from "node:assert/strict";
import { docsFor, uiStrings, missingKeys, LANGS, t } from "../src/lib/i18n.js";
import { ERROR_STATUS } from "../src/lib/http.js";

test("both languages expose exactly the same UI message keys", () => {
  for (const lang of LANGS) {
    assert.deepEqual(missingKeys(lang), [], `${lang} is missing keys`);
  }
});

test("the docs catalogue exists and is localized for both languages", () => {
  for (const lang of LANGS) {
    const docs = docsFor(lang);
    assert.ok(docs.endpoints.length >= 5, `${lang} endpoints`);
    assert.ok(docs.errors.length >= 10, `${lang} errors`);
    assert.ok(docs.faq.length >= 4, `${lang} faq`);
    assert.ok(docs.tos.length >= 4, `${lang} tos`);
    assert.ok(docs.about.length >= 3, `${lang} about`);
    for (const row of docs.endpoints) assert.equal(row.length, 3, `${lang} endpoint row`);
    for (const row of docs.errors) assert.equal(row.length, 3, `${lang} error row`);
    for (const row of docs.faq) assert.equal(row.length, 2, `${lang} faq row`);
  }
});

test("every API error code has a documentation row", () => {
  for (const lang of LANGS) {
    const documented = new Set(docsFor(lang).errors.map((row) => row[0]));
    for (const code of Object.keys(ERROR_STATUS)) {
      assert.ok(documented.has(code), `${lang} docs miss ${code}`);
    }
    for (const row of docsFor(lang).errors) {
      assert.equal(row[1], ERROR_STATUS[row[0]], `${lang} ${row[0]} status`);
    }
  }
});

test("docsFor falls back to the default language and returns fresh copies", () => {
  assert.deepEqual(docsFor("xx"), docsFor(LANGS[0]));
  const a = docsFor("fa");
  a.endpoints[0][0] = "MUTATED";
  a.tos.push("MUTATED");
  assert.notEqual(docsFor("fa").endpoints[0][0], "MUTATED");
  assert.ok(!docsFor("fa").tos.includes("MUTATED"));
});

test("client-facing strings used by the UI script are present", () => {
  for (const lang of LANGS) {
    const S = uiStrings(lang);
    for (const key of [
      "samples_title",
      "nav_docs",
      "btn_download_all",
      "zip_failed",
      "zip_partial",
      "download_started",
      "offline_hint",
      "skip_to_tool",
      "menu_open",
      "menu_close",
    ]) {
      assert.equal(typeof S[key], "string", `${lang}.${key}`);
      assert.ok(S[key].length > 0, `${lang}.${key}`);
    }
    assert.equal(typeof t(lang, "E_RATE_LIMIT"), "string");
  }
});
