import type { Product } from '../api/types.js'
import { describe, expect, it } from 'vitest'
import { createSnapshot, sanitizeProduct } from './snapshotPolicy.js'
import { createIndexedDbSnapshotStore } from './snapshotStore.js'
import { SNAPSHOT_VERSION } from './types.js'

const product: Product = {
  id: 'p-1',
  categoryId: 'c-1',
  category: { id: 'c-1', name: 'Pecah belah', color: '#fff' },
  sku: 'GELAS-01',
  barcode: null,
  name: 'Gelas kaca',
  location: 'Rak A',
  baseUnit: 'pcs',
  costPrice: 12_000,
  salePrice: 20_000,
  minimumStock: 4,
  imageUrl: null,
  isActive: true,
  balanceBase: 12,
  stockStatus: 'OK',
  units: [{ id: 'u-1', name: 'pcs', factor: 1, salePrice: 20_000, isDefault: true, discountType: 'PERCENTAGE', minimumDiscount: 0, maximumDiscount: 10 }],
}

describe('offline snapshot policy', () => {
  it('keeps catalog and stock fields while excluding cost price and unknown fields', () => {
    const result = sanitizeProduct({ ...product, internalSecret: 'nope' } as Product & { internalSecret: string })
    expect(result).toMatchObject({ id: 'p-1', salePrice: 20_000, balance: 12, maximumDiscountPercent: 10 })
    expect(result).not.toHaveProperty('costPrice')
    expect(result).not.toHaveProperty('internalSecret')
  })

  it('creates a versioned ISO snapshot and rejects invalid products', () => {
    const result = createSnapshot('store-a', [product], '2026-08-11T00:00:00.000Z')
    expect(result.version).toBe(SNAPSHOT_VERSION)
    expect(result.storeKey).toBe('store-a')
    expect(result.updatedAt).toBe('2026-08-11T00:00:00.000Z')
    expect(() => sanitizeProduct({ ...product, id: '' })).toThrow('id')
  })

  it('round trips, replaces atomically, ignores malformed rows, and clears by store', async () => {
    const store = createIndexedDbSnapshotStore(`test-${crypto.randomUUID()}`)
    const first = createSnapshot('store-a', [product])
    const second = createSnapshot('store-a', [{ ...product, name: 'Piring kaca' }])
    await store.write(first)
    expect((await store.read('store-a'))?.products[0]?.name).toBe('Gelas kaca')
    await store.write(second)
    expect((await store.read('store-a'))?.products[0]?.name).toBe('Piring kaca')
    await store.write(createSnapshot('store-b', [product]))
    await store.clear('store-a')
    expect(await store.read('store-a')).toBeNull()
    expect(await store.read('store-b')).not.toBeNull()
    await store.clearAll()
    expect(await store.read('store-b')).toBeNull()
  })
})
