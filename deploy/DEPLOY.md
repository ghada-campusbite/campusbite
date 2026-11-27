> **الحالة:** نسخة تجريبية. ما اتنشرتش على Neon أو Render ولا اتجرّب عليهم، ولا اتجرّبت على أندرويد/APK، والإشعارات والإيميل الحقيقي لسه ما اتفعّلوش. المتحقق منه محليًا فقط (Postgres محلي + متصفح ويب). مش جاهزة للإنتاج.

# نشر CampusBite

## قبل ما تبدئي (مرة واحدة على جهازك)
1. في `campusbite-backend`: `npm install && npx prisma migrate dev --name init` — ده بيولّد فولدر `prisma/migrations`. **لازم يتحط في الـ git/الـ zip قبل النشر**، لأن السيرفر بيشغّل `migrate deploy` وهو بيطبّق الـ migrations الموجودة بس.
2. شغّلي `npm install` في الباك إند واللوحة وخلي ملفات `package-lock.json` تتحفظ، وبعدها غيّري `npm install` لـ `npm ci` في الـ Dockerfiles.

## على السيرفر (Ubuntu + Docker)
1. دومين، وسجلّي A record لـ `api.DOMAIN` و`panel.DOMAIN` على IP السيرفر.
2. فتح بورتات 22/80/443 بس (`ufw allow OpenSSH && ufw allow 80,443/tcp && ufw enable`). الداتابيز مش مفتوحة برا.
3. ارفعي المجلدات التلاتة جنب بعض: `campusbite-backend` و`campusbite-dashboard` و`campusbite-deploy`.
4. `cd campusbite-deploy && cp .env.example .env` واملي القيم (الأسرار بـ `openssl rand -base64 48`).
5. `docker compose up -d --build` — شهادة HTTPS بتتجاب أوتوماتيك.
6. أنشئي الأدمن (مرة واحدة):
   `docker compose run --rm -e SEED_ADMIN_EMAIL=you@x.com -e SEED_ADMIN_PASSWORD='باسورد-طويل-12+' api node prisma/seed.js`
7. سجّلي دخول بالأدمن وجهّزي البيانات (التوكن صالح 15 دقيقة):
```
API=https://api.DOMAIN/api/v1
TOKEN=$(curl -s $API/auth/login -H 'content-type: application/json' -d '{"email":"you@x.com","password":"..."}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["accessToken"])')
H="authorization: Bearer $TOKEN"; J='content-type: application/json'
curl -s $API/admin/universities -H "$H" -H "$J" -d '{"name":"جامعة طنطا"}'                       # خدي id
curl -s $API/admin/canteens -H "$H" -H "$J" -d '{"name":"المطعم الرئيسي","universityId":"<UNI_ID>","prepMinutes":10}'
curl -s $API/admin/breaks -H "$H" -H "$J" -d '{"universityId":"<UNI_ID>","startMin":600,"endMin":630}'   # 10:00-10:30
curl -s $API/admin/staff -H "$H" -H "$J" -d '{"email":"canteen@x.com","name":"موظف","password":"باسورد-12+","canteenId":"<CANTEEN_ID>"}'
```
(الدقائق من منتصف الليل بتوقيت القاهرة: 600 = 10:00.)
8. موظف المطعم يدخل على `https://panel.DOMAIN`، والتطبيق يتظبط على `EXPO_PUBLIC_API_URL=https://api.DOMAIN/api/v1`.

## الباك أب
- `backup` بياخد نسخة يوميًا في `./backups` ويحتفظ بـ 14 يوم.
- **النسخ على نفس السيرفر مش كفاية** لو السيرفر نفسه ضاع: انسخي الفولدر لمكان تاني (rclone لـ Google Drive/S3، أو `scp` بـ cron).
- **جرّبي الاستعادة مرة قبل الإطلاق:**
  `gunzip -c backups/<file>.sql.gz | docker compose exec -T db psql -U campusbite campusbite`

## التحديث
`git pull && docker compose up -d --build` (الـ migrations بتتطبق لوحدها عند تشغيل الـ api).
اللوجز: `docker compose logs -f api`.

## الإشعارات (Push)
- السكيما اتغيرت (جدول `PushDevice`): على جهازك شغّلي `npx prisma migrate dev --name add_push_devices` وحطي الـ migration الجديد مع الكود قبل النشر.
- التطبيق بيطلب إذن الإشعارات بعد أول طلب، والسيرفر بيبعت لما المطعم يغيّر الحالة لـ "بيتحضّر" / "جاهز" / "ملغي".
- للتجربة الحقيقية محتاجة build بـ EAS (مش Expo Go): `npm i -g eas-cli && eas login && npx eas init` (بيكتب الـ projectId في app.json) ثم `eas build -p android --profile preview`.
- أندرويد محتاج Firebase (FCM) وأيفون محتاج حساب Apple Developer. `eas credentials` بيمشّيك في الإعداد، وتفاصيله بتتغير فراجعي توثيق Expo Push وقت التنفيذ.

## الإيميل (تأكيد الإيميل + نسيت الباسورد)
- السكيما اتغيرت تاني (`emailVerifiedAt` وجدول `EmailToken`): `npx prisma migrate dev --name add_email_verification` وحطي الـ migration مع الكود.
- اعملي حساب على Resend، وضيفي دومينك وحطي سجلات الـ DNS اللي بيطلبها (SPF/DKIM) عشان الإيميلات توصل Inbox مش Spam (التفاصيل في توثيق Resend)، وبعدين `RESEND_API_KEY` و`MAIL_FROM` في `.env`.
- في الإنتاج السيرفر مابيشتغلش من غير المفتاحين. وفي التطوير من غيرهم الكود بيتطبع في اللوج بس.
- الطالب مايقدرش يعمل طلب قبل تأكيد الإيميل. حسابات الموظفين والأدمن بتتعمل مؤكدة.
- ملحوظة: الـ endpoint بتاع "نسيت الباسورد" شغال للموظفين كمان، بس لوحة المطعم مفيهاش شاشة ليه لسه.

## تحديثات (نوفمبر 2026)
- **الصور**: بتتخزن في قاعدة البيانات (مش على الديسك)، فبتفضل بعد إعادة تشغيل الاستضافة. حدود الميزانية: `MAX_IMAGE_STORAGE_BYTES` (إجمالي على المنصة، الافتراضي 300MB) و`MAX_MENU_ITEMS_PER_CANTEEN` (الافتراضي 100).
- **الأكثر طلباً**: علامة تلقائية على أعلى 3 أصناف مبيعاً في آخر 30 يوم (بعد 3 وحدات على الأقل، من غير الطلبات الملغية).
- **العروض**: المطعم يحط `offerPriceCents` أقل من السعر؛ السيرفر هو اللي بيحسب بيه الإجمالي.
- **إعدادات المنصة**: `GET/PATCH /api/v1/admin/settings` (نسبة العمولة `commissionPercent`، الافتراضي 0، للتسجيل فقط ومفيش تحصيل بيتم من التطبيق).
- **الاختبارات**: `npm test` (وحدات) و`npm run test:e2e` (قاعدة Postgres حقيقية مضمّنة، 15 اختبار).
- **حد الطلبات**: `THROTTLE_ORDER_PER_MIN`.
- **مبيعات مُسلَّمة** = طلبات مكتملة، مش دليل على فلوس اتحصّلت.
- **استضافة تجريبية فقط** (مش للإنتاج): Render Free (https://render.com/docs/free) بتنام بعد 15 دقيقة، وNeon للقاعدة (https://neon.tech/pricing). مفيش ضمان للتشغيل.
- **APK**: `cd campusbite-student-app && npx eas-cli build -p android --profile preview` (بيطلع APK حسب https://docs.expo.dev/build-reference/apk/ ويحتاج حساب Expo)، أو `--local` على جهاز فيه Android SDK (https://docs.expo.dev/build-reference/local-builds). لسه ماتبنّاش APK هنا.

## ترتيب النشر الحالي (بعد فصل صلاحيات قاعدة البيانات)
الخادم **مابقاش بيشغّل migrations وقت التشغيل**. الترتيب إلزامي:
1. خطوة واحدة بصلاحية المالك (رابط اتصال مباشر مش pooled) من جهاز موثوق: `MIGRATE_DATABASE_URL=... npm run db:migrate:deploy` (جوه campusbite-backend).
2. مرة واحدة: تشغيل `db/roles-and-grants.sql` بصلاحية المالك لإنشاء `campusbite_app` (قراءة/كتابة بيانات فقط، بدون DDL ولا جدول migrations). اكتبي كلمة سر الدور في عميل SQL فقط، ومتتحطش في git أو شات.
3. خدمة الويب على Render/غيره بتاخد `DATABASE_URL` الخاص بـ `campusbite_app` فقط. **متحطّيش رابط المالك على الخدمة.**
4. بعد ما الخطوتين يخلصوا، غيّري كلمة سر دور المالك من لوحة قاعدة البيانات.
متغيرات الخدمة: DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, RESEND_API_KEY, MAIL_FROM, EXPO_ACCESS_TOKEN (اختياري), CORS_ORIGINS.
التحقق من الفصل: `npm run test:split-role` (على Postgres محلي حقيقي؛ لسه ما اتجرّبش على Neon).
حقيقة مهمة: الاستضافة المجانية (Render Free) ما فيهاش shell أو one-off jobs، فخطوة 1 و2 بتتم من خارجها. https://render.com/docs/free
