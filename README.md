# insta-worker

> Independent Instagram public-content **resolver & downloader** that runs as a single **Cloudflare Worker**. Public content only: no cookies, no login, no private media.

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Alimsv-d/insta-worker)

فارسی در پایین · English below

---

## English

### What it is
A framework-free Cloudflare Worker that turns a public Instagram link into a rich
preview plus a clean, streamed download. It ships a bilingual (fa/en) web UI, a
versioned JSON API, rate limiting, a short metadata cache and anonymous stats.

### Features
- **Rich preview**: thumbnail, author, caption, type (video/photo/album), item
  count, duration, dimensions and approximate size.
- **Honest quality picker**: every variant the upstream actually returns. Best is
  the default; if only one version exists the UI says so instead of inventing
  fake qualities.
- **Albums / carousels**: preview every item, download individually, or build a
  ZIP **in the browser** with a streaming writer (constant memory, stable order,
  partial-failure report).
- **Secure streaming proxy**: strong `ETag`, HTTP **Range** pass-through,
  `Content-Disposition: attachment` by default and `inline` for the in-page
  player (`?inline=1`). The body is streamed, never buffered.
- **Bilingual UI** (fa/en, auto RTL/LTR), light/dark theme, responsive layout,
  local history, copy/share and a report link.
- **Hardened by construction**:
  - CSP without `unsafe-inline`, separate per-request nonces for the inline
    `<script>` and `<style>`;
  - HTML and API responses that carry a nonce/rate-limit headers are
    `private, no-store`;
  - the proxy is HTTPS-only, allowlisted, rejects private/loopback/link-local
    IPv4 **and** IPv6, re-validates every redirect hop, caps the body by real
    bytes and applies idle/total timeouts;
  - IPs are never stored raw: only an HMAC-SHA256 bucket key is kept in KV.
- **Versioned API** with a standard JSON envelope, CORS, ETag/304, structured
  error codes and an OpenAPI document.

### Architecture
```
request ──► router (src/worker.js)
             ├─ /                single-file UI (src/lib/ui.js)
             ├─ /api/v1/resolve  metadata + variants (cached in KV)
             ├─ /api/v1/download streamed proxy (Range, size cap, inline)
             ├─ /api/v1/thumbnail safe image proxy
             ├─ /api/v1/admin/*  ADMIN_TOKEN protected API keys
             ├─ /health          service + provider health (deep=1)
             ├─ /openapi.json    OpenAPI 3 document
             └─ /robots.txt

providers (src/lib/providers.js): ordered UPSTREAM_URLS, per-call timeout,
retry with jitter, per-URL circuit breaker (one half-open probe), health map.
normalize (src/lib/normalize.js): one shape for every upstream.
security (src/lib/security.js): SSRF guards + streaming proxy.
storage (src/lib/storage.js): KV rate limit/cache, HMAC IP hashing, D1 stats
and optional API keys. A Cron trigger purges old stats.
```

### Deploy

**One-click:** click the button above, authorize Cloudflare and deploy. KV and D1
are auto-provisioned (Wrangler >= 3.60). The first request applies the schema
idempotently; the same statements live in `migrations/0001_init.sql`.

**Manual:** see **[SETUP-MANUAL.md](./SETUP-MANUAL.md)** for the dashboard,
Wrangler, GitHub → Cloudflare integration and the GitHub Actions workflow.

**Single-file bundle** (for Dashboard *Quick edit* or a custom pipeline):
```bash
npm install
npm run bundle        # -> dist/worker.js (ESM, git-ignored)
npm run bundle:min    # minified
```

### Configuration
Worker variables (`wrangler.toml` → `[vars]` or Dashboard → Settings → Variables):

| Variable | Default | Meaning |
|---|---|---|
| `UPSTREAM_URLS` | `https://catplus.ir/api/insta` | Comma-separated, ordered providers |
| `RATE_LIMIT_PER_MINUTE` | `60` | Resolve requests / minute / bucket |
| `RATE_LIMIT_DOWNLOAD_PER_MINUTE` | `20` | Download requests / minute |
| `RATE_LIMIT_THUMBNAIL_PER_MINUTE` | `60` | Thumbnail proxy requests / minute |
| `RATE_LIMIT_ADMIN_PER_MINUTE` | `10` | Admin requests / minute |
| `RATE_LIMIT_HEALTH_PER_MINUTE` | `10` | Deep health requests / minute |
| `MAX_DOWNLOAD_MB` | `80` | Hard cap for a proxied download |
| `CDN_ALLOWLIST` | `*.cdninstagram.com,*.fbcdn.net,*.instagram.com,*.facebook.com` | Allowed proxy hosts |
| `CONTACT_URL` | repo issues | Contact / takedown link |
| `CACHE_TTL_SECONDS` | `120` | Metadata cache TTL (min 60, max 900) |
| `UPSTREAM_TIMEOUT_MS` | `12000` | Per-provider timeout (headers + body) |
| `DEFAULT_LANG` | `fa` | Default UI/API language |

Secrets (never commit):
- `ADMIN_TOKEN` — protects `/api/v1/admin/*`.
- `UPSTREAM_TOKEN` — optional bearer token; only sent to `UPSTREAM_TOKEN_HOST`
  (or to the single configured provider when no host is set).
- `IP_HASH_SECRET` — >= 16 chars. Keys the HMAC used for IP buckets. A public
  default is used when unset, so set this in production to make hashes
  non-comparable across deployments.

### API reference
Success: `{ ok:true, status:200, lang, request_id, data }`.
Error: `{ ok:false, status, lang, request_id, error:{ code, message } }`.
`request_id` is also returned in the `X-Request-Id` header.

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/resolve?url=&lang=` | Metadata + variant list |
| GET | `/api/v1/download?url=&quality=&index=&inline=&lang=` | Streamed download / playback |
| GET | `/api/v1/thumbnail?url=&lang=` | Proxied thumbnail |
| GET | `/health?deep=1` | Health, providers, limits |
| GET | `/openapi.json` | OpenAPI 3 spec |
| GET | `/api/v1/admin/keys` | List keys (labels only) |
| POST | `/api/v1/admin/keys` | Create/update a key (`{key,label?,limit_per_minute?}`) |
| DELETE | `/api/v1/admin/keys` | Disable a key (`{key}`) |

Admin requests use `Authorization: Bearer <ADMIN_TOKEN>`.
Only a hash of each API key is stored; a disabled key can never be re-enabled.

Error codes: `E_INVALID_URL`, `E_INVALID_REQUEST`, `E_PRIVATE_OR_NOT_FOUND`,
`E_UPSTREAM_FAILED`, `E_UPSTREAM_UNAVAILABLE`, `E_RATE_LIMIT`, `E_TOO_LARGE`,
`E_NOT_ALLOWED_HOST`, `E_NOT_ALLOWED_TYPE`, `E_BAD_QUALITY`, `E_BAD_INDEX`,
`E_NO_VARIANTS`, `E_METHOD`, `E_NOT_FOUND`, `E_UNAUTHORIZED`, `E_FORBIDDEN`,
`E_KEY_DISABLED`, `E_KEY_EXISTS`, `E_INTERNAL`. Every response includes
`X-RateLimit-*`; limited responses include `Retry-After`.

**Samples**

```bash
# curl
curl "https://<worker>/api/v1/resolve?url=https://www.instagram.com/reel/ABC123/"
```
```python
# Python
import requests
r = requests.get("https://<worker>/api/v1/resolve",
                 params={"url": "https://www.instagram.com/reel/ABC123/"})
print(r.json())
```
```php
// PHP
$j = file_get_contents("https://<worker>/api/v1/resolve?url=" .
      urlencode("https://www.instagram.com/reel/ABC123/"));
echo $j;
```
```javascript
// JavaScript
const j = await (await fetch("https://<worker>/api/v1/resolve?url=https://www.instagram.com/reel/ABC123/")).json();
console.log(j);
```

### Development
```bash
npm install --no-audit --no-fund
npm run check        # syntax check + 111 mocked tests (no real network)
npm test             # tests only
npm run bundle       # single-file dist/worker.js
npm run dev          # wrangler dev
npm run deploy       # wrangler deploy
npm run secret-scan  # block accidental tokens before pushing
```

The tests mock `fetch`; they cover URL parsing, normalisation, provider
fallback/breaker, SSRF and redirect rules, streaming caps, KV/D1 helpers,
migration/schema parity, i18n completeness, HTML/CSP and the HTTP routes.

### Troubleshooting
- **429** — wait for `Retry-After`, or create an API key for a higher limit.
- **E_UPSTREAM_FAILED** — every provider failed; check `UPSTREAM_URLS` and
  `/health?deep=1`.
- **E_NOT_ALLOWED_HOST** — the CDN is not allowlisted; extend `CDN_ALLOWLIST`.
- **Blank/odd page** — open `/?debug=1`; the page is server-rendered and visible
  without JavaScript by design.
- **D1/KV missing** — the worker degrades: caching/rate limiting or stats are
  skipped, requests still work.

### Legal
Personal use with public content only. The author name and source link are
always shown; respect copyright. Use `CONTACT_URL` for DMCA/takedown requests.
This project is independent and not affiliated with Instagram or Meta.

**Security note:** never paste tokens into chats or screenshots. If you did,
revoke/roll them immediately (Cloudflare → My Profile → API Tokens) and update
the GitHub secret / `wrangler secret put`.

MIT licensed.

---

## فارسی

### این چیست
یک **Cloudflare Worker** مستقل و بدون فریم‌ورک که لینک عمومی اینستاگرام را به
پیش‌نمایش کامل و دانلود تمیز و استریمی تبدیل می‌کند. رابط وب دوزبانه (fa/en)،
API نسخه‌دار JSON، محدودیت نرخ، کش کوتاه متادیتا و آمار ناشناس دارد.

### قابلیت‌ها
- **پیش‌نمایش کامل**: تصویر بندانگشتی، صاحب محتوا، کپشن، نوع
  (ویدیو/عکس/آلبوم)، تعداد آیتم، مدت، ابعاد و حجم تقریبی.
- **انتخاب کیفیت صادقانه**: فقط کیفیت‌هایی که upstream واقعاً برمی‌گرداند.
  بهترین گزینه پیش‌فرض است؛ اگر فقط یک نسخه باشد صادقانه اعلام می‌شود.
- **آلبوم**: نمایش همهٔ آیتم‌ها، دانلود تکی یا ساخت ZIP **در مرورگر** با
  نویسندهٔ استریمی (حافظهٔ ثابت، ترتیب پایدار، گزارش خطای ناقص).
- **پروکسی امن استریمی**: `ETag` قوی، پشتیبانی کامل از **Range**،
  `Content-Disposition: attachment` به‌صورت پیش‌فرض و `inline` برای پلیر
  (`?inline=1`). بدنه استریم می‌شود و هرگز کامل در حافظه نمی‌نشیند.
- **رابط دوزبانه** (فارسی/انگلیسی، RTL/LTR خودکار)، تم روشن/تیره، ریسپانسیو،
  تاریخچهٔ محلی، کپی/اشتراک و لینک گزارش محتوا.
- **امنیت از پایه**:
  - CSP بدون `unsafe-inline` با nonce جداگانه برای `<script>` و `<style>`؛
  - پاسخ‌های HTML و API که nonce یا هدر محدودیت نرخ دارند `private, no-store`
    هستند؛
  - پروکسی فقط HTTPS و allowlist، رد IPv4/IPv6 خصوصی/loopback/link-local،
    اعتبارسنجی هر hop ریدایرکت، سقف حجم واقعی و timeout بیکاری/کلی؛
  - IP خام هرگز ذخیره نمی‌شود؛ فقط کلید HMAC-SHA256 در KV می‌ماند.
- **API نسخه‌دار** با پاسخ JSON یکدست، CORS، ETag/304، کدهای خطای مشخص و
  سند OpenAPI.

### معماری
```
request ──► router (src/worker.js)
             ├─ /                رابط تک‌فایلی (src/lib/ui.js)
             ├─ /api/v1/resolve  متادیتا + کیفیت‌ها (کش KV)
             ├─ /api/v1/download پروکسی استریمی (Range، سقف حجم، inline)
             ├─ /api/v1/thumbnail پروکسی امن تصویر
             ├─ /api/v1/admin/*  مدیریت API Key با ADMIN_TOKEN
             ├─ /health          وضعیت سرویس/providerها (deep=1)
             ├─ /openapi.json    سند OpenAPI 3
             └─ /robots.txt

providerها (src/lib/providers.js): UPSTREAM_URLS به‌ترتیب اولویت، timeout
هر فراخوانی، retry با jitter، circuit breaker بر اساس URL کامل (یک probe در
half-open) و نقشهٔ سلامت.
normalize (src/lib/normalize.js): یک شکل یکدست برای همهٔ upstreamها.
security (src/lib/security.js): محافظ SSRF + پروکسی استریمی.
storage (src/lib/storage.js): rate limit/کش در KV، هش HMAC آدرس IP، آمار D1
و API Key اختیاری. یک Cron trigger آمار قدیمی را پاک می‌کند.
```

### استقرار
**یک‌کلیکی:** روی دکمهٔ بالا بزنید، به Cloudflare اجازه دهید و منتشر کنید. KV و
D1 خودکار ساخته می‌شوند (Wrangler >= 3.60). اولین درخواست schema را به‌صورت
idempotent اعمال می‌کند؛ همان دستورها در `migrations/0001_init.sql` هستند.

**دستی:** راهنمای کامل در **[SETUP-MANUAL.md](./SETUP-MANUAL.md)** (Dashboard،
Wrangler، اتصال GitHub به Cloudflare و GitHub Actions).

**بستهٔ تک‌فایلی** (برای *Quick edit* در Dashboard یا pipeline دلخواه):
```bash
npm install
npm run bundle        # -> dist/worker.js (ESM، در git نادیده گرفته می‌شود)
npm run bundle:min    # نسخهٔ minified
```

### متغیرهای محیطی
| متغیر | پیش‌فرض | توضیح |
|---|---|---|
| `UPSTREAM_URLS` | `https://catplus.ir/api/insta` | providerها با کاما و ترتیب اولویت |
| `RATE_LIMIT_PER_MINUTE` | `60` | درخواست resolve در دقیقه بر bucket |
| `RATE_LIMIT_DOWNLOAD_PER_MINUTE` | `20` | درخواست دانلود در دقیقه |
| `RATE_LIMIT_THUMBNAIL_PER_MINUTE` | `60` | درخواست تصویر بندانگشتی در دقیقه |
| `RATE_LIMIT_ADMIN_PER_MINUTE` | `10` | درخواست ادمین در دقیقه |
| `RATE_LIMIT_HEALTH_PER_MINUTE` | `10` | درخواست health عمیق در دقیقه |
| `MAX_DOWNLOAD_MB` | `80` | سقف سخت دانلود پروکسی |
| `CDN_ALLOWLIST` | `*.cdninstagram.com,*.fbcdn.net,...` | میزبان‌های مجاز پروکسی |
| `CONTACT_URL` | Issues مخزن | لینک تماس/حذف |
| `CACHE_TTL_SECONDS` | `120` | TTL کش متادیتا (حداقل ۶۰، حداکثر ۹۰۰) |
| `UPSTREAM_TIMEOUT_MS` | `12000` | timeout هر provider (هدر + بدنه) |
| `DEFAULT_LANG` | `fa` | زبان پیش‌فرض رابط/API |

Secretها (هرگز commit نشوند):
- `ADMIN_TOKEN` — محافظ `/api/v1/admin/*`.
- `UPSTREAM_TOKEN` — توکن اختیاری؛ فقط به `UPSTREAM_TOKEN_HOST` (یا تنها
  provider پیکربندی‌شده) فرستاده می‌شود.
- `IP_HASH_SECRET` — حداقل ۱۶ کاراکتر؛ کلید HMAC آدرس IP. اگر تنظیم نشود یک
  مقدار پیش‌فرض عمومی استفاده می‌شود، پس در production آن را تنظیم کنید.

### مرجع API
موفق: `{ ok:true, status:200, lang, request_id, data }`.
خطا: `{ ok:false, status, lang, request_id, error:{ code, message } }`.
`request_id` در هدر `X-Request-Id` هم برمی‌گردد.

| متد | مسیر | توضیح |
|---|---|---|
| GET | `/api/v1/resolve?url=&lang=` | متادیتا + لیست کیفیت‌ها |
| GET | `/api/v1/download?url=&quality=&index=&inline=&lang=` | دانلود/پخش استریمی |
| GET | `/api/v1/thumbnail?url=&lang=` | پروکسی تصویر بندانگشتی |
| GET | `/health?deep=1` | وضعیت سرویس/providerها/محدودیت‌ها |
| GET | `/openapi.json` | سند OpenAPI 3 |
| GET | `/api/v1/admin/keys` | فهرست کلیدها (فقط label) |
| POST | `/api/v1/admin/keys` | ساخت/به‌روزرسانی کلید (`{key,label?,limit_per_minute?}`) |
| DELETE | `/api/v1/admin/keys` | غیرفعال‌کردن کلید (`{key}`) |

درخواست ادمین با `Authorization: Bearer <ADMIN_TOKEN>`.
فقط هش هر API Key ذخیره می‌شود و کلید غیرفعال هرگز دوباره فعال نمی‌شود.

کدهای خطا: `E_INVALID_URL`, `E_INVALID_REQUEST`, `E_PRIVATE_OR_NOT_FOUND`,
`E_UPSTREAM_FAILED`, `E_UPSTREAM_UNAVAILABLE`, `E_RATE_LIMIT`, `E_TOO_LARGE`,
`E_NOT_ALLOWED_HOST`, `E_NOT_ALLOWED_TYPE`, `E_BAD_QUALITY`, `E_BAD_INDEX`,
`E_NO_VARIANTS`, `E_METHOD`, `E_NOT_FOUND`, `E_UNAUTHORIZED`, `E_FORBIDDEN`,
`E_KEY_DISABLED`, `E_KEY_EXISTS`, `E_INTERNAL`. همهٔ پاسخ‌ها `X-RateLimit-*`
دارند و پاسخ‌های محدود `Retry-After` هم دارند.

### توسعه
```bash
npm install --no-audit --no-fund
npm run check        # بررسی سینتکس + ۱۱۱ تست mock (بدون شبکهٔ واقعی)
npm test             # فقط تست‌ها
npm run bundle       # dist/worker.js تک‌فایلی
npm run dev          # wrangler dev
npm run deploy       # wrangler deploy
npm run secret-scan  # جلوگیری از push شدن توکن
```

تست‌ها `fetch` را mock می‌کنند و پارس URL، نرمال‌سازی، fallback/breaker،
قواعد SSRF و redirect، سقف استریم، KV/D1، هم‌ترازی migration با schema،
کامل‌بودن i18n، HTML/CSP و مسیرهای HTTP را پوشش می‌دهند.

### عیب‌یابی
- **۴۲۹** — منتظر `Retry-After` بمانید یا برای سقف بالاتر API Key بسازید.
- **E_UPSTREAM_FAILED** — همهٔ providerها خطا دادند؛ `UPSTREAM_URLS` و
  `/health?deep=1` را بررسی کنید.
- **E_NOT_ALLOWED_HOST** — CDN در allowlist نیست؛ `CDN_ALLOWLIST` را گسترش دهید.
- **صفحهٔ خالی/عجیب** — با `/?debug=1` پنل خطا را ببینید؛ صفحه سمت سرور رندر
  می‌شود و بدون JS هم دیده می‌شود.
- **نبود D1/KV** — سرویس degrade می‌کند: کش/محدودیت نرخ یا آمار رد می‌شود ولی
  درخواست‌ها کار می‌کنند.

### ملاحظات حقوقی
فقط استفادهٔ شخصی با محتوای عمومی. نام صاحب محتوا و لینک اصلی همیشه نمایش داده
می‌شود؛ حق نشر را رعایت کنید. برای DMCA/Takedown از `CONTACT_URL` استفاده کنید.
این پروژه مستقل است و به اینستاگرام/متا وابسته نیست.

**هشدار امنیتی:** هرگز توکن را در چت یا اسکرین‌شات نگذارید. اگر گذاشتید فوراً
Revoke/Roll کنید (Cloudflare → My Profile → API Tokens) و GitHub Secret /
`wrangler secret put` را به‌روز کنید.

لایسنس MIT.
