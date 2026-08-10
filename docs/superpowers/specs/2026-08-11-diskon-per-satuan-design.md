# Desain Diskon Per Satuan Toko Zaina

**Tanggal:** 11 Agustus 2026  
**Status:** Disetujui untuk perencanaan implementasi

## Tujuan

Setiap satuan penjualan barang menyimpan harga jual serta aturan diskon minimum dan maksimum. Pengelola dapat memilih aturan berbentuk persentase atau nominal rupiah untuk setiap satuan. Kasir memberikan diskon per baris transaksi, sedangkan server memvalidasi dan menghitung nilai akhirnya secara otoritatif.

Harga modal tetap disimpan pada barang dalam satuan dasar. Harga modal satuan lain diperoleh dari harga modal dasar dikalikan faktor konversi; aplikasi tidak menyimpan harga modal duplikat per satuan.

Kolom `products.cost_price` dan `products.sale_price` tetap menjadi harga modal dan harga jual kanonis untuk satuan dasar. Sesuai aturan katalog yang sudah ada, harga jual pada baris `product_units` satuan dasar harus sama dengan `products.sale_price`. Semua satuan penjualan, termasuk satuan dasar, memiliki aturan diskonnya sendiri.

## Keputusan bisnis

- Aturan diskon dimiliki setiap satuan penjualan, bukan seluruh barang.
- Jenis aturan yang tersedia adalah `PERCENTAGE` dan `FIXED`.
- Setiap satuan menyimpan nilai diskon minimum serta maksimum.
- Nilai diskon `0` selalu berarti tanpa diskon dan tetap diperbolehkan.
- Bila diskon bukan `0`, nilainya wajib berada di antara minimum dan maksimum, termasuk kedua batasnya.
- Diskon persentase dihitung dari subtotal kotor baris transaksi.
- Diskon nominal dihitung per unit yang dibeli, lalu dikalikan kuantitas pada baris tersebut.
- Kasir memilih nilai diskon secara bebas selama memenuhi aturan satuan.
- Diskon total transaksi yang lama tidak lagi dapat diinput untuk transaksi baru. Kolom agregat diskon pada penjualan tetap dipakai sebagai jumlah seluruh diskon baris.
- Aturan satuan lama dimigrasikan menjadi `PERCENTAGE` dengan rentang `0–0`, sehingga tidak mengizinkan diskon sampai pengelola mengubahnya.

## Model data

Migrasi `003_unit_discounts.sql` menambahkan kolom berikut pada `product_units`:

- `discount_type VARCHAR(16) NOT NULL DEFAULT 'PERCENTAGE'`
- `minimum_discount NUMERIC(18,3) NOT NULL DEFAULT 0`
- `maximum_discount NUMERIC(18,3) NOT NULL DEFAULT 0`

Constraint database memastikan:

- jenis hanya `PERCENTAGE` atau `FIXED`;
- minimum dan maksimum tidak negatif;
- minimum tidak melebihi maksimum;
- persentase maksimum tidak melebihi `100`;
- nilai nominal berbentuk bilangan rupiah bulat;
- diskon nominal maksimum tidak melebihi harga jual satuan.

Untuk menjaga audit transaksi, `sale_items` memperoleh snapshot berikut:

- `discount_type_snapshot VARCHAR(16) NOT NULL DEFAULT 'PERCENTAGE'`
- `minimum_discount_snapshot NUMERIC(18,3) NOT NULL DEFAULT 0`
- `maximum_discount_snapshot NUMERIC(18,3) NOT NULL DEFAULT 0`
- `discount_value NUMERIC(18,3) NOT NULL DEFAULT 0`
- `discount_amount BIGINT NOT NULL DEFAULT 0`
- `total BIGINT NOT NULL`, dibackfill dari `subtotal` untuk transaksi lama

Constraint transaksi memastikan nilai snapshot valid, `discount_value` adalah `0` atau berada dalam rentang snapshot, `discount_amount` tidak negatif dan tidak melebihi subtotal, serta `total = subtotal - discount_amount`.

Constraint snapshot juga memastikan jenis hanya `PERCENTAGE` atau `FIXED`, minimum dan maksimum tidak negatif serta berurutan, persentase maksimum tidak melebihi `100`, dan nilai minimum, maksimum, serta pilihan diskon `FIXED` berupa rupiah bulat. Snapshot diskon nominal maksimum tidak boleh melebihi harga jual satuan pada baris transaksi.

Transaksi lama tetap mempertahankan nilai `sales.discount` dan `sales.total` yang sudah tersimpan. Snapshot baris lama berisi diskon nol karena diskon global historis tidak dapat dialokasikan ulang secara andal ke barang tertentu.

## Kontrak API dan perhitungan

`ProductInput.units[]` ditambah:

- `discountType`
- `minimumDiscount`
- `maximumDiscount`

API katalog mengembalikan ketiga nilai tersebut pada setiap satuan. Validasi bersama dan constraint database menerapkan aturan yang sama agar permintaan langsung ke API tidak dapat melewati batas.

`SaleInput.items[]` ditambah `discountValue` yang boleh tidak dikirim dan memiliki nilai awal `0`. Diskon `PERCENTAGE` boleh memiliki paling banyak tiga angka desimal; diskon `FIXED` harus berupa rupiah bulat. Field `discount` tingkat transaksi boleh tidak dikirim atau bernilai literal `0` untuk kompatibilitas klien lama; nilai selain `0` ditolak dengan respons `422`, bukan diabaikan.

Saat transaksi dibuat, server:

1. Mengunci barang dan saldo dengan urutan deterministik seperti alur penjualan saat ini.
2. Membaca harga, faktor, jenis diskon, serta batas diskon satuan aktif.
3. Memvalidasi `discountValue` sebagai `0` atau dalam rentang.
4. Menghitung subtotal kotor dengan `quantity × unit_price`.
5. Menghitung potongan dengan aritmetika desimal, tanpa mengandalkan floating point biner:
   - `PERCENTAGE`: pembulatan setengah ke atas ke rupiah terdekat dari `subtotal × discountValue / 100`;
   - `FIXED`: pembulatan setengah ke atas ke rupiah terdekat dari `quantity × discountValue`.
6. Menolak konfigurasi atau hasil potongan yang melebihi subtotal.
7. Menyimpan snapshot lengkap dan total bersih per baris.
8. Menjumlahkan seluruh subtotal baris ke `sales.subtotal`, seluruh potongan ke `sales.discount`, dan seluruh total bersih ke `sales.total`.

Seluruh perhitungan, pengurangan stok, header penjualan, item, dan ledger tetap berada dalam satu transaksi database. Kegagalan satu baris membatalkan seluruh transaksi.

## Antarmuka pengguna

### Form barang

Setiap baris satuan menampilkan:

- harga jual;
- pilihan `Persentase (%)` atau `Nominal (Rp)`;
- diskon minimum;
- diskon maksimum.

Label, langkah angka, dan petunjuk berubah mengikuti jenis diskon. Kesalahan minimum lebih besar dari maksimum, persentase di atas 100, dan nominal di atas harga jual tampil di baris satuan terkait.

### Detail dan daftar barang

Kartu detail satuan menampilkan harga jual serta rentang diskon, misalnya `5%–20%` atau `Rp2.000–Rp5.000`. Harga modal dasar tetap terlihat pada ringkasan barang. Daftar barang tetap ringkas dan tidak menambah kolom diskon agar nyaman pada layar ponsel.

### Kasir

Input diskon global dihapus. Setiap baris keranjang memiliki input diskon dengan penanda `%` atau `Rp`, keterangan rentang yang diperbolehkan, subtotal kotor, nilai potongan, dan total bersih.

Nilai awal selalu `0`. Tombol menyelesaikan transaksi dinonaktifkan bila ada diskon di luar rentang, dan pesan menjelaskan baris yang harus diperbaiki. Nilai yang dikirim tetap divalidasi ulang oleh server.

### Nota dan laporan

Nota menampilkan harga, subtotal kotor, diskon, dan total bersih setiap barang. Ringkasan nota tetap menampilkan total seluruh diskon.

Ringkasan laporan penjualan tetap memakai `sales.subtotal`, `sales.discount`, dan `sales.total`. Kontribusi produk memakai `sale_items.total` sebagai omzet bersih sehingga diskon per barang tercermin pada omzet dan laba produk.

Khusus transaksi lama yang dahulu memakai diskon global, ringkasan header tetap akurat, tetapi kontribusi per produk tetap memakai subtotal kotor karena diskon historis tersebut tidak dapat dialokasikan ulang ke setiap baris secara andal.

## Penanganan kesalahan

- Konfigurasi katalog yang tidak valid menghasilkan `422` dengan error field yang dapat dipetakan ke satuan terkait.
- Diskon penjualan di bawah minimum atau di atas maksimum menghasilkan kode stabil `DISCOUNT_OUT_OF_RANGE` dan tidak mengubah stok.
- Satuan yang sudah tidak aktif tetap ditolak untuk penjualan baru.
- Idempotency penjualan tetap berlaku; pengulangan permintaan yang sama mengembalikan snapshot transaksi yang sama.
- Perubahan aturan katalog setelah transaksi tidak mengubah nota atau laporan historis.

## Migrasi dan kompatibilitas

- Migrasi bersifat additive dan memberi default aman `PERCENTAGE 0–0` pada satuan lama.
- Item penjualan lama dibackfill dengan diskon baris nol dan `total = subtotal`.
- Diskon global pada header transaksi lama tidak diubah.
- Seed demo dan acceptance test mengisi konfigurasi diskon eksplisit.
- Rollback migrasi hanya digunakan pada database kosong atau backup terverifikasi karena menghapus snapshot diskon item.

## Strategi pengujian

- Schema bersama: jenis diskon, urutan batas, batas 100%, nominal bulat, nominal tidak melebihi harga jual, dan nilai awal nol.
- Katalog API: create, read, update, serta persistensi aturan berbeda pada satuan barang yang sama.
- Penjualan API: tanpa diskon, persen valid, nominal valid dikalikan kuantitas, tepat pada batas, di bawah minimum, di atas maksimum, dan potongan melebihi subtotal.
- Transaksi: kegagalan diskon tidak membuat sale, item, movement, atau perubahan saldo parsial.
- Audit: perubahan aturan satuan setelah penjualan tidak mengubah snapshot nota lama.
- UI barang: field dinamis dan pesan validasi per satuan.
- UI kasir: kalkulasi kotor, potongan, bersih, serta pemblokiran input di luar rentang.
- Nota dan laporan: diskon per baris serta agregat sesuai hasil hitung tangan.
- Verifikasi akhir: seluruh test, lint, typecheck, build, migrasi PGlite, dan gerbang PostgreSQL nyata bila `TEST_DATABASE_URL` tersedia.

## Di luar ruang lingkup

- Diskon global tambahan di atas diskon barang.
- Penumpukan beberapa promo pada satu baris.
- Promo berbasis tanggal, pelanggan, kategori, atau jumlah belanja.
- Harga modal terpisah untuk setiap satuan.
- Perubahan atau penghapusan transaksi historis.

## Kriteria selesai

1. Setiap satuan dapat menyimpan harga jual, jenis diskon, minimum, dan maksimum.
2. Harga modal dasar barang tetap tersimpan dan dapat ditampilkan.
3. Kasir dapat memilih diskon per baris dalam format aturan satuan.
4. Server menolak diskon tidak valid tanpa perubahan data parsial.
5. Nota dan laporan menyimpan serta membaca snapshot diskon secara konsisten.
6. Data dan transaksi lama tetap dapat dibaca setelah migrasi.
7. Seluruh quality gate yang tersedia lulus.
