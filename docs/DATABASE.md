# Database Toko Zaina

Database: PostgreSQL 18

Domain: inventaris satu toko dan penjualan sederhana

## Entity relationship diagram

```text
users 1 ──────< sales >────── 1 users (cancelled_by)
  │               │
  │               └────< sale_items >──── products
  │                                      │
  └────< stock_movements >───────────────┤
                         │               │
                         └── product_units

categories 1 ──────< products 1 ──────< product_units
                         │
                         └──── 1 inventory_balances

store_settings (singleton)
session (shared-account sessions)
schema_migrations (applied migration ledger)
```

## Integrity rules

- UUID dibuat oleh aplikasi sehingga migrasi tidak bergantung pada extension PostgreSQL.
- Harga memakai `BIGINT` Rupiah; kuantitas memakai `NUMERIC(18,3)`.
- `inventory_balances.quantity_base` tidak boleh negatif.
- `stock_movements` bersifat append-only pada layer aplikasi dan menyimpan faktor satuan saat transaksi.
- Penjualan menyimpan snapshot nama, faktor, harga jual, dan harga modal pada `sale_items`.
- Penjualan selesai atau batal divalidasi oleh check constraint yang saling eksklusif.
- Produk yang pernah digunakan dinonaktifkan, bukan dihapus; foreign key memakai `RESTRICT`.

## Indeks dan query utama

- SKU, barcode, nama kategori, nama satuan, nomor penjualan, dan idempotency key memiliki indeks unik.
- Daftar barang memakai indeks kategori/status serta nama lowercase.
- Riwayat stok memakai `(product_id, created_at)` dan `(movement_type, created_at)`.
- Laporan penjualan memakai `sold_at` dan `(status, sold_at)`.
- Dashboard barang menipis membaca saldo melalui primary key `inventory_balances.product_id`.

## Migrasi dan rollback

- Up: `apps/api/src/db/migrations/001_initial.sql`
- Down: `apps/api/src/db/migrations/001_initial.down.sql`
- Runner mencatat file yang berhasil pada `schema_migrations` dalam transaksi yang sama.
- Rollback bersifat destruktif dan hanya dipakai pada database kosong atau hasil backup yang sudah diverifikasi.

## Skala

Skema dinormalisasi untuk satu toko. Ledger dan sale items memiliki indeks akses utama; partitioning belum diperlukan. Jika data mencapai jutaan mutasi, partisi bulanan pada `stock_movements.created_at` dan `sales.sold_at` dapat ditambahkan tanpa mengubah kontrak API.
