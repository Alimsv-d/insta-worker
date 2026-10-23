# insta-worker

> Bilingual Instagram public-content resolver, media proxy and web UI on a
> single **Cloudflare Worker**. Public content only: no login, no cookies, no
> private media, no database and no mandatory secret.

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Alimsv-d/insta-worker)

فارسی در پایین · English below

---

## English

### What it is
A Cloudflare Worker with a server-rendered bilingual web page at `/` and a
versioned JSON API under `/api/v1`. It resolves a public Instagram post, reel or
IGTV link into normalised metadata and streams the media through a hardened
proxy. The page defaults to Persian (RTL) with an English (LTR) switch; it loads
no external font or script. There is no database and no mandatory secret: the
Deploy button works without filling any field.

### API surface
| Method | Path | Description |
|---|---|---|
| GET | `/` | Web UI for browsers (`Accept: text/html`); JSON summary otherwise |
| GET | `/api/v1/resolve?url=&lang=` | Metadata, items and variants |
| GET | `/api/v1/download?url=&quality=&index=&inline=&lang=` | Streamed media |
| GET | `/api/v1/thumbnail?url=&lang=` | Image-only proxy for thumbnails |
| GET | `/health?deep=1` | Service, storage, limits and provider state |
| GET | `/openapi.json` | OpenAPI 3 document |
| OPTIONS | any | CORS preflight (`204`) |

`HEAD` is supported on every `GET` route. Content negotiation on `/` is based on
`Accept`: `text/html` gets the web page, `application/json` (or `*/*`, curl and
API clients) gets the JSON summary. `?lang=en` switches the page to English;
`?lang=fa` switches it back. API error text stays English by default; `?lang=fa`
localises API errors.

### Features
- **Bilingual web UI**: server-rendered Persian (default, RTL) and English (LTR),
  responsive layout, light/dark theme, result preview, quality picker, album
  downloads and client-side ZIP. Static content is visible without JavaScript;
  reveal animation only arms after JS + IntersectionObserver.
- **Strict page security**: nonce-based CSP with no `unsafe-inline`, no inline
  handlers or style attributes, no external font/CDN, `Cache-Control:
  private, no-store` and `X-Frame-Options: DENY` for HTML. `?debug=1` adds an
  opt-in error panel without exposing a global bridge by default.
- **Stable JSON envelope** for success and errors, a `request_id` in the body
  and in `X-Request-Id`, and OpenAPI at `/openapi.json`.
- **Honest variants**: only the qualities the upstream really returns. `best`
  is the first variant; the API never invents resolutions or bitrates.
- **Hardened streaming proxy**: HTTPS-only, CDN allowlist, manual redirect
  validation (max 3 hops), private/loopback/link-local IPv4 and IPv6 blocked,
  real byte cap, idle + total timeouts, Range pass-through and
  `X-Content-Type-Options: nosniff`.
- **Media-only responses**: HTML/SVG/XML are rejected; thumbnails must resolve
  to `image/*`.
- **KV-backed rate limiting and metadata cache**, keyed by an HMAC of the client
  IP or API key. Raw IPs and raw keys are never stored.
- **Optional static API keys** (`API_KEYS`) and **optional upstream token**;
  nothing is required to deploy.
- **CORS** via `ALLOWED_ORIGINS` (default `*`).
- **Private caching semantics**: resolve and error responses are
  `private, no-store`; resolve carries a strong `ETag` and answers
  `If-None-Match` with `304`. Thumbnails are `private, max-age=300` and never
  `immutable`.

### Architecture
```
request ──► router (src/worker.js)
             ├─ /                  web UI (Accept: text/html) or JSON summary
             ├─ /api/v1/resolve    metadata + variants (KV cache + ETag)
             ├─ /api/v1/download   streamed media (Range, size cap, inline)
             ├─ /api/v1/thumbnail  image-only proxy
             ├─ /health            health + optional deep provider probe
             └─ /openapi.json      OpenAPI 3 document

providers (src/lib/providers.js): ordered UPSTREAM_URLS, whole-call timeout,
retry with jitter, per-URL circuit breaker (one half-open probe).
normalize (src/lib/normalize.js): one shape for every upstream.
security (src/lib/security.js): SSRF guards + streaming proxy.
storage  (src/lib/storage.js): KV rate limit/cache, HMAC buckets, ETag.
http     (src/lib/http.js): envelope, CORS, cache headers, status mapping.
ui       (src/lib/ui.js): bilingual server-rendered page, CSS and client JS.
i18n     (src/lib/i18n.js): API messages + UI/docs catalogues (en/fa).
```

### Deploy

**One-click:** click the button above and deploy. No field is mandatory and no
D1/database is created. Wrangler >= 3.60 auto-provisions the KV namespace; with
older Wrangler, create it manually (see [SETUP-MANUAL.md](./SETUP-MANUAL.md)).

**Manual:** see **[SETUP-MANUAL.md](./SETUP-MANUAL.md)** for the dashboard,
Wrangler, GitHub → Cloudflare integration and the optional GitHub Actions
workflow.

**Single-file bundle** (Dashboard *Quick edit* or a custom pipeline):
```bash
npm install --no-audit --no-fund
npm run bundle        # -> dist/worker.js (ESM, git-ignored)
npm run bundle:min    # minified
```

### Configuration
Non-sensitive variables (`wrangler.toml` → `[vars]`, or Dashboard → Settings →
Variables). Every value has a safe default.

| Variable | Default | Meaning |
|---|---|---|
| `UPSTREAM_URLS` | `https://catplus.ir/api/insta` | Comma-separated ordered providers (https only) |
| `RATE_LIMIT_PER_MINUTE` | `60` | Resolve requests / minute / bucket |
| `RATE_LIMIT_DOWNLOAD_PER_MINUTE` | `20` | Download requests / minute |
| `RATE_LIMIT_THUMBNAIL_PER_MINUTE` | `60` | Thumbnail requests / minute |
| `RATE_LIMIT_HEALTH_PER_MINUTE` | `10` | Deep health requests / minute |
| `MAX_DOWNLOAD_MB` | `80` | Hard cap for a proxied download |
| `CDN_ALLOWLIST` | `*.cdninstagram.com,*.fbcdn.net` | Allowed proxy hosts |
| `ALLOWED_ORIGINS` | `*` | `*` or a comma-separated origin list |
| `CACHE_TTL_SECONDS` | `120` | Metadata cache TTL (clamped to 60..900) |
| `UPSTREAM_TIMEOUT_MS` | `12000` | Per-provider timeout (headers + body) |

Optional secrets (Settings → Variables and Secrets → Secret, or
`wrangler secret put <NAME>`):

| Secret | Meaning |
|---|---|
| `API_KEYS` | Comma-separated keys. When set, every `/api/v1/*` request needs `Authorization: Bearer <key>` or `x-api-key: <key>`. |
| `UPSTREAM_TOKEN` | Bearer token forwarded only to `UPSTREAM_TOKEN_HOST`, or to the single configured provider when no host is set. |
| `IP_HASH_SECRET` | Random string (>= 16 chars) used to key IP buckets. A public default is used when unset; set it in production to make hashes non-comparable. |

`API_KEYS` is static: keys are configured as a secret, not created through an
admin endpoint. When it is unset the API is public and rate limited per IP.

### API reference
Success:
```json
{ "ok": true, "status": 200, "lang": "en", "request_id": "...", "data": {} }
```
Error:
```json
{ "ok": false, "status": 400, "lang": "en", "request_id": "...",
  "error": { "code": "E_INVALID_URL", "message": "..." } }
```

Resolve `data` shape:
```json
{
  "type": "video | image | album",
  "author": { "username": "...", "full_name": "...", "avatar": "https://..." },
  "caption": "...",
  "thumbnail": "https://...",
  "duration": 12.5,
  "items": [
    { "type": "video", "index": 0, "thumbnail": "https://...",
      "variants": [
        { "url": "https://...", "quality": "1080x1920", "width": 1080,
          "height": 1920, "bitrate": 2000000, "size": 123456,
          "mime": "video/mp4", "filename": "author_shortcode.mp4",
          "has_audio": null }
      ] }
  ],
  "source_url": "https://www.instagram.com/reel/.../",
  "shortcode": "...",
  "provider": "catplus.ir",
  "variants_count": 1
}
```
`has_audio` is `null` when the upstream does not say; it is never guessed. The
filename extension always comes from the resolved MIME type.

| Query | Applies to | Notes |
|---|---|---|
| `url` | resolve/download/thumbnail | Instagram URL or a direct CDN URL for thumbnail |
| `index` | download | Non-negative integer, default `0` |
| `quality` | download | Exact label from `variants[].quality`; default `best` (first) |
| `inline` | download | `1` serves `Content-Disposition: inline` |
| `lang` | all | `en` (default) or `fa` |
| `deep` | health | `1` probes every provider (rate limited) |

Status mapping: `E_INVALID_URL`/`E_INVALID_REQUEST`/`E_BAD_QUALITY`/`E_BAD_INDEX`
/`E_NOT_ALLOWED_HOST` → 400, `E_UNAUTHORIZED` → 401, `E_NOT_FOUND`/
`E_NO_VARIANTS`/`E_PRIVATE_OR_NOT_FOUND` → 404, `E_METHOD` → 405, `E_TOO_LARGE` →
413, `E_NOT_ALLOWED_TYPE` → 415, `E_RATE_LIMIT` → 429, `E_UPSTREAM_FAILED`/
`E_UPSTREAM_UNAVAILABLE` → 502, `E_UPSTREAM_TIMEOUT` → 504, `E_INTERNAL` → 500.

Rate-limited responses include `Retry-After` and `X-RateLimit-*`. The limiter is
a KV approximation (eventually consistent), not an exact global counter.

**Samples**

```bash
# Resolve
curl "https://<worker>/api/v1/resolve?url=https%3A%2F%2Fwww.instagram.com%2Freel%2FABC123%2F"

# Download the best variant with a stable filename
curl -OJ "https://<worker>/api/v1/download?url=https%3A%2F%2Fwww.instagram.com%2Freel%2FABC123%2F"

# With API_KEYS configured
curl -H "Authorization: Bearer $API_KEY" \
  "https://<worker>/api/v1/resolve?url=https%3A%2F%2Fwww.instagram.com%2Freel%2FABC123%2F"
```

```python
import requests

r = requests.get(
    "https://<worker>/api/v1/resolve",
    params={"url": "https://www.instagram.com/reel/ABC123/"},
    headers={"Authorization": "Bearer <key>"},  # only when API_KEYS is set
    timeout=30,
)
r.raise_for_status()
print(r.json()["data"]["items"])
```

```javascript
const u = new URL("https://<worker>/api/v1/resolve");
u.searchParams.set("url", "https://www.instagram.com/reel/ABC123/");
const res = await fetch(u, { headers: { authorization: `Bearer ${key}` } }); // key optional
console.log((await res.json()).data);
```

### Development
```bash
npm install --no-audit --no-fund
npm run check        # syntax checks + all mocked tests (no real network)
npm test             # tests only
npm run bundle       # single-file dist/worker.js
npm run dev          # wrangler dev
npm run deploy       # wrangler deploy
npm run secret-scan  # block accidental tokens before pushing
```

The tests mock `fetch` and cover URL parsing, normalisation, provider
timeout/fallback/breaker, SSRF and redirect rules, streaming caps and MIME
rules, KV rate limits/cache/ETag, CORS, authentication, the HTTP routes, and the
rendered page (sections, nonce/CSP, content negotiation, i18n key parity).

### Troubleshooting
- **401** — `API_KEYS` is set and the request has no valid `Bearer`/`x-api-key`.
- **429** — wait for `Retry-After`; limits are per IP or API key.
- **E_UPSTREAM_FAILED** — every provider failed or returned an unusable payload;
  check `UPSTREAM_URLS` and `/health?deep=1`.
- **E_UPSTREAM_TIMEOUT** — provider timeout; raise `UPSTREAM_TIMEOUT_MS` or fix
  the provider.
- **E_NOT_ALLOWED_HOST** — the media host is not in `CDN_ALLOWLIST`.
- **KV missing** — the worker still serves requests; cache and rate limiting
  degrade gracefully (`/health` shows `storage.kv: false`).

### Legal
Personal use with public content only. Always credit the author and link to the
original post; respect copyright and Instagram's terms. For takedown requests,
open an issue in this repository. This project is independent and not
affiliated with Instagram or Meta.

**Security note:** never paste tokens into chats or screenshots. If a Cloudflare
API token leaks, roll/delete it immediately (My Profile → API Tokens) and update
the GitHub secret or `wrangler secret put`.

MIT licensed.

---

## فارسی

### این چیست
یک **Cloudflare Worker** با یک صفحهٔ وب دوزبانهٔ سمت‌سرور روی `/` و API
نسخه‌دار JSON زیر `/api/v1`. لینک عمومی پست، ریل یا IGTV اینستاگرام را به
متادیتای یکدست تبدیل می‌کند و رسانه را از طریق یک پروکسی امن استریم می‌کند.
صفحه پیش‌فرض فارسی (RTL) است و با یک کلیک به انگلیسی (LTR) تغییر می‌کند؛ هیچ
فونت یا اسکریپت خارجی بارگذاری نمی‌شود. دیتابیس و Secret اجباری ندارد؛ دکمهٔ
Deploy بدون پر کردن هیچ فیلدی کار می‌کند.

### مسیرهای API
| متد | مسیر | توضیح |
|---|---|---|
| GET | `/` | رابط وب برای مرورگر (`Accept: text/html`)؛ در غیر این صورت خلاصهٔ JSON |
| GET | `/api/v1/resolve?url=&lang=` | متادیتا، آیتم‌ها و کیفیت‌ها |
| GET | `/api/v1/download?url=&quality=&index=&inline=&lang=` | استریم رسانه |
| GET | `/api/v1/thumbnail?url=&lang=` | پروکسی فقط-تصویر برای تامنیل |
| GET | `/health?deep=1` | وضعیت سرویس، ذخیره‌سازی، محدودیت‌ها و providerها |
| GET | `/openapi.json` | سند OpenAPI 3 |
| OPTIONS | همه | preflight کورس (`204`) |

`HEAD` روی همهٔ مسیرهای `GET` پشتیبانی می‌شود. انتخاب خروجی `/` بر اساس
`Accept` است: `text/html` صفحهٔ وب، و `application/json` (یا `*/*` و کلاینت‌های
API) خلاصهٔ JSON. `?lang=en` صفحه را انگلیسی و `?lang=fa` آن را فارسی می‌کند.
متن خطاهای API پیش‌فرض انگلیسی است و `?lang=fa` آن‌ها را فارسی می‌کند.

### قابلیت‌ها
- **رابط وب دوزبانه**: رندر سمت‌سرور فارسی (پیش‌فرض، RTL) و انگلیسی (LTR)،
  واکنش‌گرا، تم روشن/تاریک، پیش‌نمایش نتیجه، انتخاب کیفیت، دانلود آلبوم و ZIP
  سمت کلاینت. محتوای ثابت بدون جاوااسکریپت دیده می‌شود؛ انیمیشن ظاهرشدن فقط
  بعد از اجرای JS و وجود IntersectionObserver فعال می‌شود.
- **امنیت سخت‌گیرانهٔ صفحه**: CSP با nonce و بدون `unsafe-inline`، بدون
  هندلر inline یا ویژگی style، بدون فونت/CDN خارجی، `Cache-Control:
  private, no-store` و `X-Frame-Options: DENY` برای HTML. `?debug=1` پنل خطای
  اختیاری را فعال می‌کند و در حالت عادی هیچ bridge جهانی ساخته نمی‌شود.
- **پاسخ JSON یکدست** برای موفقیت و خطا، `request_id` در بدنه و هدر
  `X-Request-Id`، و OpenAPI روی `/openapi.json`.
- **کیفیت‌های صادقانه**: فقط کیفیت‌هایی که upstream واقعاً برمی‌گرداند؛ `best`
  یعنی اولین variant و API هیچ رزولوشن/بیت‌ریتی از خودش نمی‌سازد.
- **پروکسی استریمی سخت‌شده**: فقط HTTPS، allowlist سی‌دی‌ان، اعتبارسنجی دستی
  هر hop ریدایرکت (حداکثر ۳)، رد IPv4/IPv6 خصوصی/loopback/link-local، سقف حجم
  واقعی، timeout بیکاری و کلی، پشتیبانی Range و `X-Content-Type-Options: nosniff`.
- **فقط رسانه**: HTML/SVG/XML رد می‌شود و تامنیل باید `image/*` باشد.
- **محدودیت نرخ و کش متادیتا روی KV** با کلید HMAC از IP یا API key؛ IP خام و
  کلید خام هرگز ذخیره نمی‌شوند.
- **API keyهای ثابت اختیاری** (`API_KEYS`) و **توکن اختیاری upstream**؛ برای
  استقرار هیچ‌کدام لازم نیست.
- **کورس** با `ALLOWED_ORIGINS` (پیش‌فرض `*`).
- **کش خصوصی**: پاسخ‌های resolve و خطاها `private, no-store` هستند؛ resolve
  یک `ETag` قوی دارد و به `If-None-Match` با `304` پاسخ می‌دهد. تامنیل
  `private, max-age=300` است و هرگز `immutable` نمی‌شود.

### معماری
```
request ──► router (src/worker.js)
             ├─ /                  رابط وب (Accept: text/html) یا خلاصهٔ JSON
             ├─ /api/v1/resolve    متادیتا + کیفیت‌ها (کش KV + ETag)
             ├─ /api/v1/download   استریم رسانه (Range، سقف حجم، inline)
             ├─ /api/v1/thumbnail  پروکسی فقط-تصویر
             ├─ /health            وضعیت + بررسی عمیق اختیاری
             └─ /openapi.json      سند OpenAPI 3

providers (src/lib/providers.js): UPSTREAM_URLS به‌ترتیب، timeout کل فراخوانی،
retry با jitter، circuit breaker بر اساس URL کامل (یک probe در half-open).
normalize (src/lib/normalize.js): یک شکل یکدست برای همهٔ upstreamها.
security (src/lib/security.js): محافظ SSRF + پروکسی استریمی.
storage  (src/lib/storage.js): rate limit/کش KV، bucket HMAC، ETag.
http     (src/lib/http.js): پاکت پاسخ، کورس، هدرهای کش، نگاشت وضعیت.
ui       (src/lib/ui.js): صفحهٔ دوزبانهٔ سمت‌سرور، CSS و JS کلاینت.
i18n     (src/lib/i18n.js): پیام‌های API + کاتالوگ رابط و مستندات (en/fa).
```

### استقرار
**یک‌کلیکی:** روی دکمهٔ بالا بزنید و Deploy کنید. هیچ فیلدی اجباری نیست و هیچ
D1/دیتابیسی ساخته نمی‌شود. Wrangler >= 3.60 فضای KV را خودکار می‌سازد؛ با نسخهٔ
قدیمی‌تر آن را دستی بسازید (راهنما در [SETUP-MANUAL.md](./SETUP-MANUAL.md)).

**دستی:** راهنمای کامل در **[SETUP-MANUAL.md](./SETUP-MANUAL.md)** برای
Dashboard، Wrangler، اتصال GitHub به Cloudflare و workflow اختیاری GitHub
Actions.

**بستهٔ تک‌فایلی** (برای *Quick edit* در Dashboard یا pipeline دلخواه):
```bash
npm install --no-audit --no-fund
npm run bundle        # -> dist/worker.js (ESM، در git نادیده گرفته می‌شود)
npm run bundle:min    # نسخهٔ minified
```

### پیکربندی
متغیرهای غیرحساس (`wrangler.toml` → `[vars]` یا Dashboard → Settings →
Variables). همهٔ مقادیر پیش‌فرض امن دارند.

| متغیر | پیش‌فرض | توضیح |
|---|---|---|
| `UPSTREAM_URLS` | `https://catplus.ir/api/insta` | providerها با کاما و ترتیب اولویت (فقط https) |
| `RATE_LIMIT_PER_MINUTE` | `60` | درخواست resolve در دقیقه بر bucket |
| `RATE_LIMIT_DOWNLOAD_PER_MINUTE` | `20` | درخواست دانلود در دقیقه |
| `RATE_LIMIT_THUMBNAIL_PER_MINUTE` | `60` | درخواست تامنیل در دقیقه |
| `RATE_LIMIT_HEALTH_PER_MINUTE` | `10` | درخواست health عمیق در دقیقه |
| `MAX_DOWNLOAD_MB` | `80` | سقف سخت دانلود پروکسی |
| `CDN_ALLOWLIST` | `*.cdninstagram.com,*.fbcdn.net` | میزبان‌های مجاز پروکسی |
| `ALLOWED_ORIGINS` | `*` | `*` یا فهرست Origin با کاما |
| `CACHE_TTL_SECONDS` | `120` | TTL کش متادیتا (محدود به ۶۰ تا ۹۰۰) |
| `UPSTREAM_TIMEOUT_MS` | `12000` | timeout هر provider (هدر + بدنه) |

Secretهای اختیاری (Settings → Variables and Secrets → Secret یا
`wrangler secret put <NAME>`):

| Secret | توضیح |
|---|---|
| `API_KEYS` | کلیدها با کاما. اگر تنظیم شود، همهٔ `/api/v1/*` به `Authorization: Bearer <key>` یا `x-api-key: <key>` نیاز دارند. |
| `UPSTREAM_TOKEN` | توکن Bearer که فقط به `UPSTREAM_TOKEN_HOST` (یا تنها provider پیکربندی‌شده) فرستاده می‌شود. |
| `IP_HASH_SECRET` | رشتهٔ تصادفی (حداقل ۱۶ کاراکتر) برای کلید HMAC آدرس IP. اگر تنظیم نشود یک مقدار پیش‌فرض عمومی استفاده می‌شود. |

`API_KEYS` ثابت است: کلیدها به‌صورت Secret تنظیم می‌شوند و endpoint ادمین برای
ساخت/حذف کلید وجود ندارد. وقتی تنظیم نشده باشد API عمومی است و بر اساس IP
محدود می‌شود.

### مرجع API
موفق:
```json
{ "ok": true, "status": 200, "lang": "en", "request_id": "...", "data": {} }
```
خطا:
```json
{ "ok": false, "status": 400, "lang": "en", "request_id": "...",
  "error": { "code": "E_INVALID_URL", "message": "..." } }
```

شکل `data` در resolve:
```json
{
  "type": "video | image | album",
  "author": { "username": "...", "full_name": "...", "avatar": "https://..." },
  "caption": "...",
  "thumbnail": "https://...",
  "duration": 12.5,
  "items": [
    { "type": "video", "index": 0, "thumbnail": "https://...",
      "variants": [
        { "url": "https://...", "quality": "1080x1920", "width": 1080,
          "height": 1920, "bitrate": 2000000, "size": 123456,
          "mime": "video/mp4", "filename": "author_shortcode.mp4",
          "has_audio": null }
      ] }
  ],
  "source_url": "https://www.instagram.com/reel/.../",
  "shortcode": "...",
  "provider": "catplus.ir",
  "variants_count": 1
}
```
`has_audio` اگر upstream نگوید `null` است و هرگز حدس زده نمی‌شود. پسوند فایل
همیشه از MIME نهایی گرفته می‌شود.

| پارامتر | مربوط به | توضیح |
|---|---|---|
| `url` | resolve/download/thumbnail | لینک اینستاگرام یا URL مستقیم CDN برای تامنیل |
| `index` | download | عدد صحیح نامنفی، پیش‌فرض `0` |
| `quality` | download | برچسب دقیق از `variants[].quality`؛ پیش‌فرض `best` (اولین) |
| `inline` | download | `1` یعنی `Content-Disposition: inline` |
| `lang` | همه | `en` (پیش‌فرض) یا `fa` |
| `deep` | health | `1` همهٔ providerها را بررسی می‌کند (محدودیت نرخ دارد) |

نگاشت وضعیت: `E_INVALID_URL`/`E_INVALID_REQUEST`/`E_BAD_QUALITY`/`E_BAD_INDEX`/
`E_NOT_ALLOWED_HOST` → ۴۰۰، `E_UNAUTHORIZED` → ۴۰۱، `E_NOT_FOUND`/
`E_NO_VARIANTS`/`E_PRIVATE_OR_NOT_FOUND` → ۴۰۴، `E_METHOD` → ۴۰۵، `E_TOO_LARGE`
→ ۴۱۳، `E_NOT_ALLOWED_TYPE` → ۴۱۵، `E_RATE_LIMIT` → ۴۲۹، `E_UPSTREAM_FAILED`/
`E_UPSTREAM_UNAVAILABLE` → ۵۰۲، `E_UPSTREAM_TIMEOUT` → ۵۰۴، `E_INTERNAL` → ۵۰۰.

پاسخ‌های محدود `Retry-After` و `X-RateLimit-*` دارند. شمارش محدودیت تقریبی و
مبتنی بر KV است (eventually consistent) و شمارندهٔ دقیق جهانی نیست.

**نمونه‌ها**

```bash
# resolve
curl "https://<worker>/api/v1/resolve?url=https%3A%2F%2Fwww.instagram.com%2Freel%2FABC123%2F"

# دانلود بهترین کیفیت با نام فایل پایدار
curl -OJ "https://<worker>/api/v1/download?url=https%3A%2F%2Fwww.instagram.com%2Freel%2FABC123%2F"

# وقتی API_KEYS تنظیم شده است
curl -H "Authorization: Bearer $API_KEY" \
  "https://<worker>/api/v1/resolve?url=https%3A%2F%2Fwww.instagram.com%2Freel%2FABC123%2F"
```

```python
import requests

r = requests.get(
    "https://<worker>/api/v1/resolve",
    params={"url": "https://www.instagram.com/reel/ABC123/"},
    headers={"Authorization": "Bearer <key>"},  # فقط وقتی API_KEYS تنظیم شده
    timeout=30,
)
r.raise_for_status()
print(r.json()["data"]["items"])
```

```javascript
const u = new URL("https://<worker>/api/v1/resolve");
u.searchParams.set("url", "https://www.instagram.com/reel/ABC123/");
const res = await fetch(u, { headers: { authorization: `Bearer ${key}` } }); // key اختیاری
console.log((await res.json()).data);
```

### توسعه
```bash
npm install --no-audit --no-fund
npm run check        # بررسی سینتکس + ۹۷ تست mock (بدون شبکهٔ واقعی)
npm test             # فقط تست‌ها
npm run bundle       # dist/worker.js تک‌فایلی
npm run dev          # wrangler dev
npm run deploy       # wrangler deploy
npm run secret-scan  # جلوگیری از push شدن توکن
```

تست‌ها `fetch` را mock می‌کنند و پارس URL، نرمال‌سازی، timeout/fallback/breaker،
قواعد SSRF و redirect، سقف استریم و قواعد MIME، rate limit/کش/ETag در KV،
کورس، احراز هویت و مسیرهای HTTP را پوشش می‌دهند.

### عیب‌یابی
- **۴۰۱** — `API_KEYS` تنظیم شده و درخواست `Bearer`/`x-api-key` معتبر ندارد.
- **۴۲۹** — منتظر `Retry-After` بمانید؛ محدودیت بر اساس IP یا API key است.
- **E_UPSTREAM_FAILED** — همهٔ providerها خطا دادند یا پاسخ بی‌فایده برگرداندند؛
  `UPSTREAM_URLS` و `/health?deep=1` را بررسی کنید.
- **E_UPSTREAM_TIMEOUT** — timeout منبع؛ `UPSTREAM_TIMEOUT_MS` یا provider را
  بررسی کنید.
- **E_NOT_ALLOWED_HOST** — میزبان رسانه در `CDN_ALLOWLIST` نیست.
- **نبود KV** — سرویس همچنان کار می‌کند؛ کش و محدودیت نرخ degrade می‌شوند
  (`/health` مقدار `storage.kv: false` را نشان می‌دهد).

### ملاحظات حقوقی
فقط استفادهٔ شخصی با محتوای عمومی. همیشه نام صاحب محتوا و لینک اصلی را ذکر
کنید؛ حق نشر و قوانین اینستاگرام را رعایت کنید. برای درخواست حذف محتوا یک Issue
در همین مخزن باز کنید. این پروژه مستقل است و به اینستاگرام/متا وابسته نیست.

**هشدار امنیتی:** هرگز توکن را در چت یا اسکرین‌شات نگذارید. اگر توکن API
Cloudflare لو رفت، فوراً آن را Roll/Delete کنید (My Profile → API Tokens) و
GitHub Secret یا `wrangler secret put` را به‌روز کنید.

لایسنس MIT.
