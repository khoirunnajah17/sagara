# Sagara Meat House

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

## Auto Deploy ke Jagoan Hosting (VPS)

### Prasyarat di Server Jagoan Hosting

Lakukan ini **sekali** via SSH ke VPS kamu:

```bash
# 1. Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Install PM2 secara global
sudo npm install -g pm2

# 3. Clone repo ke server
cd /var/www
git clone https://github.com/khoirunnajah17/sagara.git
cd sagara

# 4. Buat file .env
cp .env.example .env
nano .env   # isi sesuai konfigurasi MySQL di server

# 5. Buat database & import schema
mysql -u root -p -e "CREATE DATABASE sagara_db CHARACTER SET utf8mb4;"
mysql -u root -p sagara_db < database.sql

# 6. Install dependencies & jalankan pertama kali
npm ci --omit=dev
mkdir -p logs
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup   # ikuti instruksi yang muncul agar PM2 auto-start saat reboot
```

### Setup GitHub Secrets (sekali saja)

Di GitHub repo → **Settings → Secrets → Actions**, tambahkan secret berikut:

| Secret | Isi |
|---|---|
| `JAGOAN_HOST` | IP atau hostname VPS (contoh: `103.x.x.x`) |
| `JAGOAN_USER` | Username SSH (biasanya `root` atau `ubuntu`) |
| `JAGOAN_SSH_KEY` | Isi file private key SSH (contoh: `~/.ssh/id_rsa`) |
| `JAGOAN_SSH_PORT` | Port SSH — isi `22` (atau port custom jika diubah) |
| `JAGOAN_APP_DIR` | Path folder aplikasi di server (contoh: `/var/www/sagara`) |

#### Cara buat SSH key (jika belum punya):

```bash
# Di komputer lokal
ssh-keygen -t ed25519 -C "github-actions-sagara"
# Hasilkan ~/.ssh/id_ed25519 (private) dan ~/.ssh/id_ed25519.pub (public)

# Copy public key ke server
ssh-copy-id -i ~/.ssh/id_ed25519.pub user@IP_VPS

# Copy isi private key ke GitHub Secret JAGOAN_SSH_KEY
cat ~/.ssh/id_ed25519
```

### Cara Kerja Auto Deploy

```
Push ke branch main
        │
        ▼
GitHub Actions CI (.github/workflows/ci.yml)
   ├── Install dependencies
   ├── Import DB schema
   ├── Smoke test server (HTTP 200)
   └── Login API test
        │
        ▼ (jika semua lulus)
GitHub Actions Deploy (.github/workflows/deploy.yml)
   ├── SSH ke VPS Jagoan Hosting
   ├── git pull origin main
   ├── npm ci --omit=dev
   ├── pm2 reload (zero-downtime restart)
   └── pm2 save
```

---

## Struktur Project

```
sagara/
├── .github/
│   └── workflows/
│       ├── ci.yml            # CI — test setiap push
│       └── deploy.yml        # Auto deploy via SSH ke Jagoan Hosting VPS
├── src/
│   ├── config/db.js          # MySQL2 connection pool
│   ├── middleware/auth.js
│   ├── routes/               # auth, accounts, journal, sales, purchases, inventory, reports
│   └── public/               # HTML/CSS/JS frontend
├── database.sql               # Schema + seed data
├── index.js                   # Entry point
├── ecosystem.config.js        # Konfigurasi PM2
├── Dockerfile
├── docker-compose.yml
└── .env.example
```
