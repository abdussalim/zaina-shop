import assert from 'node:assert/strict'

if (process.argv.includes('--help')) {
  console.log(`Pemakaian:
  SMOKE_USERNAME=toko SMOKE_PASSWORD=... node scripts/smoke-test.mjs [--base-url URL]

Smoke test produksi ini hanya membaca health, sesi, katalog, dashboard,
ringkasan persediaan, dan pengaturan toko. Tidak ada data usaha yang dibuat.`)
  process.exit(0)
}

const baseUrl =
  argumentValue('--base-url') ??
  process.env.SMOKE_BASE_URL ??
  'http://localhost:8080'
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
    throw new Error(
      `${options.method ?? 'GET'} ${path} gagal (${response.status}): ${payload?.error?.message ?? text}`,
    )
  }
  return payload?.data
}

function post(path, body) {
  return request(path, {
    method: 'POST',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

const health = await request('/api/v1/health')
assert.equal(health.status, 'ok', 'API harus sehat')

await post('/api/v1/auth/login', { username, password })
const authenticatedUser = await request('/api/v1/auth/session')
assert.equal(authenticatedUser.username, username, 'Sesi harus memakai akun yang diuji')

const [categories, products, dashboard, inventory, settings] = await Promise.all([
  request('/api/v1/categories'),
  request('/api/v1/products'),
  request('/api/v1/dashboard'),
  request('/api/v1/inventory/summary'),
  request('/api/v1/settings/store'),
])
assert.ok(Array.isArray(categories), 'Kategori harus berupa daftar')
assert.ok(Array.isArray(products), 'Produk harus berupa daftar')
assert.ok(Array.isArray(dashboard.recentSales), 'Dashboard harus memuat transaksi terbaru')
assert.ok(
  Number.isFinite(inventory.totalProducts) && Number.isFinite(inventory.inventoryValue),
  'Ringkasan persediaan harus memuat metrik stok',
)
assert.ok(settings.storeName, 'Nama toko harus tersedia')

await post('/api/v1/auth/logout')
console.log(
  `Smoke test baca-saja lulus: ${settings.storeName}, ${products.length} produk aktif.`,
)

function argumentValue(name) {
  const index = process.argv.indexOf(name)
  if (index === -1) return undefined
  const value = process.argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${name} memerlukan nilai.`)
  return value
}
