#!/usr/bin/env node
// Scans the working tree (tracked-ish files) for accidental secrets before a
// push. Exits non-zero if anything suspicious is found. Personal identifiers
// (a specific Telegram admin id, channel handles, bot tokens) and Cloudflare /
// provider tokens are all flagged.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SKIP_DIRS = new Set([".git", "node_modules", ".wrangler", "dist", ".cleanup_trash"]);
const SKIP_FILES = new Set(["scripts/secret-scan.mjs"]);
const TEXT_EXT = /\.(js|mjs|cjs|ts|json|toml|md|txt|yml|yaml|html|css|example|sh)$/i;

const PATTERNS = [
  { name: "Telegram bot token", re: /\b\d{7,12}:AA[A-Za-z0-9_-]{30,}\b/ },
  { name: "Telegram admin id (personal)", re: /\b7354122540\b/ },
  { name: "Telegram channel handle", re: /@RMSource\b|RMSourceBot|t\.me\/RMSource/i },
  { name: "Cloudflare API token", re: /\b[A-Za-z0-9_-]{40}\b(?=.*cloudflare)|CLOUDFLARE_API_TOKEN\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i },
  { name: "AWS access key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "Private key block", re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: "Generic bearer secret assignment", re: /(?:secret|token|password|api[_-]?key)\s*[:=]\s*["'][A-Za-z0-9_\-]{16,}["']/i },
];

// Known-safe, deliberately public values. They are NOT credentials: they only
// avoid an empty HMAC key. Keep this list short and review every addition.
const ALLOWED_LINES = [/insta-worker-default-ip-hash-secret/];

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, files);
    else if (TEXT_EXT.test(entry) && st.size < 2_000_000 && !SKIP_FILES.has(relative(ROOT, full))) files.push(full);
  }
  return files;
}

let hits = 0;
for (const file of walk(ROOT)) {
  const content = readFileSync(file, "utf8");
  const lines = content.split("\n");
  lines.forEach((line, i) => {
    if (ALLOWED_LINES.some((re) => re.test(line))) return;
    for (const p of PATTERNS) {
      if (p.re.test(line)) {
        hits++;
        console.error(`[SECRET?] ${relative(ROOT, file)}:${i + 1} -> ${p.name}`);
        console.error(`          ${line.trim().slice(0, 120)}`);
      }
    }
  });
}

if (hits > 0) {
  console.error(`\n✖ secret-scan found ${hits} suspicious match(es). Do NOT push.`);
  process.exit(1);
}
console.log("✔ secret-scan clean");
