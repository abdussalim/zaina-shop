# Diskon Per Satuan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menyimpan harga modal dasar, harga jual dan aturan diskon minimum/maksimum per satuan, lalu menerapkan diskon per baris secara konsisten pada kasir, nota, dan laporan.

**Architecture:** Kontrak dan kalkulasi diskon deterministik berada di `@zaina/shared`; PostgreSQL menyimpan aturan aktif pada `product_units` dan snapshot lengkap pada `sale_items`. API tetap menjadi otoritas validasi dan perhitungan dalam satu transaksi, sedangkan React memakai kontrak yang sama untuk pratinjau dan validasi cepat tanpa menggantikan validasi server.

**Tech Stack:** Node.js 24+, npm 11+, TypeScript 7, Zod 4, Express 5, PostgreSQL 18/PGlite, React 19, React Hook Form, TanStack Query, Vitest, Testing Library.

## Global Constraints

- Jenis diskon persis `PERCENTAGE` atau `FIXED` dan dimiliki setiap satuan penjualan, termasuk satuan dasar.
- `0` selalu valid; nilai selain nol harus berada di dalam rentang minimum–maksimum secara inklusif.
- Persentase maksimal `100` dan memiliki paling banyak tiga angka desimal.
- Nominal harus berupa rupiah bulat, tidak boleh melebihi harga jual satuan, dan dihitung per unit yang dibeli.
- Semua hasil uang dibulatkan setengah ke atas ke rupiah terdekat memakai aritmetika bilangan bulat/desimal, bukan floating point biner.
- `products.cost_price` dan `products.sale_price` tetap menjadi harga modal dan harga jual kanonis satuan dasar; harga jual unit dasar harus sama dengan `products.sale_price`.
- Diskon global transaksi baru harus tidak dikirim atau bernilai `0`; nilai selain `0` menghasilkan HTTP `422`.
- Diskon tidak valid menghasilkan kode `DISCOUNT_OUT_OF_RANGE` dan tidak boleh meninggalkan perubahan stok atau data penjualan parsial.
- Perubahan katalog tidak boleh mengubah snapshot penjualan lama.
- Jangan menambah dependency runtime baru; gunakan `BigInt` bawaan untuk kalkulasi eksak.
- Pertahankan pola ESM `.js`, strict TypeScript, nama API camelCase, dan nama kolom database snake_case yang sudah digunakan proyek.

---

## File Map

- `packages/shared/src/schemas.ts`: tipe diskon serta validasi input katalog dan penjualan.
- `packages/shared/src/domain.ts`: validasi aturan yang dapat dipakai ulang dan kalkulasi uang eksak.
- `apps/api/src/db/migrations/003_unit_discounts.sql`: aturan per satuan dan snapshot diskon per item.
- `apps/api/src/db/seed.ts`: konfigurasi diskon eksplisit pada data demo.
- `apps/api/src/modules/catalog/*`: persistensi dan pembacaan aturan diskon katalog.
- `apps/api/src/modules/sales/*`: validasi server, snapshot, agregasi header, dan pembacaan nota.
- `apps/api/src/modules/reports/reports.repository.ts`: omzet produk berdasarkan total bersih item.
- `apps/web/src/features/products/*`: editor dan tampilan rentang diskon satuan.
- `apps/web/src/features/sales/*`: input diskon per baris, kalkulasi keranjang, dan nota.
- `apps/web/src/api/types.ts`: kontrak respons katalog dan penjualan.
- `apps/web/src/styles/features.css`: tata letak field diskon, keranjang, dan nota responsif.
- `scripts/acceptance-test.mjs`, `README.md`, `docs/DATABASE.md`: acceptance flow dan dokumentasi operasional.

### Task 1: Shared discount contract and exact calculator

**Files:**
- Modify: `packages/shared/src/schemas.test.ts`
- Modify: `packages/shared/src/domain.test.ts`
- Modify: `packages/shared/src/schemas.ts`
- Modify: `packages/shared/src/domain.ts`

**Interfaces:**
- Produces: `DiscountType`, `DiscountRule`, `getDiscountValidationMessage(rule, value)`, `calculateSaleLineTotals(item)`, dan `calculateSaleTotals(items)`.
- Produces: `ProductUnitInput.discountType`, `minimumDiscount`, `maximumDiscount`, serta `SaleInput.items[].discountValue`.
- Consumes: tidak ada interface baru; ini adalah fondasi untuk semua task berikutnya.

- [ ] **Step 1: Write failing schema tests for unit rules and sale compatibility**

Tambahkan konfigurasi eksplisit pada fixture `validProduct` dan kasus batas berikut:

```ts
const percentageRule = {
  discountType: 'PERCENTAGE' as const,
  minimumDiscount: 5,
  maximumDiscount: 20,
}

const fixedRule = {
  discountType: 'FIXED' as const,
  minimumDiscount: 2_000,
  maximumDiscount: 5_000,
}

it.each([
  { discountType: 'PERCENTAGE', minimumDiscount: 20, maximumDiscount: 5 },
  { discountType: 'PERCENTAGE', minimumDiscount: 0, maximumDiscount: 100.001 },
  { discountType: 'FIXED', minimumDiscount: 1.5, maximumDiscount: 2_000 },
  { discountType: 'FIXED', minimumDiscount: 2_000, maximumDiscount: 10_001 },
])('rejects an invalid unit discount rule: %o', (rule) => {
  const result = productInputSchema.safeParse({
    ...validProduct,
    units: validProduct.units.map((unit, index) =>
      index === 0 ? { ...unit, ...rule } : unit,
    ),
  })
  expect(result.success).toBe(false)
})

it('defaults omitted sale line discounts and accepts only a zero legacy discount', () => {
  const parsed = saleInputSchema.parse({
    idempotencyKey: '5a5ab2a3-67e4-4533-88be-9789209b0376',
    amountPaid: 10_000,
    items: [{
      productId: '55f49c79-6612-4c23-bdf4-5933dbda7794',
      unitId: 'bca82d90-f8e6-4251-99eb-e21609916b02',
      quantity: 1,
    }],
  })
  expect(parsed.discount).toBe(0)
  expect(parsed.items[0]?.discountValue).toBe(0)
})
```

Tambahkan kasus terpisah yang memastikan `discount: 1` dan `discountValue` dengan lebih dari tiga desimal ditolak.

- [ ] **Step 2: Run the schema test and confirm the red state**

Run:

```powershell
npm.cmd run test --workspace @zaina/shared -- src/schemas.test.ts
```

Expected: FAIL karena field aturan diskon belum ada dan diskon global nonnol masih diterima.

- [ ] **Step 3: Add the Zod discount contract**

Tambahkan bentuk berikut pada `schemas.ts`; gunakan `.default(...)` agar klien katalog lama memperoleh aturan aman `PERCENTAGE 0–0`.

```ts
export const discountTypeSchema = z.enum(['PERCENTAGE', 'FIXED'])
export type DiscountType = z.infer<typeof discountTypeSchema>

const threeDecimalNonNegativeSchema = z
  .number()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER)
  .refine((value) => Number.isInteger(value * 1_000), {
    message: 'Nilai maksimal memiliki tiga angka desimal',
  })

export const productUnitInputSchema = z
  .object({
    id: z.uuid().optional(),
    name: z.string().trim().min(1).max(40),
    factor: quantitySchema,
    salePrice: moneySchema,
    isDefault: z.boolean(),
    discountType: discountTypeSchema.default('PERCENTAGE'),
    minimumDiscount: threeDecimalNonNegativeSchema.default(0),
    maximumDiscount: threeDecimalNonNegativeSchema.default(0),
  })
  .superRefine((unit, context) => {
    if (unit.minimumDiscount > unit.maximumDiscount) {
      context.addIssue({ code: 'custom', path: ['minimumDiscount'], message: 'Diskon minimum tidak boleh melebihi maksimum' })
    }
    if (unit.discountType === 'PERCENTAGE' && unit.maximumDiscount > 100) {
      context.addIssue({ code: 'custom', path: ['maximumDiscount'], message: 'Diskon persentase maksimal 100%' })
    }
    if (unit.discountType === 'FIXED') {
      if (!Number.isInteger(unit.minimumDiscount) || !Number.isInteger(unit.maximumDiscount)) {
        context.addIssue({ code: 'custom', path: ['minimumDiscount'], message: 'Diskon nominal harus berupa rupiah bulat' })
      }
      if (unit.maximumDiscount > unit.salePrice) {
        context.addIssue({ code: 'custom', path: ['maximumDiscount'], message: 'Diskon nominal tidak boleh melebihi harga jual' })
      }
    }
  })
```

Ubah item/header penjualan menjadi:

```ts
export const saleItemInputSchema = z.object({
  productId: z.uuid(),
  unitId: z.uuid(),
  quantity: quantitySchema,
  discountValue: threeDecimalNonNegativeSchema.default(0),
})

discount: z.literal(0).default(0),
```

- [ ] **Step 4: Write failing exact-calculation tests**

Tambahkan pengujian domain berikut, termasuk pembulatan setengah ke atas dan aturan nol:

```ts
expect(getDiscountValidationMessage(
  { discountType: 'PERCENTAGE', minimumDiscount: 5, maximumDiscount: 20 },
  0,
)).toBeUndefined()

expect(calculateSaleLineTotals({
  quantity: 2,
  unitPrice: 10_000,
  discountType: 'PERCENTAGE',
  discountValue: 12.5,
})).toEqual({ subtotal: 20_000, discountAmount: 2_500, total: 17_500 })

expect(calculateSaleLineTotals({
  quantity: 1.5,
  unitPrice: 10_000,
  discountType: 'FIXED',
  discountValue: 1_250,
})).toEqual({ subtotal: 15_000, discountAmount: 1_875, total: 13_125 })

expect(calculateSaleLineTotals({
  quantity: 1,
  unitPrice: 10,
  discountType: 'PERCENTAGE',
  discountValue: 5,
}).discountAmount).toBe(1)
```

Tambahkan kasus `getDiscountValidationMessage` untuk nilai di bawah minimum, di atas maksimum, dan nominal pecahan.

- [ ] **Step 5: Run the domain test and confirm the red state**

Run:

```powershell
npm.cmd run test --workspace @zaina/shared -- src/domain.test.ts
```

Expected: FAIL karena helper diskon belum diekspor.

- [ ] **Step 6: Implement the exact domain calculator**

Tambahkan interface berikut ke `domain.ts`:

```ts
import type { DiscountType } from './schemas.js'

export interface DiscountRule {
  discountType: DiscountType
  minimumDiscount: number
  maximumDiscount: number
}

export interface SaleCalculationItem {
  quantity: number
  unitPrice: number
  discountType: DiscountType
  discountValue: number
}

export interface SaleLineTotals {
  subtotal: number
  discountAmount: number
  total: number
}
```

Gunakan skala tiga desimal dan `BigInt` untuk semua perkalian:

```ts
const DECIMAL_SCALE = 1_000n

function scaled(value: number): bigint {
  const [whole, fraction = ''] = value.toFixed(3).split('.')
  return BigInt(whole!) * DECIMAL_SCALE + BigInt(fraction.padEnd(3, '0'))
}

function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator / 2n) / denominator
}

function safeMoney(value: bigint): number {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error('Hasil perhitungan uang berada di luar batas aman')
  }
  return number
}
```

`calculateSaleLineTotals` menghitung subtotal dengan penyebut `1_000`, persentase dengan penyebut `100_000`, dan nominal dengan penyebut `1_000`. Tolak hasil diskon di atas subtotal. `calculateSaleTotals(items)` menjumlahkan hasil per baris dan mengembalikan `{ subtotal, discount, total }`.

`getDiscountValidationMessage` mengembalikan `undefined` untuk nol, lalu memeriksa bilangan hingga tiga desimal, integer untuk `FIXED`, dan rentang inklusif. Pesan rentang harus stabil agar API dan UI berbicara sama:

```ts
function discountRangeLabel(rule: DiscountRule): string {
  if (rule.discountType === 'FIXED') {
    const format = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 })
    return `Rp${format.format(rule.minimumDiscount)}–Rp${format.format(rule.maximumDiscount)}`
  }
  const format = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 })
  return `${format.format(rule.minimumDiscount)}%–${format.format(rule.maximumDiscount)}%`
}

return `Gunakan 0 atau diskon ${discountRangeLabel(rule)}`
```

Untuk nominal pecahan, kembalikan `Diskon nominal harus berupa rupiah bulat` sebelum memeriksa rentang.

- [ ] **Step 7: Run all shared tests and commit**

Run:

```powershell
npm.cmd run test --workspace @zaina/shared
npm.cmd run typecheck --workspace @zaina/shared
git add packages/shared/src/domain.ts packages/shared/src/domain.test.ts packages/shared/src/schemas.ts packages/shared/src/schemas.test.ts
git commit -m "feat: define per-unit discount rules"
```

Expected: all shared tests and typecheck PASS.

### Task 2: Add database rules, historical backfill, and demo configuration

**Files:**
- Create: `apps/api/src/db/migrations/003_unit_discounts.sql`
- Modify: `apps/api/src/db/migrate.test.ts`
- Modify: `apps/api/src/db/seed.ts`
- Modify: `apps/api/src/db/seed.test.ts`
- Modify: `apps/api/src/db/types.ts`

**Interfaces:**
- Consumes: `DiscountType` semantics from Task 1.
- Produces: product-unit columns `discount_type`, `minimum_discount`, `maximum_discount` and sale-item snapshot/total columns.

- [ ] **Step 1: Write migration tests for defaults, constraints, and legacy backfill**

Di `migrate.test.ts`, tambahkan fixture migrasi bertahap: baca dan jalankan `001_initial.sql` serta `002_movement_snapshots.sql`, sisipkan satu user/category/product/unit/sale/sale_item lama memakai semua kolom wajib dari kedua migrasi tersebut, lalu jalankan `003_unit_discounts.sql`. Setelah migrasi baru, query rule unit dan item lama:

```ts
const legacyUnitId = '30000000-0000-4000-8000-000000000099'
const legacyItemId = '60000000-0000-4000-8000-000000000099'

const unit = await database.query<{
  discount_type: string
  minimum_discount: string
  maximum_discount: string
}>(`SELECT discount_type, minimum_discount, maximum_discount
    FROM product_units WHERE id = $1`, [legacyUnitId])

const item = await database.query<{
  discount_amount: string
  total: string
}>(`SELECT discount_amount, total FROM sale_items WHERE id = $1`, [legacyItemId])

expect(unit.rows[0]).toMatchObject({
  discount_type: 'PERCENTAGE',
  minimum_discount: '0.000',
  maximum_discount: '0.000',
})
expect(item.rows[0]).toEqual({ discount_amount: '0', total: '10000' })
```

Gunakan UUID konstan untuk `legacyUnitId`/`legacyItemId` agar hasil deterministik. Tambahkan `expect(...).rejects` untuk persentase `100.001`, nominal pecahan, nominal di atas `sale_price`, dan `sale_items.total` yang tidak sama dengan `subtotal - discount_amount`.

- [ ] **Step 2: Run the migration test and confirm the red state**

Run:

```powershell
npm.cmd run test --workspace @zaina/api -- src/db/migrate.test.ts
```

Expected: FAIL karena migrasi `003_unit_discounts.sql` belum ada.

- [ ] **Step 3: Create the additive migration**

Isi migrasi dengan bentuk berikut dan nama constraint yang stabil:

```sql
ALTER TABLE product_units
  ADD COLUMN discount_type VARCHAR(16) NOT NULL DEFAULT 'PERCENTAGE',
  ADD COLUMN minimum_discount NUMERIC(18,3) NOT NULL DEFAULT 0,
  ADD COLUMN maximum_discount NUMERIC(18,3) NOT NULL DEFAULT 0,
  ADD CONSTRAINT ck_product_units_discount_type
    CHECK (discount_type IN ('PERCENTAGE', 'FIXED')),
  ADD CONSTRAINT ck_product_units_discount_range
    CHECK (minimum_discount >= 0 AND maximum_discount >= minimum_discount),
  ADD CONSTRAINT ck_product_units_percentage_discount
    CHECK (discount_type <> 'PERCENTAGE' OR maximum_discount <= 100),
  ADD CONSTRAINT ck_product_units_fixed_discount
    CHECK (
      discount_type <> 'FIXED'
      OR (
        minimum_discount = TRUNC(minimum_discount)
        AND maximum_discount = TRUNC(maximum_discount)
        AND maximum_discount <= sale_price
      )
    );

ALTER TABLE sale_items
  ADD COLUMN discount_type_snapshot VARCHAR(16) NOT NULL DEFAULT 'PERCENTAGE',
  ADD COLUMN minimum_discount_snapshot NUMERIC(18,3) NOT NULL DEFAULT 0,
  ADD COLUMN maximum_discount_snapshot NUMERIC(18,3) NOT NULL DEFAULT 0,
  ADD COLUMN discount_value NUMERIC(18,3) NOT NULL DEFAULT 0,
  ADD COLUMN discount_amount BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN total BIGINT;

UPDATE sale_items SET total = subtotal WHERE total IS NULL;

ALTER TABLE sale_items
  ALTER COLUMN total SET NOT NULL,
  ADD CONSTRAINT ck_sale_items_discount_type
    CHECK (discount_type_snapshot IN ('PERCENTAGE', 'FIXED')),
  ADD CONSTRAINT ck_sale_items_discount_range
    CHECK (
      minimum_discount_snapshot >= 0
      AND maximum_discount_snapshot >= minimum_discount_snapshot
      AND (discount_value = 0 OR discount_value BETWEEN minimum_discount_snapshot AND maximum_discount_snapshot)
    ),
  ADD CONSTRAINT ck_sale_items_percentage_discount
    CHECK (discount_type_snapshot <> 'PERCENTAGE' OR maximum_discount_snapshot <= 100),
  ADD CONSTRAINT ck_sale_items_fixed_discount
    CHECK (
      discount_type_snapshot <> 'FIXED'
      OR (
        minimum_discount_snapshot = TRUNC(minimum_discount_snapshot)
        AND maximum_discount_snapshot = TRUNC(maximum_discount_snapshot)
        AND discount_value = TRUNC(discount_value)
        AND maximum_discount_snapshot <= unit_price
      )
    ),
  ADD CONSTRAINT ck_sale_items_discount_money
    CHECK (discount_amount >= 0 AND discount_amount <= subtotal),
  ADD CONSTRAINT ck_sale_items_total
    CHECK (total = subtotal - discount_amount);
```

- [ ] **Step 4: Add explicit demo rules and database row types**

Tambahkan `discountType`, `minimumDiscount`, dan `maximumDiscount` pada `DemoProduct.units`. Gunakan contoh yang mencakup kedua mode, misalnya satuan `buah` piring `PERCENTAGE 5–20` dan `lusin` piring `FIXED 5.000–10.000`. Perluas `INSERT product_units` serta parameternya. Tambahkan tiga field snake_case ke `ProductUnitRow`.

Di `seed.test.ts`, query satuan demo dan pastikan kedua jenis tersimpan:

```ts
expect(units.rows).toEqual(expect.arrayContaining([
  expect.objectContaining({ discount_type: 'PERCENTAGE', minimum_discount: '5.000' }),
  expect.objectContaining({ discount_type: 'FIXED', minimum_discount: '5000.000' }),
]))
```

- [ ] **Step 5: Run database tests and commit**

Run:

```powershell
npm.cmd run test --workspace @zaina/api -- src/db/migrate.test.ts src/db/seed.test.ts
npm.cmd run typecheck --workspace @zaina/api
git add apps/api/src/db/migrations/003_unit_discounts.sql apps/api/src/db/migrate.test.ts apps/api/src/db/seed.ts apps/api/src/db/seed.test.ts apps/api/src/db/types.ts
git commit -m "feat: persist unit discount rules"
```

Expected: migration/seed tests and API typecheck PASS.

### Task 3: Persist and return catalog discount rules

**Files:**
- Modify: `apps/api/src/modules/catalog/catalog.routes.test.ts`
- Modify: `apps/api/src/modules/catalog/catalog.repository.ts`
- Modify: `apps/api/src/modules/catalog/catalog.queries.ts`

**Interfaces:**
- Consumes: `ProductInput.units[]` from Task 1 and database columns from Task 2.
- Produces: every catalog unit response contains `discountType`, `minimumDiscount`, and `maximumDiscount`.

- [ ] **Step 1: Write failing catalog API persistence tests**

Ubah helper `productInput` agar unit buah memakai `PERCENTAGE 5–20` dan lusin memakai `FIXED 5_000–10_000`. Pada test create, assert:

```ts
expect(response.body.data.units).toEqual(expect.arrayContaining([
  expect.objectContaining({
    name: 'buah',
    discountType: 'PERCENTAGE',
    minimumDiscount: 5,
    maximumDiscount: 20,
  }),
  expect.objectContaining({
    name: 'lusin',
    discountType: 'FIXED',
    minimumDiscount: 5_000,
    maximumDiscount: 10_000,
  }),
]))
```

Pada test update, ubah rentang unit yang sama lalu GET ulang produk dan pastikan nilai terbaru tersimpan tanpa mengubah saldo.

- [ ] **Step 2: Run the catalog route test and confirm the red state**

Run:

```powershell
npm.cmd run test --workspace @zaina/api -- src/modules/catalog/catalog.routes.test.ts
```

Expected: FAIL karena query katalog belum membaca atau menulis kolom diskon.

- [ ] **Step 3: Extend catalog repository writes**

Tambahkan tiga field ke `UnitRecord`, semua SELECT unit, UPDATE unit aktif, dan INSERT unit baru. Bentuk parameter write harus konsisten:

```ts
discount_type = $6,
minimum_discount = $7,
maximum_discount = $8,
is_default = $9
```

Untuk INSERT gunakan kolom:

```sql
(id, product_id, name, factor, sale_price,
 discount_type, minimum_discount, maximum_discount, is_default)
```

Identitas unit tetap hanya nama dan faktor; perubahan harga atau aturan diskon memperbarui baris yang sama agar foreign key historis tetap stabil.

- [ ] **Step 4: Extend catalog queries and response mapping**

Tambahkan tiga kolom ke `UnitRecord` query dan mapping:

```ts
discountType: unit.discount_type,
minimumDiscount: Number(unit.minimum_discount),
maximumDiscount: Number(unit.maximum_discount),
```

Pastikan query list maupun detail memakai bentuk SELECT yang sama dan hanya mengembalikan unit aktif.

- [ ] **Step 5: Run catalog tests and commit**

Run:

```powershell
npm.cmd run test --workspace @zaina/api -- src/modules/catalog/catalog.routes.test.ts
npm.cmd run typecheck --workspace @zaina/api
git add apps/api/src/modules/catalog/catalog.routes.test.ts apps/api/src/modules/catalog/catalog.repository.ts apps/api/src/modules/catalog/catalog.queries.ts
git commit -m "feat: expose unit discount catalog rules"
```

Expected: catalog tests and API typecheck PASS.

### Task 4: Calculate, validate, and snapshot discounts during sales

**Files:**
- Modify: `apps/api/src/modules/sales/sales.service.test.ts`
- Modify: `apps/api/src/modules/sales/sales.routes.test.ts`
- Modify: `apps/api/src/modules/sales/sales.repository.ts`
- Modify: `apps/api/src/modules/sales/sales.service.ts`
- Modify: `apps/api/src/modules/sales/sales.queries.ts`

**Interfaces:**
- Consumes: exact calculator from Task 1, catalog fields from Task 3, and sale-item columns from Task 2.
- Produces: `UnitSnapshot` with rule fields and `SaleLineSnapshot` with selected value, computed amount, and net total.
- Produces: receipt item JSON fields `discountTypeSnapshot`, `minimumDiscountSnapshot`, `maximumDiscountSnapshot`, `discountValue`, `discountAmount`, and `total`.

- [ ] **Step 1: Write failing service-unit tests for percentage and fixed lines**

Perluas fixture `prepareSaleLine` dengan aturan katalog. Tambahkan dua ekspektasi:

```ts
expect(prepareSaleLine(
  { productId: 'product-1', unitId: 'unit-piece', quantity: 2, discountValue: 10 },
  {
    productId: 'product-1', productName: 'Piring Kaca',
    unitId: 'unit-piece', unitName: 'buah', factor: 1,
    salePrice: 10_000, costPrice: 7_000,
    discountType: 'PERCENTAGE', minimumDiscount: 5, maximumDiscount: 20,
  },
)).toMatchObject({ subtotal: 20_000, discountAmount: 2_000, total: 18_000 })

expect(prepareSaleLine(
  { productId: 'product-1', unitId: 'unit-dozen', quantity: 2, discountValue: 5_000 },
  {
    productId: 'product-1', productName: 'Piring Kaca',
    unitId: 'unit-dozen', unitName: 'lusin', factor: 12,
    salePrice: 115_000, costPrice: 7_000,
    discountType: 'FIXED', minimumDiscount: 5_000, maximumDiscount: 10_000,
  },
)).toMatchObject({ subtotal: 230_000, discountAmount: 10_000, total: 220_000 })
```

Tambahkan test bahwa nilai `1` terhadap rentang `5–20` melempar `AppError` dengan code `DISCOUNT_OUT_OF_RANGE`.

- [ ] **Step 2: Write failing route tests for atomicity, boundaries, snapshots, and legacy input**

Perbarui helper produk pada test sehingga unit dasar memakai `PERCENTAGE 5–20` dan unit lusin memakai `FIXED 5_000–10_000`. Pindahkan diskon nominal global pada test penjualan lama ke `items[0].discountValue` dengan rule unit yang sesuai.

Tambahkan kasus API berikut:

1. `discountValue: 0`, tepat minimum, dan tepat maksimum berhasil.
2. Nilai di bawah minimum dan di atas maksimum menghasilkan `422/DISCOUNT_OUT_OF_RANGE`.
3. Setelah penolakan, hitung `sales`, `sale_items`, `stock_movements`, dan saldo; semua tetap seperti sebelum request.
4. `discount: 1` di header menghasilkan `422`.
5. Penjualan valid menyimpan agregat header dan enam field snapshot item.
6. Setelah aturan unit diubah, GET nota lama masih mengembalikan snapshot lama.
7. Retry dengan idempotency key yang sama mengembalikan item dan total snapshot yang sama.

Contoh ekspektasi snapshot:

```ts
expect(response.body.data).toMatchObject({
  subtotal: 20_000,
  discount: 2_000,
  total: 18_000,
  items: [expect.objectContaining({
    discountTypeSnapshot: 'PERCENTAGE',
    minimumDiscountSnapshot: 5,
    maximumDiscountSnapshot: 20,
    discountValue: 10,
    discountAmount: 2_000,
    total: 18_000,
  })],
})
```

- [ ] **Step 3: Run sales tests and confirm the red state**

Run:

```powershell
npm.cmd run test --workspace @zaina/api -- src/modules/sales/sales.service.test.ts src/modules/sales/sales.routes.test.ts
```

Expected: FAIL karena snapshot unit dan kalkulasi baris belum memuat diskon.

- [ ] **Step 4: Load rule snapshots and extend repository types**

Perluas `UnitSnapshot`:

```ts
export interface UnitSnapshot extends DiscountRule {
  productId: string
  unitId: string
  unitName: string
  factor: number
  salePrice: number
}
```

Perluas `SaleLineSnapshot`:

```ts
discountValue: number
discountAmount: number
total: number
```

`findSellingUnits` harus SELECT/map `discount_type`, `minimum_discount`, dan `maximum_discount`. `insertSaleLine` harus menulis seluruh snapshot serta `discount_value`, `discount_amount`, dan `total`. `findCancellationLines` tetap membaca data yang dibutuhkan untuk reversal dan mengisi field snapshot agar sesuai tipe.

- [ ] **Step 5: Make the service authoritative and atomic**

Di `prepareSaleLine`, validasi sebelum write apa pun:

```ts
const discountError = getDiscountValidationMessage(catalog, input.discountValue)
if (discountError) {
  throw new AppError(
    422,
    'DISCOUNT_OUT_OF_RANGE',
    `${catalog.productName}: ${discountError}`,
  )
}
const amounts = calculateSaleLineTotals({
  quantity: input.quantity,
  unitPrice: catalog.salePrice,
  discountType: catalog.discountType,
  discountValue: input.discountValue,
})
```

Salin rule katalog ke field snapshot pada line. Ganti kalkulasi header global dengan reduce atas line:

```ts
const totals = lines.reduce(
  (sum, line) => ({
    subtotal: sum.subtotal + line.subtotal,
    discount: sum.discount + line.discountAmount,
    total: sum.total + line.total,
  }),
  { subtotal: 0, discount: 0, total: 0 },
)
```

Pertahankan urutan: lock stok/unit → validasi dan siapkan semua line → validasi pembayaran → insert header/item/movement. Dengan demikian satu diskon invalid tidak pernah terjadi setelah write parsial.

- [ ] **Step 6: Return complete item snapshots from receipt queries**

Perluas `SaleItemRow`, `saleItemSelect`, dan `mapSaleItem` dengan enam field baru. Konversi semua `NUMERIC/BIGINT` ke `Number` di boundary mapping seperti field uang yang sudah ada.

- [ ] **Step 7: Run sales and API suites, then commit**

Run:

```powershell
npm.cmd run test --workspace @zaina/api -- src/modules/sales/sales.service.test.ts src/modules/sales/sales.routes.test.ts
npm.cmd run typecheck --workspace @zaina/api
git add apps/api/src/modules/sales
git commit -m "feat: apply discounts per sale line"
```

Expected: focused sales tests and API typecheck PASS. Suite API penuh dijalankan pada Task 5 setelah fixture laporan tidak lagi mengirim diskon global.

### Task 5: Use net line revenue in product reports

**Files:**
- Modify: `apps/api/src/modules/reports/reports.routes.test.ts`
- Modify: `apps/api/src/modules/reports/reports.repository.ts`

**Interfaces:**
- Consumes: `sale_items.total` from Task 2/4.
- Produces: `SalesReport.topProducts[].revenue` and `grossProfit` based on net item revenue.

- [ ] **Step 1: Change the report fixture to a line discount and add net assertions**

Pada setup report, kirim `discountValue: 5` pada item dan hapus diskon global nonnol. Pertahankan angka hasil: subtotal `20_000`, diskon `1_000`, total `19_000`. Tambahkan:

```ts
expect(sales.body.data.topProducts[0]).toMatchObject({
  productName: 'Piring Kaca Bening',
  quantityBase: 2,
  revenue: 19_000,
  cost: 14_000,
  grossProfit: 5_000,
})
```

- [ ] **Step 2: Run the report route test and confirm the red state**

Run:

```powershell
npm.cmd run test --workspace @zaina/api -- src/modules/reports/reports.routes.test.ts
```

Expected: FAIL karena top-products masih menjumlahkan `si.subtotal`.

- [ ] **Step 3: Query net item totals and commit**

Ubah hanya agregat omzet produk:

```sql
SUM(si.total) AS revenue
```

Summary transaksi tetap memakai `sales.subtotal`, `sales.discount`, dan `sales.total`; biaya tetap `quantity_base * cost_price`. Jalankan:

```powershell
npm.cmd run test --workspace @zaina/api -- src/modules/reports/reports.routes.test.ts
npm.cmd run test --workspace @zaina/api
git add apps/api/src/modules/reports/reports.repository.ts apps/api/src/modules/reports/reports.routes.test.ts
git commit -m "fix: report net revenue after item discounts"
```

Expected: report test dan seluruh suite API PASS dengan gross profit hasil hitung tangan.

### Task 6: Add discount controls and ranges to the product UI

**Files:**
- Modify: `apps/web/src/api/types.ts`
- Modify: `apps/web/src/features/products/ProductForm.test.tsx`
- Modify: `apps/web/src/features/products/ProductForm.tsx`
- Modify: `apps/web/src/features/products/ProductDetailPage.tsx`
- Modify: `apps/web/src/features/inventory/MovementForm.test.tsx`
- Create: `apps/web/src/lib/format.test.ts`
- Modify: `apps/web/src/lib/format.ts`
- Modify: `apps/web/src/styles/features.css`

**Interfaces:**
- Consumes: catalog response fields from Task 3 and `ProductInput` from Task 1.
- Produces: product create/update payloads with explicit rule fields and `formatDiscountRange(rule)` for read-only display.

- [ ] **Step 1: Extend web response types and write failing formatting tests**

Tambahkan ke `ProductUnit`:

```ts
discountType: 'PERCENTAGE' | 'FIXED'
minimumDiscount: number
maximumDiscount: number
```

Karena field response ini wajib, tambahkan rule `PERCENTAGE 0–0` pada fixture unit di `MovementForm.test.tsx` agar fixture tetap merepresentasikan respons API lengkap.

Buat `format.test.ts`:

```ts
expect(formatDiscountRange({
  discountType: 'PERCENTAGE', minimumDiscount: 5, maximumDiscount: 20,
})).toBe('5%–20%')
expect(formatDiscountRange({
  discountType: 'FIXED', minimumDiscount: 2_000, maximumDiscount: 5_000,
})).toBe('Rp2.000–Rp5.000')
expect(formatDiscountRange({
  discountType: 'PERCENTAGE', minimumDiscount: 0, maximumDiscount: 0,
})).toBe('Tanpa diskon')
```

- [ ] **Step 2: Write failing ProductForm interaction tests**

Tambahkan test yang mengisi produk, memilih `Nominal (Rp)`, mengisi minimum `2000` dan maksimum `5000`, lalu submit dan memeriksa payload. Tambahkan test bahwa maksimum nominal di atas harga jual menampilkan `Diskon nominal tidak boleh melebihi harga jual` dan tidak memanggil submit.

Gunakan aria-label unik per baris: `Jenis diskon satuan 1`, `Diskon minimum satuan 1`, dan `Diskon maksimum satuan 1`.

- [ ] **Step 3: Run focused web tests and confirm the red state**

Run:

```powershell
npm.cmd run test --workspace @zaina/web -- src/lib/format.test.ts src/features/products/ProductForm.test.tsx
```

Expected: FAIL karena tipe, formatter, dan kontrol form belum ada.

- [ ] **Step 4: Implement form state, dynamic fields, and defaults**

Perluas setiap unit dalam `ProductFormValues`. Unit baru/default harus memakai:

```ts
{
  name: 'buah',
  factor: 1,
  salePrice: 0,
  discountType: 'PERCENTAGE',
  minimumDiscount: 0,
  maximumDiscount: 0,
}
```

Di setiap `.unit-row`, tambahkan `<select>` dengan label visual `Jenis diskon`, lalu dua input. Gunakan `step="0.001"` untuk persentase dan `step="1"` untuk nominal. Jangan memakai HTML `min` sebesar minimum aturan karena nilai nol harus selalu dapat diinput; validasi rentang dilakukan Zod/server. Render error tepat di bawah field yang memiliki issue.

`toProductInputCandidate` harus membawa ketiga field tanpa transformasi. `defaults(product, ...)` harus mempertahankan rule yang diterima API ketika edit.

- [ ] **Step 5: Display the range on product detail and make layout responsive**

Implementasikan:

```ts
export function formatDiscountRange(rule: {
  discountType: 'PERCENTAGE' | 'FIXED'
  minimumDiscount: number
  maximumDiscount: number
}): string
```

Gunakan `formatQuantity` untuk persen dan `formatCurrency` untuk nominal. Pada `ProductDetailPage`, tambahkan baris kecil `Diskon ...` pada setiap `.unit-card`. Ubah grid `.unit-row` agar field diskon dapat wrap menjadi dua baris pada desktop sempit dan satu kolom pada mobile tanpa horizontal scroll.

- [ ] **Step 6: Run product UI tests, accessibility lint, and commit**

Run:

```powershell
npm.cmd run test --workspace @zaina/web -- src/lib/format.test.ts src/features/products/ProductForm.test.tsx
npm.cmd run typecheck --workspace @zaina/web
npm.cmd run lint
git add apps/web/src/api/types.ts apps/web/src/features/products/ProductForm.tsx apps/web/src/features/products/ProductForm.test.tsx apps/web/src/features/products/ProductDetailPage.tsx apps/web/src/features/inventory/MovementForm.test.tsx apps/web/src/lib/format.ts apps/web/src/lib/format.test.ts apps/web/src/styles/features.css
git commit -m "feat: manage discount ranges in product UI"
```

Expected: focused web tests, typecheck, and lint PASS.

### Task 7: Move checkout and receipts to per-line discounts

**Files:**
- Modify: `apps/web/src/features/sales/SalesPage.test.tsx`
- Modify: `apps/web/src/features/sales/SalesPage.tsx`
- Create: `apps/web/src/features/sales/SaleReceipt.test.tsx`
- Modify: `apps/web/src/features/sales/SaleReceipt.tsx`
- Modify: `apps/web/src/api/types.ts`
- Modify: `apps/web/src/styles/features.css`

**Interfaces:**
- Consumes: shared calculation helpers from Task 1, unit rule fields from Task 6, and receipt snapshot JSON from Task 4.
- Produces: checkout payload `items[].discountValue`; no editable header `discount`.

- [ ] **Step 1: Update SalesPage fixtures and write failing line-discount tests**

Tambahkan aturan pada kedua unit fixture. Buat test yang:

1. Memilih unit `lusin` dengan rule `FIXED 5.000–10.000`.
2. Mengisi jumlah `2`, diskon `5000`, dan pembayaran `220000`.
3. Melihat subtotal kotor `Rp230.000`, potongan `Rp10.000`, total bersih `Rp220.000`.
4. Checkout dan memeriksa request body `items[0].discountValue === 5000` serta tidak memiliki diskon global nonnol.

Tambahkan test nilai `1` pada rule minimum `5000`: tombol checkout disabled dan pesan `Gunakan 0 atau diskon Rp5.000–Rp10.000`. Tambahkan test perubahan satuan mengatur kembali diskon baris ke `0`.

- [ ] **Step 2: Write a failing receipt snapshot test**

Render `SaleReceipt` di `MemoryRouter` path `/sales/sale-1`, mock respons sale dengan item:

```ts
{
  subtotal: 20_000,
  discountAmount: 2_000,
  total: 18_000,
  discountTypeSnapshot: 'PERCENTAGE',
  minimumDiscountSnapshot: 5,
  maximumDiscountSnapshot: 20,
  discountValue: 10,
}
```

Pastikan nota menampilkan `Rp20.000`, `− Rp2.000`, dan `Rp18.000` pada baris barang serta total header tetap `Rp18.000`.

- [ ] **Step 3: Run focused sales UI tests and confirm the red state**

Run:

```powershell
npm.cmd run test --workspace @zaina/web -- src/features/sales/SalesPage.test.tsx src/features/sales/SaleReceipt.test.tsx
```

Expected: FAIL karena keranjang masih memiliki diskon global dan tipe receipt belum berisi snapshot.

- [ ] **Step 4: Implement per-line cart state and calculations**

Ubah `CartLine` menjadi:

```ts
interface CartLine {
  product: Product
  unitId: string
  quantity: number
  discountValue: number
}
```

Unit baru selalu mulai dengan nol. Perubahan `unitId` sekaligus mengatur `discountValue: 0`. Untuk setiap line, panggil `getDiscountValidationMessage(unit, line.discountValue)` dan `calculateSaleLineTotals({ quantity, unitPrice, discountType, discountValue })`. Jumlahkan subtotal, discountAmount, dan total semua baris.

Hapus state/input diskon global. Tambahkan input diskon dalam `.cart-line`, suffix `%`/`Rp`, keterangan rentang, subtotal kotor, potongan, dan total bersih. `canCheckout` wajib memeriksa semua pesan diskon kosong, quantity/stok valid, pembayaran cukup, dan mutation tidak pending.

Payload mutation harus berbentuk:

```ts
const transaction = {
  amountPaid,
  note,
  items: cart.map((line) => ({
    productId: line.product.id,
    unitId: line.unitId,
    quantity: line.quantity,
    discountValue: line.discountValue,
  })),
}
```

Signature idempotency tetap `JSON.stringify(transaction)`, sehingga perubahan diskon membuat key baru dan retry payload identik memakai key lama.

- [ ] **Step 5: Extend receipt types and render gross/discount/net values**

Tambahkan enam field snapshot ke `SaleItem` di `api/types.ts`. Ubah header dan baris nota menjadi enam informasi: Barang, Jumlah, Harga, Kotor, Diskon, Bersih. Gunakan `item.subtotal`, `item.discountAmount`, dan `item.total`; tampilkan label tipe/nilai diskon sebagai teks kecil di bawah nama satuan.

Sesuaikan CSS desktop dan mobile. Pada mobile, pertahankan Kotor, Diskon, dan Bersih; Harga satuan boleh dipindah menjadi teks kecil pada kolom barang agar semua angka audit tetap terlihat.

- [ ] **Step 6: Run all web tests and commit**

Run:

```powershell
npm.cmd run test --workspace @zaina/web
npm.cmd run typecheck --workspace @zaina/web
npm.cmd run lint
git add apps/web/src/features/sales/SalesPage.tsx apps/web/src/features/sales/SalesPage.test.tsx apps/web/src/features/sales/SaleReceipt.tsx apps/web/src/features/sales/SaleReceipt.test.tsx apps/web/src/api/types.ts apps/web/src/styles/features.css
git commit -m "feat: apply discounts in checkout and receipts"
```

Expected: all web tests, typecheck, and lint PASS.

### Task 8: Update acceptance coverage, documentation, and final quality gates

**Files:**
- Modify: `scripts/acceptance-test.mjs`
- Modify: `README.md`
- Modify: `docs/DATABASE.md`

**Interfaces:**
- Consumes: completed catalog/sales API contract.
- Produces: operator-facing documentation and a staging acceptance flow that verifies per-line discounts.

- [ ] **Step 1: Update the writable acceptance flow**

Tambahkan rule eksplisit pada produk acceptance:

```js
units: [
  {
    name: 'buah', factor: 1, salePrice: 10_000, isDefault: true,
    discountType: 'PERCENTAGE', minimumDiscount: 5, maximumDiscount: 20,
  },
  {
    name: 'lusin', factor: 12, salePrice: 84_000, isDefault: false,
    discountType: 'FIXED', minimumDiscount: 5_000, maximumDiscount: 10_000,
  },
],
```

Ubah item penjualan dua buah menjadi `discountValue: 10`, pembayaran `18_000`, lalu assert `sale.subtotal === 20_000`, `sale.discount === 2_000`, `sale.total === 18_000`, dan item snapshot memiliki `discountAmount === 2_000`.

- [ ] **Step 2: Update the feature and database documentation**

Di `README.md`, ubah bullet multi-satuan/kasir agar menyebut harga jual dan rentang diskon persen/nominal per satuan. Di `docs/DATABASE.md`, dokumentasikan:

- rule aktif pada `product_units`;
- snapshot rule, pilihan, potongan, dan total bersih pada `sale_items`;
- transaksi lama memakai snapshot diskon item nol sementara header historis tidak berubah;
- daftar migration up mencakup `002_movement_snapshots.sql` dan `003_unit_discounts.sql`.

- [ ] **Step 3: Run documentation-safe script checks and commit**

Run:

```powershell
node scripts/acceptance-test.mjs --help
git diff --check
git add scripts/acceptance-test.mjs README.md docs/DATABASE.md
git commit -m "docs: document unit discount workflow"
```

Expected: help command exits `0`, diff check has no whitespace error, and the documentation commit succeeds.

- [ ] **Step 4: Run the complete local quality gate from a clean dependency install**

Run:

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
npm.cmd audit --omit=dev
git diff --check
git status --short
```

Expected: tests, lint, typecheck, build, and production audit PASS; audit reports zero production vulnerabilities; worktree has no uncommitted changes.

- [ ] **Step 5: Run the real PostgreSQL gate when configured**

Run:

```powershell
if ($env:TEST_DATABASE_URL) {
  npm.cmd run test:postgres --workspace @zaina/api
} else {
  Write-Output 'SKIP: TEST_DATABASE_URL tidak tersedia; PGlite migration suite sudah dijalankan.'
}
```

Expected: PostgreSQL integration PASS when the URL exists; otherwise record the explicit environmental skip without claiming a real-PostgreSQL pass.

- [ ] **Step 6: Review the final commit range**

Run:

```powershell
git log --oneline 094521f..HEAD
git status --short
```

Expected: the commits map one-to-one to the tasks above and the worktree is clean. Do not push or deploy without separate authorization.
