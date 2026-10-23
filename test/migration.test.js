import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SCHEMA } from "../src/lib/storage.js";

/**
 * Whitespace/comment-insensitive normal form so the SQL can be formatted for
 * humans in the migration file and remain compact in storage.js.
 */
function normalize(sql) {
  return String(sql)
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .replace(/\s+/g, " ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .trim();
}

test("migrations/0001_init.sql matches the runtime SCHEMA", () => {
  const file = readFileSync(new URL("../migrations/0001_init.sql", import.meta.url), "utf8");
  const fromFile = normalize(file)
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  const fromCode = SCHEMA.map((s) => normalize(s).replace(/;$/, "").trim());
  assert.deepEqual(fromFile, fromCode);
});

test("migration creates the stats and api_keys tables plus indexes", () => {
  const file = readFileSync(new URL("../migrations/0001_init.sql", import.meta.url), "utf8");
  for (const needle of [
    "CREATE TABLE IF NOT EXISTS stats",
    "CREATE INDEX IF NOT EXISTS idx_stats_ts",
    "CREATE INDEX IF NOT EXISTS idx_stats_event",
    "CREATE TABLE IF NOT EXISTS api_keys",
  ]) {
    assert.ok(file.includes(needle), needle);
  }
});
