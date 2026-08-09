# Desain Aplikasi Inventaris Toko Zaina

Tanggal: 10 Agustus 2026  
Status: Disetujui untuk langsung diimplementasikan

## Tujuan

Membangun aplikasi web inventaris dan penjualan sederhana untuk satu toko perabotan rumah serta pecah belah. Aplikasi digunakan bersama dari HP dan laptop melalui internet, memakai satu akun toko, dan dipasang pada VPS Linux milik pengguna dengan Docker.

## Ruang lingkup versi pertama

- Login satu akun bersama.
- Dashboard ringkas untuk stok, penjualan, barang menipis, dan barang rusak.
- Katalog barang dengan kategori, SKU atau barcode opsional, lokasi rak, harga modal, harga jual, stok minimum, dan foto opsional.
- Satuan dasar serta satuan turunan dengan faktor konversi, misalnya `lusin = 12 buah`.
- Penerimaan stok, stok awal, koreksi stok opname, barang rusak atau pecah, retur masuk, serta retur penjualan.
- Penjualan sederhana yang otomatis mengurangi stok.
- Riwayat mutasi, laporan penjualan, barang terlaris, nilai persediaan, dan estimasi laba.
- Ekspor laporan ke CSV.
- Tampilan responsif berbahasa Indonesia, mata uang Rupiah, dan zona waktu Asia/Jakarta.

## Di luar ruang lingkup

- Banyak cabang atau banyak gudang.
- Peran pemilik, kasir, dan gudang yang terpisah.
- E-commerce, sinkronisasi marketplace, akuntansi penuh, piutang, pembayaran daring, serta printer struk khusus.
- Deployment otomatis ke VPS tanpa kredensial atau akses server dari pengguna.

## Arsitektur

Proyek memakai npm workspaces dengan tiga bagian utama:

1. `apps/web`: React, TypeScript, dan Vite. Mengelola antarmuka, navigasi, formulir, cache data API, serta pengalaman responsif.
2. `apps/api`: Express 5 dan TypeScript. Menyediakan REST API, autentikasi berbasis sesi, validasi, aturan transaksi, laporan, dan akses database.
3. `packages/shared`: kontrak data, skema validasi, tipe, serta utilitas yang dipakai oleh web dan API.

PostgreSQL menjadi sumber data utama. Nginx menyajikan hasil build React dan meneruskan `/api` ke Express. Docker Compose menjalankan `web`, `api`, dan `db` pada satu jaringan privat. Hanya Nginx yang membuka port publik.

## Model data

### Pengguna dan sesi

- `users`: satu akun awal, nama tampilan, nama pengguna unik, hash kata sandi, status aktif, serta waktu perubahan kata sandi.
- Sesi disimpan di PostgreSQL dan dikirim melalui cookie `HttpOnly`, `SameSite=Lax`, serta `Secure` pada produksi.

### Katalog

- `categories`: nama, warna, serta status aktif.
- `products`: SKU, barcode opsional, nama, kategori, lokasi rak, satuan dasar, harga modal, harga jual standar, stok minimum, foto opsional, dan status aktif.
- `product_units`: nama satuan, faktor konversi ke satuan dasar, harga jual opsional, dan penanda satuan default penjualan.

Faktor konversi harus bilangan positif. Setiap barang selalu memiliki tepat satu satuan dasar dengan faktor `1`.

### Stok

- `stock_movements`: catatan append-only berisi barang, jenis mutasi, kuantitas dalam satuan dasar, kuantitas serta satuan input, biaya satuan, referensi transaksi, catatan, dan waktu.
- `inventory_balances`: saldo terkini per barang untuk pembacaan cepat. Nilainya diperbarui dalam transaksi database yang sama dengan pembuatan mutasi.

Jenis mutasi meliputi `OPENING`, `RECEIPT`, `SALE`, `SALE_REVERSAL`, `DAMAGE`, `ADJUSTMENT_IN`, `ADJUSTMENT_OUT`, `RETURN_IN`, dan `RETURN_OUT`.

### Penjualan

- `sales`: nomor transaksi, tanggal, subtotal, diskon, total, jumlah dibayar, kembalian, status, catatan, dan waktu pembatalan.
- `sale_items`: barang, satuan yang dipilih, faktor konversi saat transaksi, jumlah input, jumlah dasar, harga per satuan, harga modal saat transaksi, dan subtotal.

Harga serta faktor konversi disalin ke item transaksi agar laporan lama tidak berubah ketika katalog diedit.

## Aturan transaksi

- Semua saldo stok disimpan dalam satuan dasar menggunakan angka desimal presisi.
- Penyelesaian penjualan mengunci saldo barang terkait, memeriksa ketersediaan, menyimpan penjualan, membuat mutasi, dan mengurangi saldo dalam satu transaksi database.
- Stok negatif ditolak.
- Transaksi selesai tidak dihapus atau diedit. Pembatalan membuat mutasi `SALE_REVERSAL` dan mengubah status penjualan menjadi batal.
- Penyesuaian stok wajib memiliki alasan.
- Barang yang sudah memiliki riwayat transaksi dinonaktifkan, bukan dihapus.
- Permintaan pembuatan penjualan memakai kunci idempotensi agar klik ganda tidak menghasilkan transaksi ganda.

## Antarmuka

Gaya visual memakai warna hangat alami: latar gading, teks arang, aksen hijau zaitun, serta aksen terakota untuk peringatan. Tipografi jelas, kontras tinggi, dan target sentuh minimal 44 piksel.

Navigasi desktop menggunakan sidebar. Pada HP, navigasi utama menjadi bilah bawah dengan menu Dashboard, Barang, Jual, Stok, dan Lainnya.

### Layar utama

- Login: nama toko, kolom nama pengguna dan kata sandi, serta status koneksi.
- Dashboard: kartu ringkasan, daftar stok menipis, aktivitas terbaru, dan tombol aksi cepat.
- Barang: pencarian, filter kategori dan status stok, tabel atau kartu responsif, tambah dan edit barang.
- Detail barang: saldo per satuan, harga, riwayat mutasi, dan tindakan stok cepat.
- Penjualan: pencarian barang, keranjang, pemilih satuan, jumlah, diskon, pembayaran, konfirmasi, dan bukti transaksi yang dapat dicetak dari browser.
- Stok: penerimaan, penyesuaian, barang rusak, serta riwayat mutasi.
- Laporan: rentang tanggal, ringkasan penjualan, laba, barang terlaris, nilai persediaan, dan ekspor CSV.
- Pengaturan: identitas toko, batas stok default, serta perubahan kata sandi.

Formulir memakai validasi langsung dan tetap mempertahankan input jika permintaan gagal. Operasi berisiko seperti pembatalan penjualan meminta konfirmasi eksplisit.

## Aliran data

React memanggil endpoint `/api/v1`. API memvalidasi input menggunakan skema bersama, memeriksa sesi, menjalankan service domain, lalu memakai repository PostgreSQL. Respons berhasil memiliki bentuk `{ data, meta? }`; kesalahan memiliki `{ error: { code, message, fields?, requestId } }`.

Web memakai cache query dan melakukan invalidasi setelah mutasi. Perubahan saldo tidak diperbarui secara optimistis; angka baru selalu berasal dari respons server agar dua perangkat tidak menampilkan saldo palsu.

## Penanganan kesalahan dan keamanan

- Validasi dilakukan di web untuk kenyamanan dan di API sebagai batas kepercayaan.
- API memiliki request ID, pencatatan terstruktur, batas ukuran payload, rate limit login, Helmet, serta respons kesalahan tanpa stack trace pada produksi.
- Kata sandi disimpan dengan Argon2id.
- Mutasi stok dan penjualan menggunakan transaksi PostgreSQL serta penguncian baris.
- Health check tersedia untuk web, API, dan database.
- Rahasia hanya berasal dari environment variable dan tidak disimpan di Git.
- Backup terjadwal memakai `pg_dump`, retensi harian, serta prosedur restore terdokumentasi.

## Pengujian

- Unit test untuk konversi satuan, perhitungan total, validasi, serta aturan stok.
- Integration test API untuk login, CRUD katalog, penerimaan stok, penjualan atomik, penolakan stok negatif, pembatalan, dan laporan.
- Component test untuk formulir kritis dan alur keranjang.
- End-to-end smoke test untuk login, membuat barang, menerima stok, menjual, lalu memverifikasi dashboard dan riwayat.
- Pemeriksaan TypeScript, lint, build produksi, migrasi database, dan validasi Docker Compose menjadi quality gate.

## Deployment dan operasional

- `compose.yaml` untuk development dan `compose.production.yaml` untuk VPS.
- Image produksi memakai multi-stage build dan berjalan sebagai pengguna non-root.
- PostgreSQL memakai volume persisten serta tidak membuka port ke internet.
- Nginx mendukung domain dan HTTPS di belakang terminasi TLS yang dikonfigurasi pemilik VPS.
- README memuat instalasi awal, migrasi, seed akun, upgrade, backup, restore, dan troubleshooting.

## Kriteria penerimaan

1. Pengguna dapat login dari HP dan laptop memakai akun yang sama.
2. Pengguna dapat membuat barang dengan satuan dasar dan satuan turunan.
3. Penerimaan 1 lusin untuk barang dengan faktor 12 menambah saldo 12 buah.
4. Penjualan 2 buah mengurangi saldo menjadi 10 buah dan tercatat pada laporan.
5. Dua penjualan bersamaan tidak dapat membuat stok negatif.
6. Pencatatan barang pecah mengurangi saldo dan muncul pada riwayat.
7. Pembatalan penjualan mengembalikan stok melalui catatan pembalik.
8. Dashboard menampilkan penjualan hari ini, stok menipis, nilai persediaan, dan aktivitas terbaru.
9. Seluruh test, lint, typecheck, dan build produksi lulus.
10. Stack dapat dijalankan dengan Docker Compose dan memiliki dokumentasi backup serta restore.
