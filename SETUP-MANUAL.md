# راهنمای استقرار دستی — insta-worker

این راهنما برای وقتی است که نمی‌خواهید از دکمهٔ Deploy استفاده کنید. سرویس
در مسیر `/` رابط وب دوزبانه دارد و هم‌زمان API نسخه‌دار ارائه می‌کند؛ D1، Cron
یا Secret اجباری ندارد. هر بخش مستقل است؛ فقط یکی از روش‌ها را انتخاب کنید.

> پیش‌نیاز مشترک: یک حساب Cloudflare (پلن رایگان کافی است) و یک دامنهٔ متصل به
> همان حساب اگر می‌خواهید روی دامنهٔ خودتان سرو شود. `workers.dev` هم بدون دامنه
> کار می‌کند.

---

## ۰) پیش‌نیازهای محلی

- Node.js **۲۰ یا بالاتر**
- Wrangler **۳.۶۰ یا بالاتر** (برای auto-provisioning خودکار KV)

```bash
node -v
npm install --no-audit --no-fund
npx wrangler --version
npx wrangler login
```

بررسی سریع پروژه پیش از استقرار:

```bash
npm run check        # بررسی سینتکس + همهٔ تست‌های mock
npm run secret-scan  # اطمینان از نبود توکن در فایل‌ها
npm run bundle       # ساخت dist/worker.js تک‌فایلی
```

---

## ۱) روش الف — دکمهٔ Deploy (ساده‌ترین)

1. روی دکمهٔ Deploy در `README.md` بزنید.
2. به Cloudflare وارد شوید و اجازهٔ دسترسی به حساب را بدهید.
3. نام Worker را تأیید کنید (مثلاً `insta-worker`).
4. Deploy را بزنید. هیچ فیلدی اجباری نیست و D1/دیتابیسی ساخته نمی‌شود.
5. آدرس `https://<name>.<subdomain>.workers.dev` را در مرورگر باز کنید؛ صفحهٔ
   وب نمایش داده می‌شود. برای خلاصهٔ JSON از `curl -H "Accept: application/json"
   https://<name>.<subdomain>.workers.dev/` استفاده کنید.
6. (اختیاری) در **Settings → Variables and Secrets** متغیرها یا Secretها را
   اضافه کنید (بخش ۲.۴ و ۲.۵).

> با Wrangler >= ۳.۶۰ فضای KV خودکار ساخته و به binding `KV` وصل می‌شود. با
> نسخهٔ قدیمی‌تر، KV را دستی بسازید (بخش ۲.۲).

---

## ۲) روش ب — Dashboard (بدون CLI)

### ۲.۱ ساخت Worker
1. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Worker**.
2. نام بگذارید و **Deploy** کنید (نسخهٔ نمونه مهم نیست).
3. وارد **Edit code** شوید، همهٔ محتوای پیش‌فرض را پاک کنید و محتوای
   `dist/worker.js` را جای‌گذاری کنید (خروجی `npm run bundle`).
4. **Deploy** کنید.

> فایل `dist/worker.js` تک‌فایلی و ESM است و همهٔ ماژول‌ها، از جمله رابط وب،
> را درون خود دارد. `/` با `Accept: text/html` صفحه و با `Accept: application/json`
> (یا `*/*`) خلاصهٔ JSON برمی‌گرداند.

### ۲.۲ ساخت KV (محدودیت نرخ + کش)
1. **Workers & Pages** → **KV** → **Create namespace**.
2. نام: `insta-worker-cache` (نام دلخواه است).
3. به Worker برگردید → **Settings** → **Bindings** → **Add** →
   **KV namespace**:
   - Variable name: `KV`
   - KV namespace: همان namespace ساخته‌شده

> اگر KV را وصل نکنید، سرویس باز هم کار می‌کند: کش و محدودیت نرخ به‌صورت
> graceful رد می‌شوند و `/health` مقدار `storage.kv: false` را نشان می‌دهد.

### ۲.۳ دیتابیس/Cron لازم نیست
هیچ D1، migration، آمار یا Cron trigger وجود ندارد. فقط KV کافی است.

### ۲.۴ متغیرها (اختیاری)
**Settings** → **Variables and Secrets** → بخش Variables. همهٔ مقادیر پیش‌فرض
امن دارند؛ افزودن آن‌ها اختیاری است.

| نام | مقدار پیشنهادی |
|---|---|
| `UPSTREAM_URLS` | `https://catplus.ir/api/insta` |
| `RATE_LIMIT_PER_MINUTE` | `60` |
| `RATE_LIMIT_DOWNLOAD_PER_MINUTE` | `20` |
| `RATE_LIMIT_THUMBNAIL_PER_MINUTE` | `60` |
| `RATE_LIMIT_HEALTH_PER_MINUTE` | `10` |
| `MAX_DOWNLOAD_MB` | `80` |
| `CACHE_TTL_SECONDS` | `120` |
| `UPSTREAM_TIMEOUT_MS` | `12000` |
| `CDN_ALLOWLIST` | `*.cdninstagram.com,*.fbcdn.net` |
| `ALLOWED_ORIGINS` | `*` یا فهرست Origin با کاما |

### ۲.۵ Secretها (همه اختیاری)
**Settings** → **Variables and Secrets** → **Add** → نوع **Secret**:

- `API_KEYS` — کلیدها با کاما. اگر تنظیم شود، همهٔ `/api/v1/*` به
  `Authorization: Bearer <key>` یا `x-api-key: <key>` نیاز دارند. بدون آن API
  عمومی و بر اساس IP محدود است.
- `UPSTREAM_TOKEN` — فقط اگر provider شما توکن می‌خواهد.
- `IP_HASH_SECRET` — یک رشتهٔ تصادفی دیگر (حداقل ۱۶ کاراکتر) برای HMAC آدرس IP.

ساخت مقدار تصادفی در ترمینال:

```bash
openssl rand -hex 32
```

> `IP_HASH_SECRET` را در production تنظیم کنید. بدون آن یک مقدار پیش‌فرض عمومی
> استفاده می‌شود و bucketهای IP بین deploymentها قابل مقایسه می‌شوند. هیچ‌کدام
> از این Secretها برای بالا آمدن سرویس لازم نیستند.

---

## ۳) روش ج — Wrangler CLI

```bash
npx wrangler login
npx wrangler deploy
```

`wrangler.toml` از قبل binding `KV` را بدون `id` دارد؛ Wrangler >= ۳.۶۰ فضای KV
را خودکار می‌سازد. اگر می‌خواهید از یک namespace موجود استفاده کنید:

```bash
npx wrangler kv namespace create KV
```

سپس شناسهٔ خروجی را در `wrangler.toml` جای‌گذاری کنید:

```toml
[[kv_namespaces]]
binding = "KV"
id = "<KV_NAMESPACE_ID>"
```

Secretهای اختیاری:

```bash
# فقط در صورت نیاز؛ هیچ‌کدام اجباری نیست
npx wrangler secret put API_KEYS
npx wrangler secret put IP_HASH_SECRET
npx wrangler secret put UPSTREAM_TOKEN
```

> در `wrangler.toml` هیچ `preview_id` ساختگی نگذارید؛ Wrangler جدید پیش‌نمایش
> محلی را خودش مدیریت می‌کند.

بررسی سلامت و لاگ:

```bash
npx wrangler tail
curl -s "https://<worker-domain>/health?deep=1"
```

---

## ۴) روش د — اتصال GitHub به Cloudflare (بدون Actions)

1. مخزن را به GitHub push کنید (بدون Secret).
2. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Connect to Git**.
3. مخزن و شاخهٔ `main` را انتخاب کنید.
4. Build command را خالی بگذارید و Deploy command را
   `npx wrangler deploy` قرار دهید.
5. KV را در **Settings → Bindings** وصل کنید (نام متغیر: `KV`) و در صورت نیاز
   متغیرها/Secretها را وارد کنید.
6. هر push به `main` خودکار deploy می‌شود.

> اگر می‌خواهید فقط با تگ/دستی deploy شود، در تنظیمات Git integration شاخه را
> عوض کنید یا از روش ه (Actions) استفاده کنید.

---

## ۵) روش ه — GitHub Actions

فایل `.github/workflows/deploy.yml` فقط با **workflow_dispatch** اجرا می‌شود و
اگر Secretهای لازم GitHub ناقص باشند با خطای صریح متوقف می‌شود (deploy سبزِ
الکی نداریم). این workflow فقط به دو Secret زیر نیاز دارد و هیچ Secret
برنامه‌ای (`API_KEYS` و…) را از GitHub به Worker منتقل نمی‌کند.

### ۵.۱ ساخت API Token در Cloudflare
**My Profile** → **API Tokens** → **Create Token** → **Custom token**:

- Permissions:
  - `Account` → `Workers Scripts` → **Edit**
  - `Account` → `Workers KV Storage` → **Edit**
  - `Account` → `Account Settings` → **Read** (برای Account ID)
- Account Resources: حساب خودتان
- Zone Resources: فقط اگر از Custom Domain/Route استفاده می‌کنید، Zone مربوطه
  با `Workers Routes` → **Edit**

### ۵.۲ Secretهای GitHub
**Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| نام | مقدار |
|---|---|
| `CLOUDFLARE_API_TOKEN` | توکن بخش ۵.۱ |
| `CLOUDFLARE_ACCOUNT_ID` | از Dashboard → Workers → Account ID |

> Secretهای اختیاری سرویس (`API_KEYS`، `IP_HASH_SECRET`، `UPSTREAM_TOKEN`) را
> جداگانه در Dashboard ورکر یا با `wrangler secret put` تنظیم کنید.

### ۵.۳ Environment
یک Environment به نام `production` بسازید (Settings → Environments) و در صورت
نیاز Reviewer یا محدودیت شاخه را فعال کنید. Workflow به همین environment وصل
است.

### ۵.۴ اجرا
**Actions** → **Deploy to Cloudflare** → **Run workflow** → شاخهٔ `main`.

Workflow ابتدا job `check` را اجرا می‌کند (`npm ci`، `npm run check`،
`npm run secret-scan`) و فقط در صورت موفقیت deploy می‌کند.

---

## ۶) تنظیم دامنه

1. Worker → **Settings** → **Domains & Routes** → **Add** → **Custom domain**.
2. دامنه/زیردامنه را وارد کنید (DNS باید در همان حساب Cloudflare باشد).
3. منتظر صدور گواهی بمانید و سپس باز کنید.

برای مسیر روی دامنهٔ موجود: **Add route** با الگوی
`example.com/instagram/*` و Zone مناسب. در این حالت Worker فقط روی همان مسیر
اجرا می‌شود.

---

## ۷) چک‌لیست تأیید

```bash
# 1) صفحهٔ وب برای مرورگر
curl -sI -H "Accept: text/html" "https://<worker-domain>/" | grep -iE "^(HTTP|content-type|cache-control|content-security-policy)"
curl -s -H "Accept: text/html" "https://<worker-domain>/" | head -c 300

# خلاصهٔ JSON برای API client
curl -s -H "Accept: application/json" "https://<worker-domain>/" | head -c 300

# 2) سلامت
curl -s "https://<worker-domain>/health?deep=1"

# 3) سند API
curl -s "https://<worker-domain>/openapi.json" | head -c 200

# 4) resolve یک لینک عمومی
curl -s "https://<worker-domain>/api/v1/resolve?url=https://www.instagram.com/reel/ABC123/"

# 5) دانلود (هدرهای پاسخ)
curl -sI "https://<worker-domain>/api/v1/download?url=https://www.instagram.com/reel/ABC123/"

# 6) محدودیت نرخ (باید 429 با Retry-After بدهد)
for i in $(seq 1 70); do curl -s -o /dev/null -w "%{http_code}\n" \
  "https://<worker-domain>/api/v1/resolve?url=https://www.instagram.com/reel/ABC123/"; done | sort | uniq -c

# 7) فقط اگر API_KEYS تنظیم شده است (باید 401 بدهد)
curl -s -i "https://<worker-domain>/api/v1/resolve?url=https://www.instagram.com/reel/ABC123/" | head -5
```

انتظار:
- `/` با `Accept: text/html` → `200` با `content-type: text/html`, nonce CSP
  و `cache-control: private, no-store`؛ با `Accept: application/json` → خلاصهٔ JSON.
- `/health?deep=1` → `200` با `ok:true`، `storage.kv` و وضعیت providerها.
- `/openapi.json` → `200` و JSON معتبر.
- resolve → `200` با `data.items` غیرخالی یا خطای ساختاریافتهٔ روشن.
- درخواست‌های بیش از سقف → `429` و هدر `Retry-After`.
- اگر `API_KEYS` تنظیم شده باشد، درخواست بدون کلید → `401` با
  `WWW-Authenticate: Bearer`؛ با کلید درست → `200`.

---

## ۸) چرخش (Rotate) Secretها

اگر توکنی لو رفت:

1. Cloudflare → **My Profile** → **API Tokens** → توکن مربوطه → **Roll/Delete**.
2. GitHub → **Settings → Secrets** → مقدار جدید را ذخیره کنید.
3. روی Worker، در صورت استفاده:
   ```bash
   npx wrangler secret put API_KEYS
   npx wrangler secret put IP_HASH_SECRET
   ```
4. اگر `UPSTREAM_TOKEN` لو رفته، آن را در پنل provider هم باطل کنید.
5. لاگ‌ها را بررسی کنید: `npx wrangler tail`.

> Secretها را در چت، اسکرین‌شات، Issue یا فایل `.dev.vars` داخل مخزن نگذارید.
> `.dev.vars` در `.gitignore` است.

---

## ۹) عیب‌یابی

| نشانه | علت محتمل | راه‌حل |
|---|---|---|
| `500` روی همهٔ مسیرها | خطای غیرمنتظره/کانفیگ | `/health` و `wrangler tail` |
| `E_UPSTREAM_FAILED` | provider قطع/تغییر شکل پاسخ | `UPSTREAM_URLS` و health عمیق |
| `E_UPSTREAM_TIMEOUT` | کندی/قطعی provider | `UPSTREAM_TIMEOUT_MS` یا provider |
| `E_NOT_ALLOWED_HOST` | CDN در allowlist نیست | `CDN_ALLOWLIST` را به‌روز کنید |
| `429` زودهنگام | سقف پایین یا IP مشترک | سقف را بالا ببرید یا `API_KEYS` را فعال کنید |
| `401` ناخواسته | `API_KEYS` تنظیم شده | کلید درست را در `Bearer`/`x-api-key` بفرستید |
| دانلود نیمه‌کاره | سقف `MAX_DOWNLOAD_MB` یا timeout | سقف/`UPSTREAM_TIMEOUT_MS` را تنظیم کنید |
| `storage.kv: false` | binding `KV` وصل نیست | بخش ۲.۲ را انجام دهید (سرویس بدون آن هم کار می‌کند) |
| کش کار نمی‌کند | KV وصل نیست | binding `KV` |

### لاگ‌های امن
- هرگز کل توکن را لاگ نکنید؛ در صورت نیاز فقط ۶ کاراکتر اول/آخر.
- API keyها فقط با `timingSafeEqual` مقایسه می‌شوند و کلید خام ذخیره نمی‌شود.
- IP فقط به‌صورت HMAC-SHA256 در KV می‌نشیند، نه خام.

---

## ۱۰) حذف کامل

```bash
npx wrangler delete
# اختیاری: حذف namespace ساخته‌شده
npx wrangler kv namespace delete --namespace-id <KV_ID>
```

> قبل از حذف KV، در صورت نیاز backup بگیرید:
> `npx wrangler kv key list --namespace-id <KV_ID>`
