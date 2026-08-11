# Inventaris Toko Zaina

Aplikasi inventaris dan kasir sederhana untuk toko perabotan rumah serta pecah belah. Satu akun toko dapat digunakan dari HP dan laptop, dengan saldo stok yang selalu dihitung dalam satuan dasar dan riwayat mutasi yang tidak ditimpa.

## Fitur

- Dashboard omzet, laba kotor, nilai persediaan, stok tipis, dan aktivitas terbaru.
- Katalog barang dengan kategori, SKU/barcode, lokasi rak, harga modal, harga jual, serta stok minimum.
- Multi-satuan, misalnya `1 lusin = 12 buah`, dengan harga jual dan rentang diskon persen atau nominal untuk setiap satuan.
- Ledger stok untuk stok awal, penerimaan, kerusakan/pecah, retur, dan penyesuaian.
- Kasir dengan diskon per baris barang, kembalian, cetak nota, pembatalan transaksi, dan perlindungan retry agar transaksi tidak ganda.
- Laporan penjualan/persediaan dan ekspor CSV yang aman dibuka di spreadsheet.
- Pengaturan identitas toko, zona waktu WIB/WITA/WIT, batas stok default, dan kata sandi.
- PWA mobile-first: dapat dipasang di Android/desktop, app shell tetap terbuka offline,
  dan katalog serta saldo stok terakhir tersedia sebagai baca-saja dengan timestamp.
- Docker Compose PostgreSQL 18, healthcheck, backup/restore, smoke test produksi baca-saja, dan acceptance test staging.

## Menjalankan cepat dengan Docker

Persyaratan: Docker Engine dengan plugin Compose.

```bash
docker compose up --build -d
docker compose ps
```

Buka `http://localhost:8080`. Konfigurasi lokal bawaan membuat akun `toko` dengan kata sandi `ganti-kata-sandi-lokal` dan tiga barang demo. Ganti kata sandi segera bila stack dapat diakses perangkat lain.

Untuk menghentikan aplikasi tanpa menghapus data:

```bash
docker compose down
```

Jangan menambahkan `-v` pada perintah tersebut kecuali memang ingin menghapus volume database.

## Menjalankan untuk pengembangan

Persyaratan: Node.js 24+, npm 11+, dan PostgreSQL 18.

1. Salin `.env.example` menjadi `.env`.
2. Ubah `APP_ORIGIN` menjadi `http://localhost:8080`, sesuaikan `DATABASE_URL`, dan gunakan rahasia lokal.
3. Muat variabel `.env` ke terminal, lalu jalankan:

```bash
npm ci
npm run dev
```

Di PowerShell, variabel dapat dimuat satu per satu dengan `$env:NAMA='nilai'`. Alternatif paling mudah untuk menjalankan seluruh stack lokal tetap `docker compose up --build` karena Compose sudah memiliki default pengembangan.

## Pemeriksaan kualitas

```bash
npm test
npm run lint
npm run typecheck
npm run build
node scripts/check-web-budget.mjs apps/web/dist
npm run test:e2e
node scripts/smoke-test.mjs --help
node scripts/acceptance-test.mjs --help
```

Setelah stack hidup, jalankan smoke test dengan kredensial yang benar:

```bash
SMOKE_USERNAME=toko SMOKE_PASSWORD='kata-sandi-anda' \
  node scripts/smoke-test.mjs --base-url http://localhost:8080
```

Smoke test produksi hanya memeriksa health, login/sesi, katalog, dashboard, persediaan, dan pengaturan; tidak membuat ledger usaha. Untuk menguji alur tulis lengkap pada staging atau database sekali pakai:

```bash
ACCEPTANCE_USERNAME=toko ACCEPTANCE_PASSWORD='kata-sandi-anda' \
  node scripts/acceptance-test.mjs --allow-write --base-url http://localhost:8080
```

Acceptance test meninggalkan jejak penerimaan dan penjualan yang memang tidak boleh dihapus dari ledger. Jangan menjalankannya pada produksi.

### Batas offline

Offline hanya mencakup aset app shell dan snapshot katalog plus saldo stok terakhir.
Harga modal, laporan, nota, akun, kredensial, token, mutasi, checkout, dan pengaturan
selalu membutuhkan koneksi. Tidak ada antrean tulis atau sinkronisasi transaksi tertunda.
Logout atau sesi kedaluwarsa menghapus snapshot bisnis lokal.

## Deployment dan operasional

- [Deployment VPS](docs/DEPLOYMENT.md)
- [Backup dan restore](docs/BACKUP_RESTORE.md)
- [Panduan operasi](docs/OPERATIONS.md)
- [Model database](docs/DATABASE.md)

Rahasia dan file backup diabaikan Git. Jangan commit `.env`, dump database, atau sertifikat TLS.
