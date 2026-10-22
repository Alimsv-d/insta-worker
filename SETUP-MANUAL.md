# SETUP-MANUAL — راه‌اندازی دستی کامل / Full manual setup

This guide walks through everything without the one-click button: creating the
KV namespace and D1 database, setting variables and secrets, deploying from the
Dashboard, from Wrangler on any OS, and notes for Android/Termux, Windows,
Linux and cPanel.

راهنمای کامل بدون دکمهٔ یک‌کلیکی: ساخت KV/D1، تنظیم متغیرها و Secretها،
استقرار از Dashboard و با Wrangler روی هر سیستم‌عامل، و نکات اندروید/Termux،
ویندوز، لینوکس و cPanel.

> ⚠️ Never paste tokens into chats or screenshots. If you ever did, roll/revoke
> them immediately before deploying.
> ⚠️ هرگز توکن را در چت یا اسکرین‌شات نگذارید؛ اگر گذاشتید پیش از استقرار
> فوراً Roll/Revoke کنید.

---

## 1) Prerequisites / پیش‌نیازها
- A Cloudflare account with Workers enabled.
- Node.js **20+** (CI uses 22) and npm.
- A GitHub account (only to enable the deploy button / Actions).

```bash
node --version   # >= 20
npm --version
```

---

## 2) Create KV and D1 manually / ساخت دستی KV و D1

### Dashboard
1. **Workers & Pages → KV** → *Create namespace* → name it `insta_worker_kv`.
   Copy the **Namespace ID**.
2. **Workers & Pages → D1** → *Create database* → name it `insta_worker`.
   Copy the **Database ID**.

Then edit `wrangler.toml` and put the ids in:

```toml
[[kv_namespaces]]
binding = "KV"
id = "<your-kv-namespace-id>"

[[d1_databases]]
binding = "DB"
database_name = "insta_worker"
database_id = "<your-d1-database-id>"
```

On Wrangler ≥ 3.60 you may instead **omit the ids** and let `wrangler deploy`
auto-provision them. The provided `wrangler.toml` ships with auto-provisioning
by default.

### Schema
You do **not** need to run any SQL: the worker applies an idempotent schema
(`stats`, `api_keys` + indexes) on the first request. If you prefer to pre-create
it, edit `src/lib/storage.js` → `SCHEMA` and run those statements in the D1
console. If D1 is missing or errors, the service keeps working with stats
disabled ("degrade").

---

## 3) Variables and secrets / متغیرها و Secretها

Variables live in `wrangler.toml` under `[vars]` (or Dashboard → Worker →
Settings → Variables). Defaults are sane; change as needed:
`UPSTREAM_URLS`, `RATE_LIMIT_PER_MINUTE`, `RATE_LIMIT_DOWNLOAD_PER_MINUTE`,
`MAX_DOWNLOAD_MB`, `CDN_ALLOWLIST`, `CONTACT_URL`, `CACHE_TTL_SECONDS`,
`UPSTREAM_TIMEOUT_MS`, `DEFAULT_LANG`.

Secrets (encrypted, never in git):
```bash
wrangler secret put ADMIN_TOKEN
# optional
wrangler secret put UPSTREAM_TOKEN
```
Or Dashboard → Worker → Settings → Variables and Secrets → *Add* → *Secret*.

For local dev copy `.dev.vars.example` to `.dev.vars` and fill it in.

---

## 4) Deploy with Wrangler / استقرار با Wrangler

### Linux / macOS
```bash
git clone https://github.com/Alimsv-d/insta-worker.git
cd insta-worker
npm install --no-audit --no-fund
npx wrangler login          # opens browser; or use CLOUDFLARE_API_TOKEN
npm run check               # optional: run the test suite
npm run deploy
```

### Windows (PowerShell)
```powershell
git clone https://github.com/Alimsv-d/insta-worker.git
cd insta-worker
npm install --no-audit --no-fund
npx wrangler login
npm run deploy
```

### Android / Termux
```bash
pkg update && pkg install nodejs-lts git
git clone https://github.com/Alimsv-d/insta-worker.git
cd insta-worker && npm install --no-audit --no-fund
# Browser login is awkward on Termux; use an API token instead:
export CLOUDFLARE_API_TOKEN="<token>"
export CLOUDFLARE_ACCOUNT_ID="<account-id>"
npx wrangler deploy
```

### cPanel / shared hosting (Node is present)
Shared hosts usually cannot run a long-lived process, but you only need the CLI
to push a deploy (the worker runs on Cloudflare):
```bash
# from a shell inside your home dir
npm install --no-audit --no-fund
CLOUDFLARE_API_TOKEN=<token> CLOUDFLARE_ACCOUNT_ID=<id> npx wrangler deploy
```
If `npm install` is not possible, build locally and upload `worker.js` as a
single-file Worker via the Dashboard (the UI, API and providers are all in
`src/`, so prefer the Dashboard "Quick edit" only for the bundler-free path).

---

## 5) Deploy from the Dashboard / استقرار از Dashboard
1. Workers & Pages → *Create* → *Worker*.
2. Name it `insta-worker` and create.
3. Replace the code with the bundled worker (Dashboard → *Edit code*). Because
   the project is multi-file ES modules, the cleanest path is *Upload* with the
   built bundle, or bind a GitHub repo:
   **Worker → Settings → Build → Connect a repository** and pick your fork.
4. Add the KV/D1 bindings, variables and secrets from sections 2–3.
5. Save and Deploy.

---

## 6) GitHub Actions (optional CI deploy)
1. Repo → **Settings → Secrets and variables → Actions**.
2. Add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
3. Run the **Deploy to Cloudflare Workers** workflow manually.
   If the secrets are missing the workflow prints a clear warning and skips the
   deploy (it does not fail silently).

---

## 7) Verify / بررسی

```bash
curl https://<worker>/health
curl "https://<worker>/api/v1/resolve?url=https://www.instagram.com/reel/ABC123/&lang=en"
```
Open `https://<worker>/` for the UI and `https://<worker>/?debug=1` to surface
JS errors in a red panel.

---

## 8) Rotating compromised tokens / چرخش توکن‌های لو رفته
- **Cloudflare**: My Profile → API Tokens → *Roll* / *Delete* the leaked token,
  then update the GitHub Secret and `wrangler secret put`.
- **Telegram** (if you ever had a bot token exposed): message **@BotFather** →
  `/revoke` and pick the bot.
- After rotating, re-deploy and confirm `/health`.

---

## 9) What to test by hand / چه چیزی را دستی تست کنید
Automated tests mock the network. On a real deployment, please verify:
- A real reel/post/album resolves and the preview, caption and author show.
- Quality selection and a real download (check the filename and Range/seek).
- Album ZIP in a real browser.
- `/health`, `/?debug=1`, rate limiting (429 + `Retry-After`) and the error codes.
- RTL/LTR and light/dark in a real browser and on a phone.
