# insta-worker

> Independent Instagram public-content **resolver & downloader** that runs as a single **Cloudflare Worker**. No Telegram, no cookies, no private content.

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Alimsv-d/insta-worker)

فارسی در پایین · English below

---

## English

### What it is
A modern, single-file Cloudflare Worker that turns a public Instagram link into a
rich preview plus a clean, streamed download — with a beautiful bilingual web UI,
a versioned JSON API, rate limiting, caching and anonymous stats.

> It replaces an old Telegram bot. **Nothing** from Telegram exists anymore: no
> bot, no webhook, no admin panel, no forced-join, no broadcast.

### Features
- **Rich preview**: thumbnail, author (username + full name), caption, content
  type (video / photo / album), item count, dimensions and nearest size.
- **Quality picker**: every variant the upstream actually returns (resolution,
  bitrate, approximate size, format, audio-only when present); best is default.
  If only one version exists it says so honestly — no fake qualities.
- **Albums / carousels**: preview every item, download individually or all at
  once as a ZIP built **in the browser**.
- **Secure streaming proxy**: `Content-Disposition` with a clean filename
  (`author_shortcode.ext`), HTTP **Range** support, in-page player, and true
  streaming (the whole file is never buffered in memory).
- **Local history**, copy, share, and a "report/remove content" link — all in
  `localStorage`, clearable.
- **Bilingual fa/en** (auto RTL/LTR), light/dark theme, animated and responsive.
- **Versioned API** with a standard JSON envelope, CORS, ETag, Cache-Control,
  structured error codes and OpenAPI.

### Architecture
```
request ──► router (src/worker.js)
             ├─ /                single-file UI (src/lib/ui.js)
             ├─ /api/v1/resolve  metadata + variants
             ├─ /api/v1/download streamed proxy (Range, size cap)
             ├─ /api/v1/thumbnail safe image proxy
             ├─ /health          service + provider health
             ├─ /openapi.json    spec
             └─ /api/v1/admin/*  ADMIN_TOKEN protected (optional API keys)

providers (src/lib/providers.js): ordered UPSTREAM_URLS, per-provider timeout,
retry with backoff, circuit breaker, health tracking; responses normalised to a
single shape (src/lib/normalize.js). KV = short cache + rate limit.
D1 = anonymous stats (IP hashed, never raw) + optional API keys.
```
The download proxy only fetches URLs that came from a provider response **and**
match the CDN allowlist (`*.cdninstagram.com`, `*.fbcdn.net`, `*.instagram.com`,
`*.facebook.com` by default). Private / loopback / link-local hosts, non-HTTPS,
credentials and disallowed ports are blocked, so the worker can never become an
open proxy.

### One-click deploy
1. Click the **Deploy to Cloudflare Workers** button above.
2. Authorize Cloudflare, keep the defaults, deploy.
3. KV and D1 are auto-provisioned from `wrangler.toml` bindings on first deploy.

### Manual setup (Dashboard)
See **[SETUP-MANUAL.md](./SETUP-MANUAL.md)** for a full step-by-step guide
(Dashboard, Wrangler, Android/Termux, Windows, Linux, cPanel) as well as how to
create KV/D1 and set variables and secrets.

### Configuration (worker variables)
| Variable | Default | Meaning |
|---|---|---|
| `UPSTREAM_URLS` | `https://catplus.ir/api/insta` | Comma-separated, ordered providers |
| `RATE_LIMIT_PER_MINUTE` | `60` | Resolve requests / minute / IP (or API key) |
| `RATE_LIMIT_DOWNLOAD_PER_MINUTE` | `20` | Download requests / minute |
| `MAX_DOWNLOAD_MB` | `80` | Hard cap for a proxied download |
| `CDN_ALLOWLIST` | `*.cdninstagram.com,*.fbcdn.net,*.instagram.com,*.facebook.com` | Allowed proxy hosts |
| `CONTACT_URL` | repo issues | Contact / takedown link |
| `CACHE_TTL_SECONDS` | `120` | Short metadata cache (signed links expire) |
| `UPSTREAM_TIMEOUT_MS` | `12000` | Per-provider timeout |
| `DEFAULT_LANG` | `fa` | Default UI/API language |

Secrets (never commit): `ADMIN_TOKEN` (protects `/api/v1/admin/*`),
`UPSTREAM_TOKEN` (optional provider bearer token).

### API reference
Envelope: `{ ok, status, lang, request_id, data }` or `{ ..., error:{code,message} }`.

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/resolve?url=&lang=` | Metadata + variant list |
| GET | `/api/v1/download?url=&quality=&index=&lang=` | Streamed download (Range) |
| GET | `/api/v1/thumbnail?url=&lang=` | Proxied thumbnail |
| GET | `/health` | Health + provider status |
| GET | `/openapi.json` | OpenAPI 3 spec |
| POST | `/api/v1/admin/keys` | Create API key (Bearer `ADMIN_TOKEN`) |

Error codes: `E_INVALID_URL`, `E_PRIVATE_OR_NOT_FOUND`, `E_UPSTREAM_FAILED`,
`E_RATE_LIMIT`, `E_TOO_LARGE`, `E_NOT_ALLOWED_HOST`, `E_BAD_QUALITY`,
`E_BAD_INDEX`, `E_NO_VARIANTS`, `E_METHOD`, `E_NOT_FOUND`, `E_UNAUTHORIZED`,
`E_INTERNAL`. Every HTTP response includes `X-RateLimit-*` and `Retry-After`
when limited.

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
```javascript
// Node.js (18+)
const j = await (await fetch("https://<worker>/api/v1/resolve?url=https://www.instagram.com/reel/ABC123/")).json();
console.log(j);
```

### Development
```bash
npm install
npm run check     # syntax + 63 unit/HTTP/HTML tests (mocked upstream, no network)
npm run dev       # wrangler dev
npm run deploy    # wrangler deploy
npm run secret-scan
```

### FAQ
- **Private content?** Never. Public posts only; no login, cookies, sessions or
  bulk scraping.
- **Only one quality?** The upstream returned one version — we never invent more.
- **Permanent links?** No; Instagram links are signed and short-lived, so
  downloads are proxied through this worker with a short cache.
- **Do you store my data?** Only anonymous counters (IP hashed). History stays in
  your browser.

### Troubleshooting
- **429**: you hit the rate limit — wait for `Retry-After`, or use an API key.
- **E_UPSTREAM_FAILED**: all providers failed; check `UPSTREAM_URLS` and
  `/health`.
- **E_NOT_ALLOWED_HOST**: add the host pattern to `CDN_ALLOWLIST` if your
  provider uses another CDN.
- **Empty page**: open `/?debug=1` to see the JS error panel (the page is always
  rendered server-side and visible by default, even with JS disabled).

### Legal / ToS
Personal use with public content only. The author name and source link are always
shown. Respect copyright. Use the `CONTACT_URL` for DMCA/Takedown. This project
is independent and not affiliated with Instagram or Meta.

**Security note:** never paste tokens into chats or screenshots. If you did,
roll/revoke them immediately (Cloudflare → My Profile → API Tokens; BotFather
`/revoke` for Telegram tokens).

MIT licensed.

---

## فارسی

### این چیست
یک **Worker تک‌فایلی** روی Cloudflare که لینک عمومی اینستاگرام را به پیش‌نمایش
کامل و دانلود تمیز و استریمی تبدیل می‌کند — همراه رابط وب دوزبانهٔ زیبا، API
نسخه‌دار JSON، محدودیت نرخ، کش و آمار ناشناس.

> جانشین ربات قدیمی تلگرام است. **هیچ چیزی** از تلگرام باقی نمانده: نه ربات، نه
> webhook، نه پنل ادمین، نه عضویت اجباری و نه ارسال همگانی.

### قابلیت‌ها
- **پیش‌نمایش کامل**: تصویر بندانگشتی، نام و آیدی صاحب محتوا، کپشن، نوع
  (ویدیو/عکس/آلبوم)، تعداد آیتم، ابعاد و حجم تقریبی.
- **انتخاب کیفیت**: تمام کیفیت‌های واقعی که upstream برمی‌گرداند (رزولوشن،
  بیت‌ریت، حجم، فرمت، فقط‌صدا) با پیش‌فرض بهترین. اگر فقط یک نسخه باشد صادقانه
  اعلام می‌شود؛ هیچ کیفیت جعلی ساخته نمی‌شود.
- **آلبوم**: نمایش همهٔ آیتم‌ها، دانلود تکی یا همه به‌صورت ZIP **در مرورگر**.
- **پروکسی امن با استریم**: `Content-Disposition` با نام تمیز
  (`author_shortcode.ext`)، پشتیبانی از **Range**، پلیر داخل صفحه و استریم واقعی
  (کل فایل در حافظه بارگذاری نمی‌شود).
- **تاریخچهٔ محلی**، کپی، اشتراک‌گذاری و لینک «گزارش/حذف محتوا» — همه در
  `localStorage` و قابل پاک‌کردن.
- **دوزبانه fa/en** (RTL/LTR خودکار)، تم روشن/تیره، انیمیشن و کاملاً ریسپانسیو.
- **API نسخه‌دار** با پاسخ استاندارد، CORS، ETag، Cache-Control، کدهای خطای
  مشخص و OpenAPI.

### معماری
```
request ──► router (src/worker.js)
             ├─ /                رابط تک‌فایلی (src/lib/ui.js)
             ├─ /api/v1/resolve  متادیتا + کیفیت‌ها
             ├─ /api/v1/download پروکسی استریمی (Range، سقف حجم)
             ├─ /api/v1/thumbnail پروکسی امن تصویر
             ├─ /health          وضعیت سرویس و providerها
             ├─ /openapi.json    مشخصات
             └─ /api/v1/admin/*  محافظت‌شده با ADMIN_TOKEN

providerها (src/lib/providers.js): UPSTREAM_URLS به‌ترتیب اولویت، timeout
per-provider، retry با backoff، circuit breaker و health-check؛ نرمال‌سازی پاسخ
(src/lib/normalize.js). KV = کش کوتاه + rate limit. D1 = آمار ناشناس (IP hash،
هرگز خام) + API Key اختیاری.
```
پروکسی دانلود فقط URLهایی را می‌گیرد که از پاسخ provider آمده باشند **و** در
فهرست مجاز CDN باشند. IP خصوصی/loopback/link-local، غیر HTTPS، credential و
پورت غیرمجاز بلاک می‌شوند؛ بنابراین هرگز open proxy نمی‌شود.

### استقرار یک‌کلیکی
۱. روی دکمهٔ **Deploy to Cloudflare Workers** بالا بزنید.
۲. به Cloudflare اجازه دهید، پیش‌فرض‌ها را نگه دارید و منتشر کنید.
۳. KV و D1 در اولین deploy از روی bindingهای `wrangler.toml` خودکار ساخته
   می‌شوند.

### راه‌اندازی دستی
راهنمای کامل گام‌به‌گام در **[SETUP-MANUAL.md](./SETUP-MANUAL.md)** (Dashboard،
Wrangler، اندروید/Termux، ویندوز، لینوکس، cPanel) و ساخت KV/D1 و تنظیم
متغیرها و Secretها موجود است.

### متغیرهای محیطی
| متغیر | پیش‌فرض | توضیح |
|---|---|---|
| `UPSTREAM_URLS` | `https://catplus.ir/api/insta` | providerها با کاما و ترتیب اولویت |
| `RATE_LIMIT_PER_MINUTE` | `60` | درخواست resolve در دقیقه بر IP/API key |
| `RATE_LIMIT_DOWNLOAD_PER_MINUTE` | `20` | درخواست دانلود در دقیقه |
| `MAX_DOWNLOAD_MB` | `80` | سقف سخت دانلود پروکسی |
| `CDN_ALLOWLIST` | `*.cdninstagram.com,*.fbcdn.net,...` | میزبان‌های مجاز پروکسی |
| `CONTACT_URL` | Issues مخزن | لینک تماس/حذف |
| `CACHE_TTL_SECONDS` | `120` | کش کوتاه متادیتا |
| `UPSTREAM_TIMEOUT_MS` | `12000` | timeout هر provider |
| `DEFAULT_LANG` | `fa` | زبان پیش‌فرض رابط/API |

Secretها (هرگز commit نشوند): `ADMIN_TOKEN` (محافظ `/api/v1/admin/*`) و
`UPSTREAM_TOKEN` (اختیاری).

### مرجع API
ساختار: `{ ok, status, lang, request_id, data }` یا
`{ ..., error:{code,message} }`.

| متد | مسیر | توضیح |
|---|---|---|
| GET | `/api/v1/resolve?url=&lang=` | متادیتا + لیست کیفیت‌ها |
| GET | `/api/v1/download?url=&quality=&index=&lang=` | دانلود/استریم (Range) |
| GET | `/api/v1/thumbnail?url=&lang=` | پروکسی تصویر بندانگشتی |
| GET | `/health` | وضعیت سرویس و providerها |
| GET | `/openapi.json` | مشخصات OpenAPI 3 |
| POST | `/api/v1/admin/keys` | ساخت API Key (Bearer `ADMIN_TOKEN`) |

کدهای خطا: `E_INVALID_URL`, `E_PRIVATE_OR_NOT_FOUND`, `E_UPSTREAM_FAILED`,
`E_RATE_LIMIT`, `E_TOO_LARGE`, `E_NOT_ALLOWED_HOST`, `E_BAD_QUALITY`,
`E_BAD_INDEX`, `E_NO_VARIANTS`, `E_METHOD`, `E_NOT_FOUND`, `E_UNAUTHORIZED`,
`E_INTERNAL`. همهٔ پاسخ‌ها هدر `X-RateLimit-*` و در صورت محدودیت `Retry-After`
دارند.

### توسعه
```bash
npm install
npm run check     # بررسی سینتکس + ۶۳ تست واحد/HTTP/HTML (بدون شبکهٔ واقعی)
npm run dev       # wrangler dev
npm run deploy    # wrangler deploy
npm run secret-scan
```

### سؤالات متداول
- **محتوای خصوصی؟** هرگز. فقط پست‌های عمومی، بدون ورود/کوکی/session و بدون
  scraping انبوه.
- **چرا فقط یک کیفیت؟** منبع فقط یک نسخه داده؛ ما کیفیت جعلی نمی‌سازیم.
- **لینک‌ها دائمی‌اند؟** نه؛ لینک‌های اینستاگرام امضادار و کوتاه‌عمرند و دانلود از
  طریق همین worker پروکسی می‌شود.
- **دادهٔ من ذخیره می‌شود؟** فقط شمارندهٔ ناشناس (IP hash). تاریخچه در مرورگر شما
  می‌ماند.

### عیب‌یابی
- **۴۲۹**: محدودیت نرخ؛ منتظر `Retry-After` بمانید یا از API Key استفاده کنید.
- **E_UPSTREAM_FAILED**: همهٔ providerها خطا دادند؛ `UPSTREAM_URLS` و `/health`
  را بررسی کنید.
- **E_NOT_ALLOWED_HOST**: اگر provider شما CDN دیگری دارد، به `CDN_ALLOWLIST`
  اضافه کنید.
- **صفحهٔ خالی**: با `/?debug=1` پنل خطای JS را ببینید (صفحه همیشه سمت سرور
  رندر می‌شود و حتی با JS خاموش هم دیده می‌شود).

### ملاحظات حقوقی
فقط استفادهٔ شخصی با محتوای عمومی. نام صاحب محتوا و لینک اصلی همیشه نمایش داده
می‌شود. حق نشر را رعایت کنید و برای DMCA/Takedown از `CONTACT_URL` استفاده کنید.
این پروژه مستقل است و به اینستاگرام/متا وابسته نیست.

**هشدار امنیتی:** هرگز توکن را در چت یا اسکرین‌شات نگذارید. اگر گذاشتید فوراً
Roll/Revoke کنید (Cloudflare → My Profile → API Tokens؛ BotFather `/revoke`).

لایسنس MIT.
