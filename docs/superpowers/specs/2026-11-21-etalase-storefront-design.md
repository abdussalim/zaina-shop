# Spec: Etalase Publik Toko Zaina (Katalog & Checkout via WhatsApp)

- **Tanggal**: 2026-11-21
- **Status**: Disetujui
- **Lingkup**: `apps/api`, `apps/web`, `packages/shared`

---

## 1. Latar Belakang & Tujuan
Saat ini aplikasi Toko Zaina berjalan sebagai aplikasi internal kasir (Point-of-Sale) dan inventori toko. Setiap pengguna yang membuka alamat web `https://zaina-shop.pages.dev` langsung diarahkan ke halaman `/login`.

Tujuan dari fitur ini adalah menyediakan **Etalase Publik (Storefront)** yang terpadu dalam satu domain sehingga:
1. Pelanggan umum dapat membuka web tanpa login untuk melihat katalog produk, foto dari Cloudflare R2, pilihan satuan (pcs/dus/renceng), dan ketersediaan stok secara real-time.
2. Pelanggan dapat memilih produk ke keranjang belanja, mengisi nama serta alamat/catatan pengiriman, dan melakukan checkout instan yang membuka WhatsApp Toko Zaina dengan rincian pesanan yang terformat rapi.
3. Staf dan kasir tetap dapat masuk dan mengelola operasional toko melalui tautan login "Akses Staf" yang terhubung ke dashboard kasir yang sudah ada.

---

## 2. Arsitektur & Pembagian Rute

### 2.1. Rute Frontend (`apps/web`)
* **`/` (Storefront / Etalase Publik)**:
  * Header etalase: Nama toko, status buka/tutup, kontak singkat, tombol pencarian, tombol keranjang, dan tombol "Akses Staf".
  * Filter kategori produk (pills horizontal yang scrollable).
  * Pencarian instan (nama produk / kategori).
  * Grid/List produk: foto R2, nama barang, badge kategori, rentang harga/satuan dasar, badge stok (Tersedia / Menipis / Habis), tombol "Tambah ke Keranjang" (+).
  * Modal/Sheet Detail Produk: Foto resolusi penuh, deskripsi produk, pilihan satuan yang tersedia beserta harga masing-masing satuan.
  * Floating Cart Bar / Bottom Sheet: Menampilkan jumlah item, total belanja, form nama pemesan & alamat pengiriman, serta tombol **"Pesan via WhatsApp"**.
* **`/login`**: Halaman login staf kasir/admin.
* **`/admin/*` atau rute terproteksi session**:
  * Dashboard (`/dashboard`), Kasir (`/sales`), Produk (`/products`), Inventori (`/inventory`), Laporan (`/reports`), Pengaturan (`/settings`).
  * Jika staf sudah login, terdapat opsi navigasi cepat antara "Lihat Etalase Publik" dan "Panel Kasir".

### 2.2. Sub-Router API Publik (`apps/api`)
Endpoint publik baru yang dipasang di `/api/v1/storefront/*` (tanpa autentikasi cookie session):
* **`GET /api/v1/storefront/info`**:
  * Mengembalikan data publik toko: `{ storeName, address, phone }`.
  * Nomor telepon digunakan sebagai tujuan pengiriman WhatsApp.
* **`GET /api/v1/storefront/catalog`**:
  * Mengembalikan daftar kategori aktif dan produk aktif.
  * Hanya menampilkan produk berstatus `is_active = 1`.
  * Properti yang diekspos: `id`, `name`, `description`, `categoryId`, `categoryName`, `categoryColor`, `imageUrl`, `units` (`name`, `conversionFactor`, `price`, `isDefaultSale`), dan `stockStatus` (`OK`, `LOW`, `OUT_OF_STOCK`).
  * Menyaring (tidak mengekspos) data internal toko: `costPrice` (HPP), `barcode`, `supplier`, riwayat mutasi stok, dan catatan rahasia.

---

## 3. Logika Format Pesanan WhatsApp

Format pesan WhatsApp dibangkitkan secara otomatis di frontend:
```text
Halo Toko Zaina, saya ingin memesan:

1. [Nama Produk] ([Nama Satuan]) - [Qty] x Rp [Harga Satuan] = Rp [Subtotal]
2. ...

*Total Perkiraan:* Rp [Total Belanja]

*Data Pemesan:*
- Nama: [Nama Pelanggan]
- Alamat/Catatan: [Alamat Pengiriman / Catatan Pesanan]

Mohon konfirmasi ketersediaan barang dan total ongkirnya. Terima kasih!
```
* **Normalisasi Nomor Telepon**:
  * Mengonversi awalan lokal `08...` menjadi format internasional Indonesia `628...`.
  * Menghapus karakter non-digit (`-`, ` `, `+`).
* **Target URL**:
  * `https://wa.me/{cleanPhone}?text={encodedText}`.

---

## 4. Keamanan & Performa
1. **Pemisahan Data Publik vs Internal**:
   * API publik tidak menerima query parameter yang bisa membocorkan data non-aktif.
   * Tidak ada endpoint publik yang melakukan mutasi stok atau mutasi kasir.
2. **Kepatuhan Desain & Responsivitas Mobile**:
   * Mengikuti panduan mobile-first (`mobile-css.contract.test.ts`), `touch-action: pan-y`, dan minimal tap target 48px (`--tap-size: 3rem`).
   * Gambar produk dioptimalkan dengan rasio aspek konsisten (1:1 / square cover) dengan fallback avatar/placeholder jika produk belum memiliki foto.
3. **Penyimpanan Keranjang Lokal**:
   * Keranjang belanja pembeli disimpan di `localStorage` per peramban sehingga tidak hilang jika halaman direfresh.

---

## 5. Rencana Pengujian
1. **Unit Test API (`apps/api`)**:
   * Menguji bahwa `GET /api/v1/storefront/info` dan `GET /api/v1/storefront/catalog` dapat diakses tanpa session cookie.
   * Memastikan data `costPrice` dan barang non-aktif tidak ikut terkirim.
2. **Unit Test Helper (`@zaina/shared` atau `@zaina/web`)**:
   * Menguji fungsi normalisasi nomor WA dan formatter teks pesanan WhatsApp.
3. **Komponen Test Web (`apps/web`)**:
   * Menguji render katalog etalase publik, penambahan item ke keranjang, dan tombol buka WhatsApp.
   * Memastikan kepatuhan `mobile-css.contract.test.ts`.
