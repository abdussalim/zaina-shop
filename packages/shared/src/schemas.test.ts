import { describe, expect, it } from 'vitest'

import {
  productInputSchema,
  saleInputSchema,
  stockMovementInputSchema,
} from './schemas.js'

const validProduct = {
  sku: 'PRG-001',
  barcode: '',
  name: 'Piring Kaca Bening',
  categoryId: '6a73887f-7df4-45d9-9bb9-c11d32d0ff59',
  location: 'Rak A1',
  baseUnit: 'buah',
  costPrice: 7_000,
  salePrice: 10_000,
  minimumStock: 12,
  units: [
    { name: 'buah', factor: 1, salePrice: 10_000, isDefault: true },
    { name: 'lusin', factor: 12, salePrice: 115_000, isDefault: false },
  ],
}

describe('productInputSchema', () => {
  it('accepts one base unit and derived selling units', () => {
    const parsed = productInputSchema.parse(validProduct)

    expect(parsed.barcode).toBeUndefined()
    expect(parsed.units).toHaveLength(2)
  })

  it('rejects a catalog without exactly one base unit', () => {
    const result = productInputSchema.safeParse({
      ...validProduct,
      units: [{ name: 'lusin', factor: 12, salePrice: 115_000, isDefault: true }],
    })

    expect(result.success).toBe(false)
  })

  it('rejects duplicate unit names regardless of letter case', () => {
    const result = productInputSchema.safeParse({
      ...validProduct,
      units: [
        ...validProduct.units,
        { name: 'BUAH', factor: 1, salePrice: 10_000, isDefault: false },
      ],
    })

    expect(result.success).toBe(false)
  })
})

describe('stockMovementInputSchema', () => {
  it('requires a reason when recording damaged goods', () => {
    const result = stockMovementInputSchema.safeParse({
      idempotencyKey: 'e57d2f17-6887-4d6d-b60a-4a637f3f6bd5',
      type: 'DAMAGE',
      productId: 'dc53715f-0f46-49e4-9fa7-9cbcf74eab35',
      unitId: '3eae813d-4ab1-454b-aa01-81463ed07617',
      quantity: 2,
      note: ' ',
    })

    expect(result.success).toBe(false)
  })

  it('requires a UUID idempotency key for safe retries', () => {
    const result = stockMovementInputSchema.safeParse({
      idempotencyKey: 'bukan-uuid',
      type: 'RECEIPT',
      productId: 'dc53715f-0f46-49e4-9fa7-9cbcf74eab35',
      unitId: '3eae813d-4ab1-454b-aa01-81463ed07617',
      quantity: 1,
    })

    expect(result.success).toBe(false)
  })
})

describe('saleInputSchema', () => {
  it('rejects an empty cart', () => {
    const result = saleInputSchema.safeParse({
      idempotencyKey: '5a5ab2a3-67e4-4533-88be-9789209b0376',
      discount: 0,
      amountPaid: 0,
      items: [],
    })

    expect(result.success).toBe(false)
  })
})
