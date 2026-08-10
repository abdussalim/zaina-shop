import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

if (process.argv.includes('--help')) {
  console.log(`Pemakaian:
  SMOKE_USERNAME=toko SMOKE_PASSWORD=... node scripts/smoke-test.mjs [--base-url URL]

Smoke test membuat satu barang sementara, menerima 1 lusin, menjual 2 buah,
membatalkan penjualan, memverifikasi saldo, lalu mengarsipkan barang.`)
  process.exit(0)
}
const baseUrl = argumentValue('--base-url') ?? process.env.SMOKE_BASE_URL ?? 'http://localhost:8080'
const username = process.env.SMOKE_USERNAME
const password = process.env.SMOKE_PASSWORD

if (!username || !password) {
  throw new Error('SMOKE_USERNAME dan SMOKE_PASSWORD wajib diisi.')
}

const origin = new URL(baseUrl).origin
let cookie = ''

async function request(path, options = {}) {
  const headers = new Headers(options.headers)
  headers.set('Accept', 'application/json')
  if (options.body) headers.set('Content-Type', 'application/json')
  if (cookie) headers.set('Cookie', cookie)
  if (options.method && options.method !== 'GET') headers.set('Origin', origin)

  const response = await fetch(new URL(path, baseUrl), { ...options, headers })
  const setCookie = response.headers.get('set-cookie')
  if (setCookie) cookie = setCookie.split(';', 1)[0]
  const text = await response.text()
  const payload = text ? JSON.parse(text) : undefined
  if (!response.ok) {
    throw new Error(`${options.method ?? 'GET'} ${path} gagal (${response.status}): ${payload?.error?.message ?? text}`)
  }
  return payload?.data
}

function post(path, body) {
  return request(path, { method: 'POST', body: JSON.stringify(body) })
}

await post('/api/v1/auth/login', { username, password })
const categories = await request('/api/v1/categories')
assert.ok(categories.length > 0, 'Kategori awal harus tersedia')

const token = `${Date.now()}-${randomUUID().slice(0, 6)}`
const product = await post('/api/v1/products', {
  sku: `SMOKE-${token}`,
  name: `Barang Uji ${token}`,
  categoryId: categories[0].id,
  baseUnit: 'buah',
  costPrice: 7_000,
  salePrice: 10_000,
  minimumStock: 2,
  units: [
    { name: 'buah', factor: 1, salePrice: 10_000, isDefault: true },
    { name: 'lusin', factor: 12, salePrice: 84_000, isDefault: false },
  ],
})
const piece = product.units.find((unit) => unit.name === 'buah')
const dozen = product.units.find((unit) => unit.name === 'lusin')
assert.ok(piece && dozen, 'Satuan buah dan lusin harus dibuat')

await post('/api/v1/inventory/movements', {
  idempotencyKey: randomUUID(),
  type: 'RECEIPT',
  productId: product.id,
  unitId: dozen.id,
  quantity: 1,
  unitCost: 84_000,
  note: 'Smoke test penerimaan',
})
assert.equal((await request(`/api/v1/products/${product.id}`)).balanceBase, 12)

const sale = await post('/api/v1/sales', {
  idempotencyKey: randomUUID(),
  discount: 0,
  amountPaid: 20_000,
  note: 'Smoke test penjualan',
  items: [{ productId: product.id, unitId: piece.id, quantity: 2 }],
})
assert.equal((await request(`/api/v1/products/${product.id}`)).balanceBase, 10)

const dashboard = await request('/api/v1/dashboard')
assert.ok(Array.isArray(dashboard.recentSales), 'Dashboard harus mengembalikan transaksi terbaru')

await post(`/api/v1/sales/${sale.id}/cancel`, { reason: 'Pembersihan smoke test' })
assert.equal((await request(`/api/v1/products/${product.id}`)).balanceBase, 12)
await post(`/api/v1/products/${product.id}/archive`)
await post('/api/v1/auth/logout')

console.log(`Smoke test lulus: ${product.sku}, transaksi ${sale.saleNumber}`)

function argumentValue(name) {
  const index = process.argv.indexOf(name)
  if (index === -1) return undefined
  const value = process.argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${name} memerlukan nilai.`)
  return value
}
