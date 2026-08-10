# Panduan Operasi

## Pemeriksaan rutin

Harian:

- Pastikan dashboard dapat dibuka dari HP dan laptop.
- Tinjau stok tipis/habis serta barang pecah yang baru dicatat.
- Pastikan backup terakhir berhasil dan ukurannya masuk akal.

Mingguan:

- Periksa ruang disk VPS dan volume Docker.
- Tinjau log API untuk respons `5xx`, kegagalan database, dan request ID terkait.
- Salin backup terbaru ke lokasi off-site.

Bulanan:

- Perbarui image/dependensi melalui proses upgrade teruji.
- Tinjau akses akun bersama dan ganti kata sandi bila pernah dibagikan ke pihak yang tidak lagi berwenang.
- Verifikasi waktu toko serta batas stok default di Pengaturan.

## Health dan log

```bash
curl --fail https://inventaris.example.com/healthz
curl --fail https://inventaris.example.com/api/v1/health
docker compose --env-file .env -f compose.production.yaml ps
docker compose --env-file .env -f compose.production.yaml logs --since=30m api
```

Setiap respons API memiliki `X-Request-Id`. Sertakan nilainya ketika menelusuri kegagalan agar baris log dapat dicocokkan.

## Gerbang integrasi PostgreSQL

Test unit sehari-hari memakai database PostgreSQL ringan di dalam proses. Sebelum rilis, jalankan juga test terhadap PostgreSQL nyata pada database pengujian yang boleh membuat schema sementara:

```bash
TEST_DATABASE_URL=postgresql://zaina_test:password@localhost:5432/zaina_test \
  npm run test:postgres --workspace @zaina/api
```

Test ini membuat schema acak, menjalankan seluruh migrasi, memverifikasi dua sesi persisten, dan mencoba dua penjualan serentak atas satu stok. Schema sementara selalu dihapus setelah pengujian. Jangan arahkan `TEST_DATABASE_URL` ke database produksi.

## Tindakan insiden

### Web menghasilkan 502/503

1. Jalankan `docker compose ... ps` dan lihat health service.
2. Baca log API dan database; jangan langsung menghapus/recreate volume.
3. Periksa ruang disk dan memori.
4. Restart `api web` hanya setelah penyebab awal dicatat.

### Login berhasil tetapi kembali ke halaman masuk

- Pastikan pengguna membuka URL HTTPS yang sama dengan `APP_ORIGIN`.
- Pastikan reverse proxy meneruskan `X-Forwarded-Proto https`.
- Periksa jam sistem VPS dan tabel sesi.

### Database tidak sehat

- Jangan menjalankan `docker compose down -v`.
- Periksa log PostgreSQL dan kapasitas disk.
- Jika data rusak/tidak dapat dipulihkan, ikuti prosedur restore dari backup yang sudah diverifikasi.

### Saldo tampak salah

- Jangan mengedit database langsung.
- Buka riwayat mutasi barang dan cocokkan penerimaan, penjualan, pembatalan, serta kerusakan.
- Gunakan Penyesuaian Stok dengan alasan rinci sehingga audit trail tetap utuh.

## Batas operasional

- Jalankan satu instance API untuk instalasi toko ini; Compose memang dikonfigurasi untuk satu toko dan satu akun bersama.
- Ekspor CSV memuat seluruh transaksi dalam rentang tanggal terpilih; gunakan rentang yang wajar agar file mudah ditinjau. Backup database tetap menjadi arsip pemulihan utama.
- Mengarsipkan barang tidak menghapus riwayatnya dan tidak dapat dibatalkan melalui UI.
- Aplikasi membutuhkan koneksi ke VPS; belum menyediakan mode offline.
