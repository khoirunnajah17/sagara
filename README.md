# Sagara Accounting

Aplikasi akuntansi berbasis web seperti Accurate Pro, dengan dukungan marketplace **Shopee** dan **Tokopedia**.

## Fitur
- Bagan Akun (Chart of Accounts)
- Jurnal Umum & Buku Besar
- Penjualan — channel DIRECT / Shopee / Tokopedia
- Pembelian & Persediaan
- Laporan Keuangan (Laba Rugi, Neraca, Trial Balance)

---

## Cara Jalankan di Lokal

### Opsi 1 — Docker Compose (Direkomendasikan)

```bash
# 1. Clone repo
git clone https://github.com/khoirunnajah17/sagara.git
cd sagara

# 2. Salin file environment
cp .env.example .env
# Edit .env jika perlu (opsional — sudah ada nilai default)

# 3. Jalankan semua layanan (app + MySQL)
docker compose up -d

# 4. Buka browser
open http://localhost:3000
```

> Database schema + data contoh diimport otomatis saat container pertama kali dijalankan.

### Opsi 2 — Tanpa Docker

```bash
# Prasyarat: Node.js 18+, MySQL 8.0

# 1. Install dependencies
npm install

# 2. Buat database
mysql -u root -p -e "CREATE DATABASE sagara_db CHARACTER SET utf8mb4;"
mysql -u root -p sagara_db < database.sql

# 3. Konfigurasi .env
cp .env.example .env
# Isi DB_USER, DB_PASSWORD sesuai MySQL Anda

# 4. Jalankan server
npm start
# Buka http://localhost:3000
```

**Login default:** `admin` / `Admin@1234`

---

## Auto Deploy ke Railway

### Persiapan (sekali saja)

1. Buat akun gratis di [railway.app](https://railway.app)
2. Buat project baru → tambah service **Node.js** + **MySQL**
3. Di Railway → Settings → pastikan branch deploy = `main`
4. Di Railway → Settings → Generate **Service Token**
5. Di GitHub repo → Settings → Secrets → Actions → tambah secret:
   - `RAILWAY_TOKEN` = token dari Railway

### Cara Kerja Auto Deploy

```
Push ke branch main
        │
        ▼
GitHub Actions CI (.github/workflows/ci.yml)
   ├── Install dependencies
   ├── Import DB schema
   ├── Smoke test server
   └── Login API test
        │
        ▼ (jika semua lulus)
GitHub Actions Deploy (.github/workflows/deploy.yml)
   └── railway up → deploy ke Railway
```

### Environment Variables di Railway

Set variabel-variabel ini di Railway Dashboard → Variables:

| Variable | Nilai |
|---|---|
| `PORT` | `3000` |
| `DB_HOST` | (dari Railway MySQL — otomatis via `${{MYSQL_HOST}}`) |
| `DB_PORT` | `3306` |
| `DB_USER` | (dari Railway MySQL) |
| `DB_PASSWORD` | (dari Railway MySQL) |
| `DB_NAME` | `sagara_db` |
| `SESSION_SECRET` | string acak panjang |

> Railway menyediakan variable reference `${{MySQL.MYSQL_HOST}}` yang bisa dipakai langsung.

---

## Struktur Project

```
sagara/
├── .github/
│   └── workflows/
│       ├── ci.yml        # CI — test setiap push
│       └── deploy.yml    # Deploy otomatis ke Railway (push ke main)
├── src/
│   ├── config/db.js      # MySQL2 connection pool
│   ├── middleware/auth.js
│   ├── routes/           # auth, accounts, journal, sales, purchases, inventory, reports
│   └── public/           # HTML/CSS/JS frontend
├── database.sql           # Schema + seed data
├── index.js               # Entry point
├── Dockerfile
├── docker-compose.yml
├── railway.toml
└── .env.example
```
