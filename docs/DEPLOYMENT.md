# Deployment VPS Linux

Panduan ini memakai `compose.production.yaml`. PostgreSQL dan API tidak membuka port publik; web hanya bind ke `127.0.0.1:8080` dan harus ditempatkan di belakang terminasi HTTPS milik VPS.

## 1. Persyaratan

- VPS Linux 64-bit dengan minimal 2 GB RAM dan ruang disk yang dipantau.
- Docker Engine dan plugin Docker Compose yang masih didukung.
- Domain/subdomain yang mengarah ke IP VPS.
- Reverse proxy host (Nginx, Caddy, atau layanan setara) dengan sertifikat TLS.

Pastikan hanya SSH, HTTP, dan HTTPS yang dibuka firewall. Port PostgreSQL `5432` tidak perlu dibuka.

## 2. Siapkan aplikasi dan rahasia

Masuk ke direktori aplikasi, lalu:

```bash
cp .env.example .env
chmod 600 .env
openssl rand -hex 24   # POSTGRES_PASSWORD dan ADMIN_PASSWORD awal
openssl rand -hex 48   # SESSION_SECRET
```

Edit `.env`:

```dotenv
APP_PORT=8080
APP_ORIGIN=https://inventaris.example.com
POSTGRES_DB=zaina
POSTGRES_USER=zaina
POSTGRES_PASSWORD=<hasil-random-hex>
SESSION_SECRET=<hasil-random-hex-panjang>
ADMIN_USERNAME=toko
ADMIN_PASSWORD=<kata-sandi-awal-kuat>
STORE_NAME=Toko Zaina
STORE_TIMEZONE=Asia/Jakarta
SEED_DEMO_DATA=false
```

Gunakan karakter heksadesimal untuk password database agar aman dimasukkan ke `DATABASE_URL`. `ADMIN_PASSWORD`, `STORE_NAME`, dan `STORE_TIMEZONE` hanya dipakai ketika data awal belum ada; restart tidak menimpa perubahan dari aplikasi.

## 3. Build dan mulai stack

```bash
docker compose --env-file .env -f compose.production.yaml config --quiet
docker compose --env-file .env -f compose.production.yaml build --pull
docker compose --env-file .env -f compose.production.yaml up -d
docker compose --env-file .env -f compose.production.yaml ps
```

API menjalankan migrasi yang belum diterapkan dan membuat akun/kategori awal sebelum menerima trafik. Tunggu sampai ketiga service berstatus sehat:

```bash
curl --fail http://127.0.0.1:8080/healthz
curl --fail http://127.0.0.1:8080/api/v1/health
```

Volume PostgreSQL 18 dipasang ke `/var/lib/postgresql`, bukan lokasi lama `/var/lib/postgresql/data`. Pertahankan mount ini saat upgrade minor; upgrade mayor membutuhkan prosedur PostgreSQL tersendiri. Lihat [catatan resmi image PostgreSQL](https://github.com/docker-library/docs/blob/master/postgres/README.md#pgdata).

## 4. Pasang HTTPS di reverse proxy host

Contoh blok Nginx host setelah DNS dan sertifikat siap:

```nginx
server {
    listen 443 ssl http2;
    server_name inventaris.example.com;

    ssl_certificate /etc/letsencrypt/live/inventaris.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/inventaris.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Tambahkan redirect port 80 ke HTTPS menggunakan konfigurasi standar penyedia sertifikat. Jangan menyimpan kunci sertifikat di repository. `APP_ORIGIN` harus sama persis dengan origin publik HTTPS, tanpa path dan tanpa slash di akhir.

API hanya mempercayai alamat loopback dan jaringan privat sebagai hop proxy. Konfigurasi host di atas harus menimpa atau menambahkan `X-Forwarded-For` seperti contoh agar pembatas login dan log audit memakai IP klien, bukan IP gateway Docker.

## 5. Verifikasi setelah deployment

```bash
SMOKE_USERNAME=toko SMOKE_PASSWORD='<ADMIN_PASSWORD>' \
  node scripts/smoke-test.mjs --base-url https://inventaris.example.com
```

Smoke test produksi bersifat baca-saja terhadap data usaha: hanya sesi login sementara yang dibuat lalu ditutup. Alur penerimaan/penjualan penuh tersedia melalui `scripts/acceptance-test.mjs --allow-write` dan hanya boleh dijalankan pada staging atau database sekali pakai.

Setelah login pertama, ubah kata sandi melalui Pengaturan. Perubahan kata sandi di `.env` setelah akun dibuat tidak mengubah akun yang sudah tersimpan.

## Upgrade aplikasi

```bash
./scripts/backup.sh
git pull --ff-only
docker compose --env-file .env -f compose.production.yaml build --pull
docker compose --env-file .env -f compose.production.yaml up -d
docker compose --env-file .env -f compose.production.yaml ps
```

Jalankan healthcheck dan smoke test baca-saja setelah setiap upgrade. Jangan mengganti major image PostgreSQL hanya dengan mengubah tag; lakukan backup teruji dan prosedur `pg_upgrade` sesuai dokumentasi PostgreSQL.

## Perintah diagnosis

```bash
docker compose --env-file .env -f compose.production.yaml ps
docker compose --env-file .env -f compose.production.yaml logs --tail=200 api
docker compose --env-file .env -f compose.production.yaml logs --tail=200 database
docker compose --env-file .env -f compose.production.yaml restart api web
```

Jika login berulang kembali ke halaman masuk, periksa HTTPS, `APP_ORIGIN`, dan header `X-Forwarded-Proto`. Cookie sesi produksi sengaja memakai atribut `Secure`.
