import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LANG, LANGS, langFromRequest, normalizeLang, t, hasMessage } from "../src/lib/i18n.js";

test("English is the default; only ?lang=fa opts into Persian", () => {
  assert.equal(DEFAULT_LANG, "en");
  assert.deepEqual(LANGS, ["en", "fa"]);
  assert.equal(langFromRequest(new Request("https://w/api/v1/resolve?url=x")), "en");
  assert.equal(langFromRequest(new Request("https://w/api/v1/resolve?url=x&lang=fa")), "fa");
  assert.equal(langFromRequest(new Request("https://w/api/v1/resolve?url=x&lang=fa-IR")), "en");
  assert.equal(langFromRequest(new Request("https://w/api/v1/resolve?url=x&lang=en")), "en");
});

test("normalizeLang is case-sensitive and safe", () => {
  assert.equal(normalizeLang("fa"), "fa");
  assert.equal(normalizeLang("FA"), "en");
  assert.equal(normalizeLang(undefined), "en");
});

test("every API error code has both English and Persian text", () => {
  for (const code of [
    "E_INVALID_URL",
    "E_INVALID_REQUEST",
    "E_PRIVATE_OR_NOT_FOUND",
    "E_UPSTREAM_FAILED",
    "E_UPSTREAM_UNAVAILABLE",
    "E_UPSTREAM_TIMEOUT",
    "E_RATE_LIMIT",
    "E_TOO_LARGE",
    "E_NOT_ALLOWED_HOST",
    "E_NOT_ALLOWED_TYPE",
    "E_BAD_QUALITY",
    "E_BAD_INDEX",
    "E_NO_VARIANTS",
    "E_METHOD",
    "E_NOT_FOUND",
    "E_UNAUTHORIZED",
    "E_INTERNAL",
  ]) {
    assert.ok(hasMessage("en", code), code);
    assert.ok(hasMessage("fa", code), code);
    assert.notEqual(t("en", code), t("fa", code), code);
  }
});

test("unknown codes fall back to the code itself", () => {
  assert.equal(t("en", "E_UNKNOWN"), "E_UNKNOWN");
  assert.equal(t("fa", "E_UNKNOWN"), "E_UNKNOWN");
});
