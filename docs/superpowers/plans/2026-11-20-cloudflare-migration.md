# Toko Zaina Cloudflare Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Memigrasikan Toko Zaina dari Docker Compose VPS (Node.js Express + PostgreSQL) ke arsitektur Cloudflare Serverless Edge (Cloudflare Pages Advanced Mode `_worker.js` + Hono + Cloudflare D1 + React 19 Vite PWA) dengan pnpm workspace, lalu mendeploynya ke Cloudflare.

**Architecture:** Frontend React 19 Vite dibuild ke `apps/web/dist`. Backend Hono di `apps/api` dibundle via `esbuild` menjadi `apps/web/dist/_worker.js` dengan binding database Cloudflare D1 `DB`. Root `wrangler.toml` mengonfigurasi binding Pages dan D1. Seluruh operasi penulisan transaksi dan mutasi stok diisolasi secara atomik menggunakan `DB.batch()`.

**Tech Stack:** Cloudflare Pages, Cloudflare D1 (SQLite Edge), Hono v4, Web Crypto API (PBKDF2 & HMAC-SHA256), esbuild, React 19, Vite 8, pnpm workspaces, Wrangler CLI.

## Global Constraints

- Backend harus menggunakan Web Standards (Fetch API, Web Crypto) tanpa modul C++ native (`argon2`, `pg`, `pglite`).
- Kontrak API v1 (`/api/v1/*`) dan format envelope respons (`@zaina/shared`) harus 100% dipertahankan agar frontend tidak mengalami regresi.
- Cookie sesi harus bertipe `httpOnly`, `SameSite=Lax`, `Secure`, `Path=/`.
- Transaksi checkout penjualan dan mutasi stok saldo harus dieksekusi secara atomik via `DB.batch()`.
- Cloudflare Account ID: `bb017c178af5d5eefcc49d58010a2351` (`abdussalimsan@gmail.com`).

---

### Task 1: Workspace & Tooling Migration (npm -> pnpm)

**Files:**
- Create: `pnpm-workspace.yaml`
- Modify: `package.json`
- Create: `wrangler.toml`
- Delete: `package-lock.json`

**Interfaces:**
- Produces: `pnpm-lock.yaml`, root scripts (`build`, `dev`, `lint`), dan root `wrangler.toml`.

- [ ] **Step 1: Buat konfigurasi pnpm workspace**
  Buat `pnpm-workspace.yaml` dengan konfigurasi paket monorepo:
  ```yaml
  packages:
    - 'apps/*'
    - 'packages/*'
  ```

- [ ] **Step 2: Buat wrangler.toml di root**
  Konfigurasikan target deployment Pages dan binding D1:
  ```toml
  name = "zaina-shop"
  compatibility_date = "2024-12-01"
  compatibility_flags = ["nodejs_compat"]
  pages_build_output_dir = "apps/web/dist"

  [[d1_databases]]
  binding = "DB"
  database_name = "zaina-shop-db"
  database_id = "" # diisi setelah d1 create
  ```

- [ ] **Step 3: Update root package.json**
  Perbarui script build agar kompatibel dengan pnpm:
  ```json
  "scripts": {
    "build": "pnpm --filter @zaina/shared build && pnpm --filter @zaina/web build && pnpm --filter @zaina/api build",
    "dev:web": "pnpm --filter @zaina/web dev",
    "deploy": "wrangler pages deploy apps/web/dist --project-name zaina-shop"
  }
  ```

- [ ] **Step 4: Hapus package-lock.json dan jalankan pnpm install**
  Hapus `package-lock.json` lalu jalankan `pnpm install` untuk men-generate `pnpm-lock.yaml`.

---

### Task 2: Cloudflare D1 SQL Schema & Initial Seed

**Files:**
- Create: `migrations/0001_initial_d1.sql`
- Create: `migrations/0002_seed_initial.sql`

**Interfaces:**
- Produces: Skema DDL SQLite untuk Cloudflare D1 yang mencakup semua tabel: `users`, `categories`, `products`, `product_units`, `inventory_balances`, `stock_movements`, `sales`, `sale_items`, `store_settings`.

- [ ] **Step 1: Tulis migrations/0001_initial_d1.sql**
  Konversi skema PostgreSQL ke SQLite/D1 yang kompatibel:
  - Gunakan `TEXT` untuk UUID, timestamps (ISO-8601), strings.
  - Gunakan `INTEGER` untuk ID numerik, Rupiah (BigInt), booleans (0/1).
  - Gunakan `REAL` untuk kuantitas stok desimal (`quantity_base`, `factor`).
  - Tambahkan indeks unik dan indeks pencarian (`uk_products_sku`, `idx_products_category`, dll).

- [ ] **Step 2: Tulis migrations/0002_seed_initial.sql**
  - Sisipkan data default `store_settings` (nama toko "Toko Zaina", zona waktu "Asia/Jakarta").
  - Sisipkan default kategori produk dasar ("Umum").
  - Sisipkan initial admin user (`username: toko`, `display_name: Toko Zaina`, salt dan hash PBKDF2 awal).

---

### Task 3: Backend API Utilities (Web Crypto Hashing & JWT)

**Files:**
- Create: `apps/api/src/utils/crypto.ts`
- Create: `apps/api/src/utils/jwt.ts`
- Test: `apps/api/src/utils/crypto.test.ts`
- Modify: `apps/api/package.json`

**Interfaces:**
- Produces:
  - `hashPassword(password: string): Promise<string>`
  - `verifyPassword(password: string, storedHash: string): Promise<boolean>`
  - `signSessionToken(payload: SessionPayload, secret: string): Promise<string>`
  - `verifySessionToken(token: string, secret: string): Promise<SessionPayload | null>`

- [ ] **Step 1: Update apps/api/package.json**
  Ganti dependensi Express/PostgreSQL dengan Hono dan Cloudflare tools:
  - Dependencies: `hono`, `@zaina/shared`
  - DevDependencies: `@cloudflare/workers-types`, `esbuild`, `vitest`, `typescript`
  - Script build: `esbuild src/index.ts --bundle --minify --outfile=../web/dist/_worker.js --format=esm --target=es2022 --conditions=workerd --external:node:*`

- [ ] **Step 2: Implementasi apps/api/src/utils/crypto.ts**
  Gunakan native Web Crypto API (`crypto.subtle`):
  - Generate 16 bytes random salt.
  - Derive 32 bytes bits via PBKDF2 (SHA-256, 100.000 iterasi).
  - Simpan dalam format `pbkdf2:100000:<salt_hex>:<hash_hex>`.
  - Fungsi verifikasi membandingkan hash secara timing-safe.

- [ ] **Step 3: Implementasi apps/api/src/utils/jwt.ts**
  - Buat HMAC-SHA256 signature via Web Crypto API.
  - Encode / decode URL-safe Base64 token.
  - Verifikasi masa aktif token (7 hari).

- [ ] **Step 4: Tes unit untuk crypto dan JWT**
  Buat dan jalankan tes unit memastikan hashing, verifikasi password, dan siklus token berjalan valid.

---

### Task 4: D1 Repository & Database Queries

**Files:**
- Create: `apps/api/src/db/d1.ts`
- Create: `apps/api/src/modules/auth/auth.repo.ts`
- Create: `apps/api/src/modules/catalog/catalog.repo.ts`
- Create: `apps/api/src/modules/inventory/inventory.repo.ts`
- Create: `apps/api/src/modules/sales/sales.repo.ts`
- Create: `apps/api/src/modules/reports/reports.repo.ts`
- Create: `apps/api/src/modules/settings/settings.repo.ts`

**Interfaces:**
- Produces: Repository functions yang menerima `db: D1Database` dan mengembalikan data sesuai interface domain Zaina.

- [ ] **Step 1: Implementasi D1 helper apps/api/src/db/d1.ts**
  Helper untuk wrapping query D1 (`db.prepare().bind().first()`, `all()`, `run()`).

- [ ] **Step 2: Implementasi Auth & Settings Repo**
  - Cari user berdasarkan username (case-insensitive `LOWER(username)`).
  - Update password, status user.
  - Ambil & perbarui `store_settings`.

- [ ] **Step 3: Implementasi Catalog Repo**
  - CRUD categories & products beserta units.
  - Indeks pencarian nama lowercase & SKU.

- [ ] **Step 4: Implementasi Inventory & Sales Repo**
  - Transaksi `createSale`: menggunakan `db.batch([ ... ])` untuk menyimpan header `sales`, `sale_items`, mengurangi `inventory_balances.quantity_base`, dan mencatat `stock_movements`.
  - Pembatalan transaksi penjualan (*cancel sale*): `db.batch([ ... ])` mengembalikan saldo barang dan mencatat mutasi pengembalian.
  - Penerimaan dan penyesuaian stok (*stock adjustments*).

- [ ] **Step 5: Implementasi Reports Repo**
  - Ringkasan penjualan harian/bulanan berdasarkan filter tanggal.
  - Daftar produk dengan stok menipis (`quantity_base <= minimum_stock`).
  - Ekspor CSV laporan penjualan.

---

### Task 5: Hono API Routes & Entrypoint (_worker.js)

**Files:**
- Create: `apps/api/src/routes/auth.ts`
- Create: `apps/api/src/routes/categories.ts`
- Create: `apps/api/src/routes/products.ts`
- Create: `apps/api/src/routes/inventory.ts`
- Create: `apps/api/src/routes/sales.ts`
- Create: `apps/api/src/routes/reports.ts`
- Create: `apps/api/src/routes/settings.ts`
- Create: `apps/api/src/middleware/auth.ts`
- Create: `apps/api/src/index.ts`

**Interfaces:**
- Consumes: Repositories dari Task 4, Crypto utils dari Task 3, Schemas dari `@zaina/shared`.
- Produces: Hono application yang menangani `/api/v1/*` dan fallback ke `env.ASSETS.fetch(req)`.

- [ ] **Step 1: Implementasi Auth Middleware**
  Membaca cookie `zaina_session`, memvalidasi JWT, menyematkan user session ke context Hono (`c.set('user', user)`).

- [ ] **Step 2: Implementasi masing-masing Controller Routes**
  - Pasang route `/api/v1/auth/login`, `/logout`, `/session`, `/change-password`.
  - Pasang route `/api/v1/categories`, `/api/v1/products`, `/api/v1/inventory/*`.
  - Pasang route `/api/v1/sales`, `/api/v1/sales/:id/cancel`.
  - Pasang route `/api/v1/reports/*`, `/api/v1/settings/store`.
  - Pastikan format respon membungkus payload dalam `{ success: true, data: ... }` sesuai kontrak `@zaina/shared`.

- [ ] **Step 3: Implementasi apps/api/src/index.ts**
  - Inisialisasi Hono app dengan binding Cloudflare `Env { DB: D1Database; ASSETS: Fetcher; SESSION_SECRET?: string }`.
  - Hubungkan route API.
  - Pasang default fallback handler:
    ```typescript
    app.all('*', async (c) => {
      return c.env.ASSETS.fetch(c.req.raw)
    })
    ```

- [ ] **Step 4: Test build esbuild**
  Jalankan `pnpm --filter @zaina/api build` untuk memastikan bundling ke `apps/web/dist/_worker.js` berhasil tanpa error.

---

### Task 6: Cloudflare Provisioning, Testing & Live Deployment

**Files:**
- Modify: `wrangler.toml` (masukkan `database_id` yang didapat dari `wrangler d1 create`)

**Interfaces:**
- Produces: Project live di Cloudflare Pages dan database aktif di Cloudflare D1.

- [ ] **Step 1: Buat Cloudflare D1 Database**
  Eksekusi: `npx wrangler d1 create zaina-shop-db` menggunakan account `bb017c178af5d5eefcc49d58010a2351`.
  Catat Database ID dan update `wrangler.toml`.

- [ ] **Step 2: Eksekusi Migrasi & Seed ke Cloudflare D1**
  Eksekusi skema tabel:
  `npx wrangler d1 execute zaina-shop-db --remote --file=migrations/0001_initial_d1.sql`
  Eksekusi seed data inisial:
  `npx wrangler d1 execute zaina-shop-db --remote --file=migrations/0002_seed_initial.sql`

- [ ] **Step 3: Buat Cloudflare Pages Project**
  Eksekusi: `npx wrangler pages project create zaina-shop --production-branch development`

- [ ] **Step 4: Build Monorepo Penuh**
  Jalankan:
  `pnpm build`
  Pastikan `apps/web/dist` berisi file frontend dan file `_worker.js`.

- [ ] **Step 5: Deploy ke Cloudflare Pages**
  Eksekusi:
  `npx wrangler pages deploy apps/web/dist --project-name zaina-shop --branch development`

- [ ] **Step 6: Verifikasi Deployment Live**
  - Buka URL Cloudflare Pages hasil deploy.
  - Uji endpoint `/api/v1/settings/store` dan `/api/v1/auth/session`.
  - Verifikasi login default admin user di antarmuka web.
