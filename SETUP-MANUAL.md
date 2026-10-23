# راهنمای استقرار دستی — insta-worker

این راهنما برای وقتی است که نمی‌خواهید از دکمهٔ Deploy استفاده کنید. هر بخش
مستقل است؛ فقط یکی از روش‌ها را انتخاب کنید.

> پیش‌نیاز مشترک: یک حساب Cloudflare (پلن رایگان کافی است) و یک دامنهٔ متصل به
> همان حساب اگر می‌خواهید روی دامنهٔ خودتان سرو شود. `workers.dev` هم بدون دامنه
> کار می‌کند.

---

## ۰) پیش‌نیازهای محلی

- Node.js **۲۰ یا بالاتر**
- Wrangler **۳.۶۰ یا بالاتر** (برای auto-provisioning خودکار KV/D1)

```bash
node -v
npm install --no-audit --no-fund
npx wrangler --version
npx wrangler login
```

بررسی سریع پروژه پیش از استقرار:

```bash
npm run check        # سینتکس + ۱۱۱ تست mock
npm run secret-scan  # اطمینان از نبود توکن در فایل‌ها
npm run bundle       # ساخت dist/worker.js تک‌فایلی
```

---

## ۱) روش الف — دکمهٔ Deploy (ساده‌ترین)

1. روی دکمهٔ Deploy در `README.md` بزنید.
2. به Cloudflare وارد شوید و اجازهٔ دسترسی به حساب را بدهید.
3. نام Worker را تأیید کنید (مثلاً `insta-worker`).
4. Deploy را بزنید. KV و D1 به‌صورت خودکار ساخته و bind می‌شوند.
5. آدرس `https://<name>.<subdomain>.workers.dev` را باز کنید.
6. Secretها را اضافه کنید (بخش ۵) و دوباره Deploy کنید.

> اگر نسخهٔ Wrangler کمتر از ۳.۶۰ باشد، auto-provisioning انجام نمی‌شود و باید
> KV/D1 را دستی بسازید (بخش ۲).

---

## ۲) روش ب — Dashboard (بدون CLI)

### ۲.۱ ساخت Worker
1. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Worker**.
2. نام بگذارید و **Deploy** کنید (نسخهٔ نمونه مهم نیست).
3. وارد **Edit code** شوید، همهٔ محتوای پیش‌فرض را پاک کنید و محتوای
   `dist/worker.js` را جای‌گذاری کنید (خروجی `npm run bundle`).
4. **Deploy** کنید.

> فایل `dist/worker.js` تک‌فایلی و ESM است و همهٔ ماژول‌ها را درون خود دارد.

### ۲.۲ ساخت KV (محدودیت نرخ + کش)
1. **Workers & Pages** → **KV** → **Create namespace**.
2. نام: `insta-worker-cache`.
3. به Worker برگردید → **Settings** → **Bindings** → **Add** → **KV namespace**:
   - Variable name: `CACHE`
   - KV namespace: همان namespace ساخته‌شده

### ۲.۳ ساخت D1 (آمار و API Key)
1. **Workers & Pages** → **D1** → **Create database**.
2. نام: `insta-worker-db`.
3. در صفحهٔ دیتابیس، تب **Console** را باز کنید و محتوای
   `migrations/0001_init.sql` را اجرا کنید (یا از تب Migrations).
4. به Worker برگردید → **Settings** → **Bindings** → **Add** → **D1 database**:
   - Variable name: `DB`
   - Database: `insta-worker-db`

> اولین درخواست هم schema را idempotent اعمال می‌کند؛ اجرای دستی فقط برای
> اطمینان و برای Cron است.

### ۲.۴ متغیرها
**Settings** → **Variables and Secrets** → بخش Variables:

| نام | مقدار پیشنهادی |
|---|---|
| `UPSTREAM_URLS` | `https://catplus.ir/api/insta` |
| `RATE_LIMIT_PER_MINUTE` | `60` |
| `RATE_LIMIT_DOWNLOAD_PER_MINUTE` | `20` |
| `RATE_LIMIT_THUMBNAIL_PER_MINUTE` | `60` |
| `RATE_LIMIT_ADMIN_PER_MINUTE` | `10` |
| `RATE_LIMIT_HEALTH_PER_MINUTE` | `10` |
| `MAX_DOWNLOAD_MB` | `80` |
| `CACHE_TTL_SECONDS` | `120` |
| `UPSTREAM_TIMEOUT_MS` | `12000` |
| `DEFAULT_LANG` | `fa` |
| `CDN_ALLOWLIST` | `*.cdninstagram.com,*.fbcdn.net,*.instagram.com,*.facebook.com` |
| `CONTACT_URL` | لینک تماس/حذف محتوا |

### ۲.۵ Secretها
**Settings** → **Variables and Secrets** → **Add** → نوع **Secret**:

- `ADMIN_TOKEN` — یک رشتهٔ تصادفی بلند (حداقل ۳۲ کاراکتر).
- `UPSTREAM_TOKEN` — فقط اگر provider شما توکن می‌خواهد.
- `IP_HASH_SECRET` — یک رشتهٔ تصادفی دیگر (حداقل ۱۶ کاراکتر).

ساخت مقدار تصادفی در ترمینال:

```bash
openssl rand -hex 32
```

> `IP_HASH_SECRET` را حتماً تنظیم کنید. بدون آن یک مقدار پیش‌فرض عمومی استفاده
> می‌شود و bucketهای IP بین deploymentها قابل مقایسه می‌شوند.

### ۲.۶ Cron (پاکسازی آمار)
در Dashboard برای Worker → **Settings** → **Triggers** → **Cron Triggers** →
`0 3 * * *` را اضافه کنید. این کار رکوردهای قدیمی `stats` را روزانه پاک می‌کند.

---

## ۳) روش ج — Wrangler CLI

```bash
npx wrangler login
npx wrangler kv namespace create CACHE
npx wrangler d1 create insta-worker-db
npx wrangler d1 migrations apply insta-worker-db --remote
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put IP_HASH_SECRET
# اختیاری:
# npx wrangler secret put UPSTREAM_TOKEN
npx wrangler deploy
```

سپس `wrangler.toml` را باز کنید و شناسه‌های واقعی را جای‌گذاری کنید:

```toml
[[kv_namespaces]]
binding = "CACHE"
id = "<KV_NAMESPACE_ID>"

[[d1_databases]]
binding = "DB"
database_name = "insta-worker-db"
database_id = "<D1_DATABASE_ID>"
migrations_dir = "migrations"
```

> در `wrangler.toml` هیچ `preview_id` یا `preview_database_id` ساختگی نگذارید؛
> Wrangler جدید خودش پیش‌نمایش محلی را مدیریت می‌کند. اگر از `wrangler dev`
> استفاده می‌کنید و خطای binding گرفتید، بخش `[env.preview]` را فقط در صورت
> نیاز اضافه کنید.

بررسی سلامت و لاگ:

```bash
npx wrangler tail
curl -s "https://<worker-domain>/health?deep=1" | head -c 800
```

---

## ۴) روش د — اتصال GitHub به Cloudflare (بدون Actions)

1. مخزن را به GitHub push کنید (بدون Secret).
2. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Connect to Git**.
3. مخزن و شاخهٔ `main` را انتخاب کنید.
4. Build command را خالی بگذارید و Deploy command را
   `npx wrangler deploy` قرار دهید (یا مطابق تنظیمات پروژه).
5. KV/D1 را در **Settings → Bindings** وصل کنید و متغیرها/Secretها را وارد کنید.
6. هر push به `main` خودکار deploy می‌شود.

> اگر می‌خواهید فقط با تگ/دستی deploy شود، در تنظیمات Git integration شاخه را
> عوض کنید یا از روش ه (Actions) استفاده کنید.

---

## ۵) روش ه — GitHub Actions

فایل `.github/workflows/deploy.yml` فقط با **workflow_dispatch** اجرا می‌شود و
اگر Secretها ناقص باشند با خطای صریح متوقف می‌شود (deploy سبزِ الکی نداریم).

### ۵.۱ ساخت API Token در Cloudflare
**My Profile** → **API Tokens** → **Create Token** → **Custom token**:

- Permissions:
  - `Account` → `Workers Scripts` → **Edit**
  - `Account` → `Workers KV Storage` → **Edit**
  - `Account` → `D1` → **Edit**
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
| `ADMIN_TOKEN` | همان مقدار Secret ورکر |
| `IP_HASH_SECRET` | همان مقدار Secret ورکر |
| `UPSTREAM_TOKEN` | اختیاری |

> Workflow این مقادیر را با `wrangler secret put` روی Worker تنظیم می‌کند؛
> لازم نیست جداگانه در Dashboard وارد شوند.

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
# 1) صفحهٔ اصلی (باید 200 و CSP بدون unsafe-inline بدهد)
curl -sI "https://<worker-domain>/" | grep -iE "^(HTTP|content-security-policy|cache-control)"

# 2) سلامت
curl -s "https://<worker-domain>/health?deep=1"

# 3) سند API
curl -s "https://<worker-domain>/openapi.json" | head -c 300

# 4) resolve یک لینک عمومی
curl -s "https://<worker-domain>/api/v1/resolve?url=https://www.instagram.com/reel/ABC123/"

# 5) محدودیت نرخ (باید 429 با Retry-After بدهد)
for i in $(seq 1 70); do curl -s -o /dev/null -w "%{http_code}\n" \
  "https://<worker-domain>/api/v1/resolve?url=https://www.instagram.com/reel/ABC123/"; done | sort | uniq -c

# 6) ادمین بدون توکن (باید 401 بدهد)
curl -s -i "https://<worker-domain>/api/v1/admin/keys" | head -5

# 7) ادمین با توکن
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "https://<worker-domain>/api/v1/admin/keys"
```

انتظار:
- `/` → `200`, `cache-control: private, no-store`, CSP شامل `nonce-...` و بدون
  `unsafe-inline`.
- `/health?deep=1` → `200` با `ok:true` و وضعیت providerها.
- `/openapi.json` → `200` و JSON معتبر.
- resolve → `200` با `data.variants` غیرخالی یا خطای ساختاریافتهٔ روشن.
- درخواست‌های بیش از سقف → `429` و هدر `Retry-After`.
- ادمین بدون توکن → `401`؛ با توکن → `200`.

---

## ۸) چرخش (Rotate) Secretها

اگر توکنی لو رفت:

1. Cloudflare → **My Profile** → **API Tokens** → توکن مربوطه → **Roll/Delete**.
2. GitHub → **Settings → Secrets** → مقدار جدید را ذخیره کنید.
3. روی Worker:
   ```bash
   npx wrangler secret put ADMIN_TOKEN
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
| `500` روی همهٔ مسیرها | binding یا schema ناقص | `/health?deep=1` و لاگ `wrangler tail` |
| `E_UPSTREAM_FAILED` | provider قطع/تغییر شکل پاسخ | `UPSTREAM_URLS` و health عمیق |
| `E_NOT_ALLOWED_HOST` | CDN در allowlist نیست | `CDN_ALLOWLIST` را به‌روز کنید |
| `429` زودهنگام | سقف پایین یا IP مشترک | سقف را بالا ببرید یا API Key بسازید |
| صفحه بدون استایل | CSP یا nonce اشتباه | `/?debug=1` و CSP پاسخ را ببینید |
| دانلود نیمه‌کاره | سقف `MAX_DOWNLOAD_MB` یا timeout | سقف/`UPSTREAM_TIMEOUT_MS` را تنظیم کنید |
| آمار خالی | D1 وصل نیست | binding `DB` و اجرای migration |
| کش کار نمی‌کند | KV وصل نیست | binding `CACHE` |
| Cron اجرا نمی‌شود | trigger ثبت نشده | `[triggers]` در `wrangler.toml` یا Dashboard |

### لاگ‌های امن
- هرگز کل توکن را لاگ نکنید؛ در صورت نیاز فقط ۶ کاراکتر اول/آخر.
- `ADMIN_TOKEN` تنها با مقایسهٔ `timingSafeEqual` بررسی می‌شود.
- API Keyها فقط به‌صورت هش ذخیره می‌شوند و لیست ادمین هیچ هشی برنمی‌گرداند.

---

## ۱۰) حذف کامل

```bash
npx wrangler delete
npx wrangler kv namespace delete --namespace-id <KV_ID>
npx wrangler d1 delete insta-worker-db
```

> قبل از حذف D1، در صورت نیاز backup بگیرید:
> `npx wrangler d1 export insta-worker-db --output backup.sql --remote`
