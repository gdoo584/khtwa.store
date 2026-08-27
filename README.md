# متجر خطوة

## تشغيل قاعدة البيانات والـ API

1. ثبّت Node.js (الإصدار 18 أو أحدث).
2. افتح الطرفية داخل مجلد المشروع.
3. شغّل:

```bash
npm install
npm start
```

افتح `http://localhost:3000`. سيتم إنشاء ملف `khotwa.sqlite` والجداول والمنتجات تلقائياً.

## المسارات

- `GET /api/products` عرض المنتجات.
- `POST /api/orders` حفظ طلب جديد.
- `GET /api/orders` عرض الطلبات المحفوظة للإدارة المحلية.

مفاتيح الدفع السرية لا توضع في الواجهة الأمامية. ربط بنكك الحقيقي يحتاج API الرسمي وبيانات اعتماد التاجر.

## بديل بدون Docker وnpm

إذا كان Python مثبتاً، شغّل:

```bash
python server.py
```

ثم افتح `http://localhost:3000`. هذا البديل يستخدم SQLite المدمج في Python.

## التشغيل باستخدام Docker

بعد تثبيت Docker Desktop شغّل من مجلد المشروع:

```bash
docker build -t khotwa-store .
docker run --rm -p 3000:3000 -v khotwa-data:/app/data khotwa-store
```

ثم افتح `http://localhost:3000`. يحفظ مجلد Docker المسمى `khotwa-data` قاعدة البيانات حتى بعد إيقاف الحاوية.
