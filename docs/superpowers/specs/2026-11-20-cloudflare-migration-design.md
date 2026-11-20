# Design Spec: Migrasi Toko Zaina ke Cloudflare Serverless Edge

- **Tanggal**: 2026-11-20
- **Status**: Disetujui
- **Target Platform**: Cloudflare Pages (Advanced Mode `_worker.js`) + Cloudflare D1 (SQLite Edge)

---

## 1. Ringkasan Eksekutif
Memigrasikan monorepo **Toko Zaina** dari arsitektur Docker Compose (Node.js Express + PostgreSQL di VPS Linux) ke arsitektur **Full-Stack Serverless Edge di Cloudflare** (Hono + Cloudflare D1 + React 19 Vite PWA). Mengubah manajemen paket dari `npm` ke `pnpm workspace`, mengonversi skema database ke SQLite/D1, mengganti dependensi C++ native (`argon2`) dengan Web Crypto API (PBKDF2), dan mempertahankan 100% kontrak API v1 agar frontend tidak mengalami regresi.

---

## 2. Arsitektur Sistem

```text
Pengguna / PWA Client (Browser)
       │
       ▼ HTTPS
Cloudflare Edge Network
┌─────────────────────────────────────────────────────────────┐
│ Cloudflare Pages                                            │
│                                                             │
│   ┌──────────────────────────┐   ┌────────────────────────┐ │
│   │ Static Assets Host       │   │ Pages Functions        │ │
│   │ (HTML, JS, CSS, PWA,     │   │ (_worker.js via Hono)  │ │
│   │  Manifest, Icons)        │   │ Handlers: /api/v1/*    │ │
│   └──────────────────────────┘   └───────────┬────────────┘ │
└──────────────────────────────────────────────┼──────────────┘
                                               │
                                               ▼
                                  ┌─────────────────────────┐
                                  │ Cloudflare D1 (SQLite)  │
                                  │ Database: zaina-shop-db │
                                  └─────────────────────────┘
```

### 2.1 Komponen
1. **Frontend (`apps/web`)**:
   - React 19, Vite, Tailwind CSS, `vite-plugin-pwa`.
   - Menghasilkan build artefak statis di `apps/web/dist`.
   - Mengonsumsi endpoint `/api/v1/*` menggunakan fetch API dengan `credentials: 'include'`.
2. **Backend API (`apps/api`)**:
   - Framework: **Hono** di atas Cloudflare Workers runtime.
   - Entry point: `apps/api/src/index.ts`.
   - Dibundle menggunakan `esbuild` menjadi file tunggal: `apps/web/dist/_worker.js`.
   - Terhubung langsung ke Cloudflare D1 via binding `env.DB`.
   - Middleware: CORS/Origin validator, JWT/Session cookie parser, Error handler standar format envelope `@zaina/shared`.
3. **Shared Library (`packages/shared`)**:
   - Berisi skema validasi Zod dan definisi tipe TypeScript untuk API envelope, produk, unit, penjualan, dan inventaris.
   - Dipakai bersama oleh frontend dan backend.
4. **Tooling & Monorepo**:
   - `pnpm-workspace.yaml` mengelola `apps/*` dan `packages/*`.
   - Root `wrangler.toml` mengatur binding D1, Pages output dir, dan compatibility date.

---

## 3. Database & Skema (Cloudflare D1)

### 3.1 Pemetaan Tipe Data
| PostgreSQL 18 | Cloudflare D1 (SQLite) | Catatan |
|---|---|---|
| `UUID` | `TEXT` | Tetap menggunakan `crypto.randomUUID()` di aplikasi |
| `TIMESTAMPTZ` | `TEXT` | Format string ISO-8601 (`YYYY-MM-DDTHH:mm:ss.sssZ`) |
| `BIGINT` | `INTEGER` | Nilai Rupiah integer (aman hingga $9 \times 10^{15}$) |
| `NUMERIC(18,3)` | `REAL` | Nilai kuantitas dan rasio konversi satuan |
| `BOOLEAN` | `INTEGER` | `0` (false) dan `1` (true) |

### 3.2 Tabel-tabel Inti
1. `users` (id, username, display_name, password_hash, password_salt, is_active, created_at, updated_at)
2. `categories` (id, name, color, is_active, created_at, updated_at)
3. `products` (id, category_id, sku, barcode, name, location, base_unit, cost_price, sale_price, minimum_stock, image_url, is_active, created_at, updated_at)
4. `product_units` (id, product_id, name, factor, sale_price, is_default, is_active, discount_type, discount_value, discount_min_qty, discount_max_qty, created_at, updated_at)
5. `inventory_balances` (product_id, quantity_base, updated_at)
6. `stock_movements` (id, product_id, movement_type, quantity, factor, quantity_base, balance_after, unit_name, note, created_by, created_at)
7. `sales` (id, sale_number, idempotency_key, sold_at, status, subtotal, discount, total, amount_paid, change_amount, note, created_by, cancelled_at, cancellation_reason, cancelled_by, created_at, updated_at)
8. `sale_items` (id, sale_id, product_id, product_name, unit_name, factor, quantity, cost_price, sale_price, discount_type, discount_value, discount_amount, total_price, created_at)
9. `store_settings` (id, store_name, address, phone, receipt_footer, timezone, updated_at)

### 3.3 Transaksionalitas
Operasi penjualan (*Checkout*) dan mutasi stok dijalankan menggunakan fasilitas atomik `env.DB.batch([...])` untuk menjamin saldo stok tidak pernah tidak sinkron dengan riwayat transaksi.

---

## 4. Mekanisme Keamanan & Autentikasi

1. **Password Hashing**:
   - Menggunakan Web Crypto API native (`crypto.subtle.importKey` & `deriveBits` dengan algoritma PBKDF2).
   - Parameter: 100.000 iterasi, HMAC-SHA256, 16-byte random salt heksadesimal.
   - Format penyimpanan: `pbkdf2:100000:<salt_hex>:<hash_hex>`.
2. **Session / Token**:
   - Menggunakan JWT yang ditandatangani HMAC-SHA256 via Web Crypto (`crypto.subtle.sign`).
   - Disimpan di cookie `httpOnly`, `SameSite=Lax`, `Secure`, `Path=/`.
   - Masa berlaku: 7 hari.
   - Mendukung perpanjangan sesi dan verifikasi status aktif pengguna di D1.

---

## 5. Struktur Direktori Baru

```text
zaina-shop/
├── apps/
│   ├── web/                     → Vite + React 19 Frontend
│   │   ├── dist/                → Output build statis + _worker.js
│   │   ├── src/
│   │   └── package.json
│   └── api/                     → Hono Cloudflare Worker
│       ├── src/
│       │   ├── db/              → D1 client helper & queries
│       │   ├── modules/         → Auth, Catalog, Inventory, Sales, Reports, Settings
│       │   ├── utils/           → Web Crypto, JWT, Error handling
│       │   └── index.ts         → Main entrypoint Hono app
│       ├── scripts/             → Seed & migration scripts
│       └── package.json
├── packages/
│   └── shared/                  → Zod schemas & types
├── migrations/
│   └── 0001_initial_d1.sql      → Skema D1 lengkap
├── pnpm-workspace.yaml
├── package.json
├── wrangler.toml
└── README.md
```

---

## 6. Prosedur Build & Deployment

1. **Build Step**:
   - `pnpm --filter @zaina/shared build`
   - `pnpm --filter @zaina/web build`
   - `pnpm --filter @zaina/api build` (esbuild mengompilasi `apps/api/src/index.ts` ke `apps/web/dist/_worker.js`)
2. **Cloudflare Resource Setup**:
   - D1: `npx wrangler d1 create zaina-shop-db`
   - Bind ID database ke `wrangler.toml`
   - Execute skema ke D1: `npx wrangler d1 execute zaina-shop-db --file=migrations/0001_initial_d1.sql --remote`
   - Seed admin user awal
3. **Pages Deployment**:
   - `npx wrangler pages project create zaina-shop --production-branch development`
   - `npx wrangler pages deploy apps/web/dist --project-name zaina-shop`
