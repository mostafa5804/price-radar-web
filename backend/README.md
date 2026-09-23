# راه‌اندازی بک‌اند واقعی Price Radar روی Cloudflare

این Worker فقط از APIهای زندهٔ دیوار و دیجی‌کالا داده می‌گیرد. اگر یکی از منابع دسترسی را محدود کند، خطا را نمایش می‌دهد و دادهٔ نمونه جایگزین نمی‌کند.

## پیش‌نیاز

- حساب Cloudflare با Workers و D1
- Node.js و npm روی رایانه‌ای که فرمان‌های استقرار را اجرا می‌کند
- توکن ربات تلگرام و شناسهٔ عددی گفت‌وگوی تلگرام
- فایل اصلی ربات را در اختیار نگه دار؛ فایل‌های `.env` و SQLite به این مخزن منتقل نمی‌شوند.

## ایجاد D1

در همین پوشه اجرا کن:

```powershell
npm install --save-dev wrangler
npx wrangler login
npx wrangler d1 create price-radar
```

Cloudflare شناسهٔ پایگاه‌داده را برمی‌گرداند. از `wrangler.toml.example` یک کپی با نام `wrangler.toml` بساز و مقدار `database_id` را با همان شناسه جایگزین کن. سپس جدول‌ها را بساز:

```powershell
npx wrangler d1 execute price-radar --remote --file=schema.sql
```

## ثبت Secretها

این فرمان‌ها را جداگانه اجرا کن و مقدار هر کدام را فقط در ورودی امن Wrangler وارد کن:

```powershell
npx wrangler secret put WEB_ACCESS_PASSWORD
npx wrangler secret put SESSION_SECRET
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
```

برای `WEB_ACCESS_PASSWORD` رمز قوی و یکتا انتخاب کن. برای `SESSION_SECRET` یک مقدار تصادفی طولانی بساز. توکن تلگرام و شناسهٔ چت را از فایل خصوصی `.env` خودت بخوان، اما آن فایل را commit یا آپلود نکن. ربات باید قبلاً یک بار از طرف خودت `/start` دریافت کرده باشد تا بتواند پیام بفرستد.

## انتشار و اتصال سایت

```powershell
npx wrangler deploy
```

فرمان، آدرس Worker را در خروجی چاپ می‌کند. همان آدرس را در `api-config.js` ثبت کن؛ نمونه:

```js
window.PRICE_RADAR_API_URL = "https://price-radar-api.ACCOUNT.workers.dev";
```

فایل را به مخزن GitHub Pages بفرست. در پایان `https://price-radar-api.ACCOUNT.workers.dev/api/health` باید `configured: true` برگرداند. سپس از صفحه وارد شو، جست‌وجو کن و یک دیده‌بان اضافه کن.

## رفتار

- پایش خودکار ساعتی است.
- هشدار کاهش قیمت به `TELEGRAM_CHAT_ID` ارسال می‌شود.
- حداکثر ۸ دیده‌بان فعال پذیرفته می‌شود.
- خطای یک منبع در پاسخ جست‌وجو جدا از منبع دیگر گزارش می‌شود.
- جست‌وجو با رمز مدیر محافظت شده؛ همهٔ APIها به جز سلامت و ورود نیازمند نشست امضاشده‌اند.
- Worker و D1 از اکانت Cloudflare خودت استفاده می‌کنند. سهمیه‌ها تابع طرح فعلی Cloudflare است.

## بررسی محدودیت منبع

دسترسی‌ای که در ربات روی رایانهٔ شخصی کار می‌کرد، تضمین نمی‌کند درخواست‌های Cloudflare هم پذیرفته شوند؛ IP خروجی و محدودیت‌های ضدربات ممکن است متفاوت باشد. پس از انتشار، جست‌وجوی هر دو منبع را از صفحه امتحان کن. اگر دیوار یا دیجی‌کالا درخواست Worker را رد کرد، سرویس واقعی از آن میزبان قابل اتکا نیست و باید همان بخش را از راه میزبان دیگری اجرا کرد.
