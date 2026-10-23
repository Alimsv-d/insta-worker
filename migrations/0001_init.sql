-- insta-worker initial schema.
--
-- IMPORTANT: these statements are duplicated in src/lib/storage.js (SCHEMA)
-- because the worker applies them idempotently on first request. The test
-- suite asserts that both stay in sync, so change them together.
--
-- Apply manually with:
--   npx wrangler d1 migrations apply insta_worker --remote

CREATE TABLE IF NOT EXISTS stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  event TEXT NOT NULL,
  code TEXT,
  ip_hash TEXT,
  shortcode TEXT,
  provider TEXT
);

CREATE INDEX IF NOT EXISTS idx_stats_ts ON stats(ts);

CREATE INDEX IF NOT EXISTS idx_stats_event ON stats(event);

CREATE TABLE IF NOT EXISTS api_keys (
  key_hash TEXT PRIMARY KEY,
  label TEXT,
  limit_per_minute INTEGER,
  created_at INTEGER,
  disabled INTEGER DEFAULT 0
);
