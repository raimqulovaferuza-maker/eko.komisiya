# Eko Komisiya — Maktablarni Ekologik Baholash Tizimi

**Eko Komisiya** — maktablarning ekologik holatini yulduzcha (`1–5`) reytingi asosida shaffof baholash, ustozlar va o'quvchilarning ekologik xulq-atvorini nazorat qilish, administrator tasdig'iga asoslangan ro'yxatdan o'tish va shaxsiy profil boshqaruvini ta'minlovchi to'liq web ilova.

## Asosiy imkoniyatlar

- **Faqat tasdiqlangan loginlar & Admin-to-Admin tasdiqlash:** Foydalanuvchilar kirish sahifasida `Komissiya a'zosi` yoki `Administrator` roli uchun ariza topshiradi. Mavjud administrator arizani qabul qilmaguncha login tizimga kiritilmaydi (`403 Forbidden`).
- **Maktablarni baholash (`1 user = 1 marta`):** Komissiya a'zolari har bir maktabni faqat bir marta 1–5 yulduz bilan baholay oladi. Administrator baholarni tahrirlashi va o'chirishi mumkin.
- **Ustozlar va o'quvchilar xulq-atvorini belgilash (`/behavior.html`):** Ustozlar va o'quvchilarning ekologik intizomi, sinfi/fani, holati (`A'lo`, `Yaxshi`, `Qoniqarli`, `E'tibor talab`), balli (`1–5`) va izohini qayd etish, filtrlash va tahrirlash.
- **Shaxsiy profil va profil rasmi (`/profile.html`):** Har bir foydalanuvchi o'z profiliga PNG/JPG/WEBP rasm yuklashi yoki o'chirishi, F.I.Sh., telefon, bio va parolini yangilashi hamda faollik tarixini ko'rishi mumkin.
- **Maktab suratlari va Shaxsiy sahifa (`/school.html?id=...`):** Har bir maktab sahifasida maktab surati, direktor, o'tkazilgan ekologik tadbirlar va maktab xulq-atvor yozuvlari jamlanadi.
- **DDoS Guard va Production tayyorligi:** Sirg'aluvchi oyna rate limiter (`429`), magic-byte rasm tekshiruvi, `64 KB` JSON cheklovi (rasm marshrutlari uchun `6 MB`), jonli DB `/api/health` tekshiruvi, `Dockerfile`, `Procfile` va `render.yaml`.

## Loyiha tuzilmasi

```text
├── backend/
│   ├── server.js              # Express server, DDoS Guard, health check va graceful shutdown
│   ├── db.js                  # SQLite ulanishi, sxema, migratsiyalar va seed ma'lumotlar
│   ├── uploads/               # Yuklangan maktab, tadbir va profil rasmlari
│   ├── routes/
│   │   ├── auth.js            # Tasdiqlangan loginlar, ariza topshirish va JWT sessiya
│   │   ├── schools.js         # Maktablar CRUD, rasmlar, tadbirlar, direktor va baholar
│   │   ├── users.js           # Foydalanuvchilar, admin-to-admin tasdiqlash va rol nazorati
│   │   ├── behavior.js        # Ustozlar va o'quvchilar xulq-atvor yozuvlari CRUD
│   │   └── profile.js         # Shaxsiy profil ma'lumotlari va avatar yuklash
│   └── utils/
│       ├── ddosGuard.js       # DDoS rate limiter va HTTP security headers
│       ├── scoring.js         # Validatsiya va reyting hisoblash funksiyalari
│       └── uploads.js         # Magic-byte rasm tekshiruvi va saqlash
├── frontend/
│   ├── index.html             # Kirish va ro'yxatdan o'tish arizasi (user / admin)
│   ├── schools.html           # Maktablar ro'yxati va yulduzcha baholash
│   ├── school.html            # Har bir maktabning shaxsiy sahifasi va tadbirlari
│   ├── behavior.html          # Ustozlar va o'quvchilar xulq-atvorini belgilash
│   ├── profile.html           # Shaxsiy profil va rasm yuklash sahifasi
│   ├── admin.html             # Administrator boshqaruv paneli
│   ├── css/                   # style.css, glass.css, responsive.css
│   └── js/                    # api.js, auth.js, schools.js, school.js, behavior.js, profile.js, admin.js
├── Dockerfile
├── Procfile
├── render.yaml
└── .env.example
```

## Lokal ishga tushirish

1. **Bog'liqliklarni o'rnatish:**
   ```bash
   npm install
   ```

2. **Muhit o'zgaruvchilarini sozlash:**
   ```bash
   cp .env.example .env
   ```

3. **Serverni ishga tushirish:**
   ```bash
   npm start
   ```

4. **Test va tekshiruv:**
   ```bash
   npm test
   npm run lint
   ```

## Serverga joylashtirish (Production Deployment)

### 1. Muhit o'zgaruvchilari (`.env`)
Production serverda albatta kuchli `JWT_SECRET` va doimiy saqlash papkalarini belgilang:
```env
NODE_ENV=production
PORT=3000
JWT_SECRET=<kamida-32-belgili-tasodifiy-kalit>
CORS_ORIGIN=https://sizning-domeningiz.uz
DB_PATH=/var/data/eko_komissiya.db
UPLOADS_DIR=/var/data/uploads
```

### 2. Docker bilan ishga tushirish
```bash
docker build -t eko-komissiya .
docker run -d \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e JWT_SECRET="kuchli_maxfiy_kalit_32_belgidan_kop" \
  -v eko_data:/app/data \
  -v eko_uploads:/app/uploads \
  eko-komissiya
```

### 3. Render.com / Railway / VPS (PM2 + Nginx)
- **Render:** Loyiha ildizidagi `render.yaml` fayli `/var/data` doimiy diski va `/api/health` tekshiruvi bilan tayyor.
- **Railway / Heroku:** `Procfile` (`web: node backend/server.js`) avtomatik qo'llanadi.
- **VPS (Ubuntu + PM2):**
  ```bash
  npm ci --omit=dev
  pm2 start backend/server.js --name eko-komissiya
  pm2 save
  ```
  Nginx reverse proxy orqali `3000`-portga yo'naltirganda `client_max_body_size 8M;` sozlashni unutmang.
