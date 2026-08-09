# Inventaris Toko Zaina Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun aplikasi inventaris dan penjualan Toko Zaina yang responsif, teruji, serta siap dijalankan pada satu VPS Linux melalui Docker Compose.

**Architecture:** Monorepo npm workspaces memisahkan React/Vite frontend, Express 5 REST API, dan kontrak Zod bersama. PostgreSQL menyimpan sesi, katalog, saldo, ledger stok, penjualan, dan laporan; Nginx menyajikan web serta meneruskan `/api` ke API.

**Tech Stack:** Node.js 24, TypeScript 7, React 19, Vite 8, Express 5, PostgreSQL 18, Zod 4, TanStack Query 5, React Router 7, Vitest 4, Testing Library, Supertest, Docker Compose, dan Nginx.

## Global Constraints

- Bahasa antarmuka Indonesia, mata uang IDR, dan zona waktu `Asia/Jakarta`.
- Satu toko, satu lokasi stok, dan satu akun bersama.
- Kuantitas disimpan dalam satuan dasar; satuan turunan memiliki faktor konversi positif.
- Stok negatif selalu ditolak dan perubahan saldo harus atomik.
- Transaksi selesai tidak dihapus; pembatalan membuat mutasi pembalik.
- Frontend dan API dipisahkan, tetapi disajikan dari satu origin pada produksi.
- Rahasia hanya berasal dari environment variable.
- File harus berfokus pada satu tanggung jawab dan fungsi domain kritis diuji lebih dahulu.

---

### Task 1: Workspace dan kontrak domain bersama

**Files:**
- Create: `package.json`
- Create: `package-lock.json`
- Create: `.gitignore`
- Create: `.editorconfig`
- Create: `.env.example`
- Create: `tsconfig.base.json`
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/domain.ts`
- Create: `packages/shared/src/schemas.ts`
- Test: `packages/shared/src/domain.test.ts`

**Interfaces:**
- Produces: `toBaseQuantity(quantity: number, factor: number): number`, `calculateSaleTotals(items, discount): SaleTotals`, dan Zod schemas `productInputSchema`, `stockMovementInputSchema`, serta `saleInputSchema`.

- [ ] **Step 1: Tulis unit test konversi dan total penjualan**

```ts
expect(toBaseQuantity(2, 12)).toBe(24)
expect(() => toBaseQuantity(1, 0)).toThrow('Faktor konversi harus lebih dari 0')
expect(calculateSaleTotals([{ quantity: 2, unitPrice: 15000 }], 5000)).toEqual({
  subtotal: 30000,
  discount: 5000,
  total: 25000,
})
```

- [ ] **Step 2: Jalankan test dan pastikan gagal karena fungsi belum tersedia**

Run: `npm.cmd test --workspace @zaina/shared`
Expected: FAIL pada import `toBaseQuantity` atau `calculateSaleTotals`.

- [ ] **Step 3: Implementasikan kontrak dan validasi minimal**

```ts
export function toBaseQuantity(quantity: number, factor: number) {
  if (factor <= 0) throw new Error('Faktor konversi harus lebih dari 0')
  return quantity * factor
}
```

Schemas membatasi uang ke bilangan bulat non-negatif, kuantitas ke angka positif maksimal tiga desimal, dan item penjualan minimal satu.

- [ ] **Step 4: Jalankan test, typecheck, dan commit**

Run: `npm.cmd test --workspace @zaina/shared && npm.cmd run typecheck --workspace @zaina/shared`
Expected: PASS.

Commit: `git commit -m "chore: establish workspace and shared contracts"`

### Task 2: PostgreSQL, migrasi, seed, dan repository foundation

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/vitest.config.ts`
- Create: `apps/api/src/config.ts`
- Create: `apps/api/src/db/pool.ts`
- Create: `apps/api/src/db/types.ts`
- Create: `apps/api/src/db/migrate.ts`
- Create: `apps/api/src/db/seed.ts`
- Create: `apps/api/src/db/migrations/001_initial.sql`
- Create: `apps/api/src/db/test-database.ts`
- Test: `apps/api/src/db/migrate.test.ts`

**Interfaces:**
- Produces: `Database` dengan `query`, `connect`, dan transaksi; `runMigrations(database)`; `seedDatabase(database, config)`.
- Consumes: skema bersama dari Task 1.

- [ ] **Step 1: Tulis integration test migrasi**

```ts
await runMigrations(database)
const tables = await database.query<{ table_name: string }>(
  "select table_name from information_schema.tables where table_schema = 'public'",
)
expect(tables.rows.map((row) => row.table_name)).toEqual(expect.arrayContaining([
  'users', 'categories', 'products', 'product_units', 'inventory_balances',
  'stock_movements', 'sales', 'sale_items', 'session',
]))
```

- [ ] **Step 2: Jalankan test dan pastikan gagal karena migrasi belum ada**

Run: `npm.cmd test --workspace @zaina/api -- migrate.test.ts`
Expected: FAIL karena tabel belum dibuat.

- [ ] **Step 3: Buat skema dengan constraint bisnis**

`001_initial.sql` memakai UUID dari aplikasi, `BIGINT` untuk Rupiah, `NUMERIC(18,3)` untuk jumlah, unique index SKU/barcode, check factor `> 0`, check saldo `>= 0`, foreign key ketat, dan index waktu serta referensi transaksi.

- [ ] **Step 4: Implementasikan runner migrasi dan seed idempotent**

```ts
await database.query('begin')
try {
  await database.query(sql)
  await database.query('insert into schema_migrations(version) values ($1)', [version])
  await database.query('commit')
} catch (error) {
  await database.query('rollback')
  throw error
}
```

Seed membuat akun dari `ADMIN_USERNAME` dan `ADMIN_PASSWORD`, kategori awal, serta data demo hanya ketika `SEED_DEMO_DATA=true`.

- [ ] **Step 5: Jalankan test dan commit**

Run: `npm.cmd test --workspace @zaina/api -- migrate.test.ts`
Expected: PASS dan migrasi kedua tidak mengubah skema.

Commit: `git commit -m "feat(api): add database schema and migrations"`

### Task 3: API shell, autentikasi, dan error contract

**Files:**
- Create: `apps/api/src/app.ts`
- Create: `apps/api/src/server.ts`
- Create: `apps/api/src/http/errors.ts`
- Create: `apps/api/src/http/respond.ts`
- Create: `apps/api/src/http/request-context.ts`
- Create: `apps/api/src/http/trusted-origin.ts`
- Create: `apps/api/src/modules/auth/auth.repository.ts`
- Create: `apps/api/src/modules/auth/auth.service.ts`
- Create: `apps/api/src/modules/auth/auth.routes.ts`
- Test: `apps/api/src/modules/auth/auth.routes.test.ts`

**Interfaces:**
- Produces: `createApp(dependencies): Express`, `requireSession`, endpoint `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/session`, dan `GET /api/v1/health`.
- Consumes: `Database` dari Task 2.

- [ ] **Step 1: Tulis test login dan proteksi sesi**

```ts
const agent = request.agent(app)
expect((await agent.get('/api/v1/auth/session')).status).toBe(401)
expect((await agent.post('/api/v1/auth/login').send({ username: 'toko', password: 'rahasia' })).status).toBe(200)
expect((await agent.get('/api/v1/auth/session')).body.data.username).toBe('toko')
```

- [ ] **Step 2: Jalankan test dan pastikan endpoint belum ditemukan**

Run: `npm.cmd test --workspace @zaina/api -- auth.routes.test.ts`
Expected: FAIL dengan status 404.

- [ ] **Step 3: Implementasikan sesi, Argon2id, rate limit, dan error envelope**

```ts
res.status(error.status).json({
  error: { code: error.code, message: error.message, fields: error.fields, requestId: req.id },
})
```

Mutasi memeriksa header Origin terhadap `APP_ORIGIN`; login dibatasi per IP; cookie produksi memakai `HttpOnly`, `Secure`, dan `SameSite=Lax`.

- [ ] **Step 4: Uji login berhasil, gagal, logout, origin, dan health check**

Run: `npm.cmd test --workspace @zaina/api -- auth.routes.test.ts`
Expected: PASS untuk seluruh skenario.

- [ ] **Step 5: Commit**

Commit: `git commit -m "feat(api): add secure shared-account authentication"`

### Task 4: Katalog barang dan multi-satuan

**Files:**
- Create: `apps/api/src/modules/catalog/catalog.repository.ts`
- Create: `apps/api/src/modules/catalog/catalog.service.ts`
- Create: `apps/api/src/modules/catalog/catalog.routes.ts`
- Test: `apps/api/src/modules/catalog/catalog.routes.test.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Produces: `GET/POST /api/v1/categories`, `GET/POST /api/v1/products`, `GET/PATCH /api/v1/products/:id`, dan `POST /api/v1/products/:id/archive`.
- Product response memuat `units`, `balanceBase`, `stockStatus`, dan harga dalam Rupiah.

- [ ] **Step 1: Tulis test pembuatan barang dengan satuan lusin**

```ts
const response = await agent.post('/api/v1/products').send({
  sku: 'PRG-001', name: 'Piring Kaca Bening', categoryId,
  baseUnit: 'buah', costPrice: 7000, salePrice: 10000, minimumStock: 12,
  units: [{ name: 'buah', factor: 1, salePrice: 10000, isDefault: true },
          { name: 'lusin', factor: 12, salePrice: 115000, isDefault: false }],
})
expect(response.status).toBe(201)
expect(response.body.data.units[1].factor).toBe(12)
```

- [ ] **Step 2: Jalankan test dan pastikan gagal**

Run: `npm.cmd test --workspace @zaina/api -- catalog.routes.test.ts`
Expected: FAIL dengan status 404.

- [ ] **Step 3: Implementasikan repository dan service katalog**

Pembuatan produk, satuan dasar, satuan turunan, dan saldo nol dilakukan atomik. SKU dan barcode unik menghasilkan error `DUPLICATE_PRODUCT_CODE`. Produk dengan riwayat hanya dapat diarsipkan.

- [ ] **Step 4: Uji pencarian, filter stok, duplikasi, edit, dan arsip**

Run: `npm.cmd test --workspace @zaina/api -- catalog.routes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit: `git commit -m "feat(api): add product catalog and unit conversions"`

### Task 5: Ledger stok dan operasi inventaris

**Files:**
- Create: `apps/api/src/modules/inventory/inventory.repository.ts`
- Create: `apps/api/src/modules/inventory/inventory.service.ts`
- Create: `apps/api/src/modules/inventory/inventory.routes.ts`
- Test: `apps/api/src/modules/inventory/inventory.service.test.ts`
- Test: `apps/api/src/modules/inventory/inventory.routes.test.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Produces: `POST /api/v1/inventory/movements`, `GET /api/v1/inventory/movements`, dan `GET /api/v1/inventory/summary`.
- `recordMovement(input, actorId)` menerima jenis, productId, unitId, quantity, unitCost, note, dan referenceId opsional.

- [ ] **Step 1: Tulis test konversi penerimaan dan barang pecah**

```ts
await service.recordMovement({ type: 'RECEIPT', productId, unitId: dozenId, quantity: 1, unitCost: 84000, note: 'PO-01' }, userId)
expect(await balance(productId)).toBe(12)
await service.recordMovement({ type: 'DAMAGE', productId, unitId: pieceId, quantity: 2, note: 'Pecah saat bongkar' }, userId)
expect(await balance(productId)).toBe(10)
```

- [ ] **Step 2: Jalankan test dan pastikan gagal**

Run: `npm.cmd test --workspace @zaina/api -- inventory.service.test.ts`
Expected: FAIL karena `recordMovement` belum tersedia.

- [ ] **Step 3: Implementasikan transaksi saldo dan ledger append-only**

Repository menjalankan `SELECT ... FOR UPDATE`, menghitung delta dalam satuan dasar, menolak hasil negatif dengan `INSUFFICIENT_STOCK`, lalu memperbarui saldo dan menambah ledger pada transaksi yang sama.

- [ ] **Step 4: Uji alasan wajib, filter riwayat, saldo negatif, dan request ganda**

Run: `npm.cmd test --workspace @zaina/api -- inventory`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit: `git commit -m "feat(api): add auditable inventory ledger"`

### Task 6: Penjualan atomik, pembatalan, dashboard, dan laporan

**Files:**
- Create: `apps/api/src/modules/sales/sales.repository.ts`
- Create: `apps/api/src/modules/sales/sales.service.ts`
- Create: `apps/api/src/modules/sales/sales.routes.ts`
- Create: `apps/api/src/modules/reports/reports.repository.ts`
- Create: `apps/api/src/modules/reports/reports.routes.ts`
- Test: `apps/api/src/modules/sales/sales.service.test.ts`
- Test: `apps/api/src/modules/sales/sales.routes.test.ts`
- Test: `apps/api/src/modules/reports/reports.routes.test.ts`
- Modify: `apps/api/src/app.ts`

**Interfaces:**
- Produces: `POST/GET /api/v1/sales`, `GET /api/v1/sales/:id`, `POST /api/v1/sales/:id/cancel`, `GET /api/v1/dashboard`, `GET /api/v1/reports/sales`, `GET /api/v1/reports/inventory`, dan CSV melalui `format=csv`.

- [ ] **Step 1: Tulis test penjualan lusin, stok tidak cukup, dan idempotensi**

```ts
const sale = await service.completeSale({
  idempotencyKey: 'sale-001', discount: 5000, amountPaid: 120000,
  items: [{ productId, unitId: dozenId, quantity: 1 }],
}, userId)
expect(sale.total).toBe(110000)
expect(await balance(productId)).toBe(0)
expect((await service.completeSale(sameInput, userId)).id).toBe(sale.id)
```

- [ ] **Step 2: Jalankan test dan pastikan gagal**

Run: `npm.cmd test --workspace @zaina/api -- sales.service.test.ts`
Expected: FAIL karena service belum tersedia.

- [ ] **Step 3: Implementasikan penyelesaian dan pembatalan transaksi**

Urutkan productId sebelum row lock untuk mengurangi deadlock. Simpan snapshot faktor, harga jual, dan harga modal. Pembatalan hanya sekali serta membuat `SALE_REVERSAL`.

- [ ] **Step 4: Implementasikan query laporan dan CSV yang aman**

CSV mengutip nilai yang memiliki koma atau baris baru dan mencegah formula injection dengan mengawali nilai `=`, `+`, `-`, atau `@` menggunakan apostrof.

- [ ] **Step 5: Jalankan seluruh test API dan commit**

Run: `npm.cmd test --workspace @zaina/api`
Expected: PASS.

Commit: `git commit -m "feat(api): add sales and business reports"`

### Task 7: Frontend shell, design system, dan autentikasi

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/app/router.tsx`
- Create: `apps/web/src/app/AppShell.tsx`
- Create: `apps/web/src/api/client.ts`
- Create: `apps/web/src/styles/tokens.css`
- Create: `apps/web/src/styles/global.css`
- Create: `apps/web/src/components/ui/Button.tsx`
- Create: `apps/web/src/components/ui/Field.tsx`
- Create: `apps/web/src/components/ui/Modal.tsx`
- Create: `apps/web/src/components/ui/StatusBadge.tsx`
- Create: `apps/web/src/features/auth/LoginPage.tsx`
- Test: `apps/web/src/features/auth/LoginPage.test.tsx`

**Interfaces:**
- Produces: `apiRequest<T>()`, protected router, desktop sidebar, mobile bottom navigation, toast region, reusable field and dialog components.
- Consumes: auth endpoints dari Task 3.

- [ ] **Step 1: Tulis component test login**

```tsx
render(<LoginPage />)
await user.type(screen.getByLabelText('Nama pengguna'), 'toko')
await user.type(screen.getByLabelText('Kata sandi'), 'rahasia')
await user.click(screen.getByRole('button', { name: 'Masuk ke aplikasi' }))
expect(await screen.findByText('Selamat datang kembali')).toBeInTheDocument()
```

- [ ] **Step 2: Jalankan test dan pastikan gagal**

Run: `npm.cmd test --workspace @zaina/web -- LoginPage.test.tsx`
Expected: FAIL karena halaman belum tersedia.

- [ ] **Step 3: Implementasikan shell responsif dan gaya visual**

Gunakan latar gading, teks arang, aksen hijau zaitun, aksen terakota, radius sedang, bayangan tipis, target sentuh 44px, fokus keyboard terlihat, dan `prefers-reduced-motion`.

- [ ] **Step 4: Implementasikan sesi dan redirect autentikasi**

API client selalu memakai `credentials: 'include'`, memetakan envelope error, dan mengarahkan 401 ke login tanpa menghapus input formulir lainnya.

- [ ] **Step 5: Jalankan test, typecheck, build, dan commit**

Run: `npm.cmd test --workspace @zaina/web && npm.cmd run typecheck --workspace @zaina/web && npm.cmd run build --workspace @zaina/web`
Expected: PASS.

Commit: `git commit -m "feat(web): add responsive application shell"`

### Task 8: Halaman operasional dan laporan frontend

**Files:**
- Create: `apps/web/src/features/dashboard/DashboardPage.tsx`
- Create: `apps/web/src/features/dashboard/DashboardPage.test.tsx`
- Create: `apps/web/src/features/products/ProductsPage.tsx`
- Create: `apps/web/src/features/products/ProductForm.tsx`
- Create: `apps/web/src/features/products/ProductDetailPage.tsx`
- Create: `apps/web/src/features/inventory/InventoryPage.tsx`
- Create: `apps/web/src/features/inventory/MovementForm.tsx`
- Create: `apps/web/src/features/sales/SalesPage.tsx`
- Create: `apps/web/src/features/sales/SaleReceipt.tsx`
- Create: `apps/web/src/features/sales/SalesPage.test.tsx`
- Create: `apps/web/src/features/reports/ReportsPage.tsx`
- Create: `apps/web/src/features/settings/SettingsPage.tsx`
- Modify: `apps/web/src/app/router.tsx`

**Interfaces:**
- Consumes: seluruh endpoint katalog, stok, penjualan, dashboard, dan laporan.
- Produces: alur lengkap tambah barang, terima stok, jual, batalkan, lihat laporan, cetak bukti, dan ekspor CSV.

- [ ] **Step 1: Tulis test alur keranjang dan konversi satuan**

```tsx
await user.click(screen.getByRole('button', { name: /Piring Kaca Bening/ }))
await user.selectOptions(screen.getByLabelText('Satuan'), 'lusin')
await user.clear(screen.getByLabelText('Jumlah'))
await user.type(screen.getByLabelText('Jumlah'), '1')
expect(screen.getByText('12 buah dari stok')).toBeInTheDocument()
expect(screen.getByText('Rp115.000')).toBeInTheDocument()
```

- [ ] **Step 2: Jalankan test dan pastikan gagal**

Run: `npm.cmd test --workspace @zaina/web -- SalesPage.test.tsx`
Expected: FAIL karena halaman belum tersedia.

- [ ] **Step 3: Implementasikan halaman per fitur dengan query terisolasi**

Setiap fitur memiliki query keys sendiri. Mutasi stok dan penjualan menunggu respons server, menampilkan loading state, lalu menginvalidasi dashboard, katalog, dan riwayat terkait.

- [ ] **Step 4: Tambahkan empty state, loading skeleton, error recovery, dan konfirmasi**

Tabel berubah menjadi kartu pada layar sempit. Penjualan mempertahankan keranjang jika request gagal. Pembatalan meminta alasan serta konfirmasi eksplisit.

- [ ] **Step 5: Jalankan seluruh test web dan commit**

Run: `npm.cmd test --workspace @zaina/web && npm.cmd run build --workspace @zaina/web`
Expected: PASS.

Commit: `git commit -m "feat(web): add inventory and sales workflows"`

### Task 9: Docker, backup, dokumentasi, dan verifikasi akhir

**Files:**
- Create: `apps/api/Dockerfile`
- Create: `apps/web/Dockerfile`
- Create: `apps/web/nginx.conf`
- Create: `compose.yaml`
- Create: `compose.production.yaml`
- Create: `scripts/backup.ps1`
- Create: `scripts/backup.sh`
- Create: `scripts/restore.sh`
- Create: `scripts/smoke-test.mjs`
- Create: `README.md`
- Create: `docs/DEPLOYMENT.md`
- Create: `docs/BACKUP_RESTORE.md`
- Create: `docs/OPERATIONS.md`

**Interfaces:**
- Produces: stack Docker sehat, migrasi otomatis yang aman, seed eksplisit, backup terkompresi, restore terverifikasi, dan smoke test HTTP.

- [ ] **Step 1: Tulis smoke test yang menggambarkan alur penerimaan**

```js
await login()
const product = await createProduct({ baseUnit: 'buah', units: [{ name: 'lusin', factor: 12 }] })
await receiveStock(product.id, 'lusin', 1)
await completeSale(product.id, 'buah', 2)
assert.equal((await getProduct(product.id)).balanceBase, 10)
```

- [ ] **Step 2: Buat image non-root dan Compose dengan health check**

`db` memakai PostgreSQL 18 dan volume bernama; `api` menunggu health database serta menjalankan migrasi sebelum server; `web` menunggu API dan hanya membuka port `8080` pada development. Production override memakai restart policy dan tidak membuka database.

- [ ] **Step 3: Dokumentasikan instalasi serta prosedur backup/restore**

README memberi perintah copy `.env.example`, membuat kata sandi dan session secret, build, migrasi, seed, login, upgrade, log, dan shutdown. Dokumen deployment menjelaskan Nginx/TLS eksternal tanpa menyimpan sertifikat dalam repo.

- [ ] **Step 4: Jalankan quality gate lokal**

Run: `npm.cmd test`
Expected: seluruh unit, integration, dan component test PASS.

Run: `npm.cmd run lint && npm.cmd run typecheck && npm.cmd run build`
Expected: exit code 0 tanpa warning yang diklasifikasikan sebagai error.

Run: `docker compose config`
Expected: konfigurasi valid tanpa environment variable wajib yang kosong pada file test.

Run: `docker compose up -d --build && node scripts/smoke-test.mjs`
Expected: health web/API/database sehat dan smoke test berakhir dengan saldo 10.

- [ ] **Step 5: Periksa keamanan dan commit**

Pastikan `.env`, dump database, backup, log, dan volume tidak terlacak; hanya `web` memiliki port host; image berjalan non-root; cookie produksi aman; dan tidak ada rahasia dalam Git.

Commit: `git commit -m "chore: add production deployment and operations"`
