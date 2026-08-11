import { describe, expect, it } from 'vitest'

import {
  productInputSchema,
  saleInputSchema,
  stockMovementInputSchema,
  storeSettingsInputSchema,
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
    {
      name: 'buah',
      factor: 1,
      salePrice: 10_000,
      isDefault: true,
      discountType: 'PERCENTAGE',
      minimumDiscount: 5,
      maximumDiscount: 20,
    },
    {
      name: 'lusin',
      factor: 12,
      salePrice: 115_000,
      isDefault: false,
      discountType: 'FIXED',
      minimumDiscount: 5_000,
      maximumDiscount: 10_000,
    },
  ],
}

describe('productInputSchema', () => {
  it('accepts one base unit and derived selling units', () => {
    const parsed = productInputSchema.parse(validProduct)

    expect(parsed.barcode).toBeUndefined()
    expect(parsed.units).toHaveLength(2)
    expect(parsed.units[0]).toMatchObject({
      discountType: 'PERCENTAGE',
      minimumDiscount: 5,
      maximumDiscount: 20,
    })
  })

  it('defaults omitted unit discount rules to a safe zero range', () => {
    const parsed = productInputSchema.parse({
      ...validProduct,
      units: validProduct.units.map(
        ({ discountType: _type, minimumDiscount: _minimum, maximumDiscount: _maximum, ...unit }) => unit,
      ),
    })

    expect(parsed.units).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          discountType: 'PERCENTAGE',
          minimumDiscount: 0,
          maximumDiscount: 0,
        }),
      ]),
    )
  })

  it.each([
    {
      name: 'minimum exceeds maximum',
      rule: { discountType: 'PERCENTAGE', minimumDiscount: 20, maximumDiscount: 5 },
    },
    {
      name: 'percentage exceeds one hundred',
      rule: { discountType: 'PERCENTAGE', minimumDiscount: 0, maximumDiscount: 100.001 },
    },
    {
      name: 'fixed discount is fractional',
      rule: { discountType: 'FIXED', minimumDiscount: 1.5, maximumDiscount: 2_000 },
    },
    {
      name: 'fixed discount exceeds the unit sale price',
      rule: { discountType: 'FIXED', minimumDiscount: 2_000, maximumDiscount: 10_001 },
    },
  ])('rejects an invalid unit discount rule: $name', ({ rule }) => {
    const result = productInputSchema.safeParse({
      ...validProduct,
      units: validProduct.units.map((unit, index) =>
        index === 0 ? { ...unit, ...rule } : unit,
      ),
    })

    expect(result.success).toBe(false)
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

  it('rejects duplicate unit identifiers', () => {
    const unitId = '3eae813d-4ab1-454b-aa01-81463ed07617'
    const result = productInputSchema.safeParse({
      ...validProduct,
      units: validProduct.units.map((unit) => ({ ...unit, id: unitId })),
    })

    expect(result.success).toBe(false)
  })

  it('rejects a second factor-one unit that is not the base unit', () => {
    const result = productInputSchema.safeParse({
      ...validProduct,
      units: [
        ...validProduct.units,
        { name: 'ecer', factor: 1, salePrice: 10_000, isDefault: false },
      ],
    })

    expect(result.success).toBe(false)
  })

  it('keeps the base-unit selling price aligned with the product price', () => {
    const result = productInputSchema.safeParse({
      ...validProduct,
      units: validProduct.units.map((unit) =>
        unit.factor === 1 ? { ...unit, salePrice: 9_000 } : unit,
      ),
    })

    expect(result.success).toBe(false)
  })
})

describe('storeSettingsInputSchema', () => {
  it('accepts Indonesian store identity and a non-negative stock default', () => {
    const parsed = storeSettingsInputSchema.parse({
      storeName: 'Toko Zaina',
      address: 'Jl. Trans Kalimantan',
      phone: '081234567890',
      timezone: 'Asia/Jakarta',
      defaultMinimumStock: 5,
    })

    expect(parsed.storeName).toBe('Toko Zaina')
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
  it('defaults omitted line and legacy discounts to zero', () => {
    const parsed = saleInputSchema.parse({
      idempotencyKey: '5a5ab2a3-67e4-4533-88be-9789209b0376',
      amountPaid: 10_000,
      items: [
        {
          productId: '55f49c79-6612-4c23-bdf4-5933dbda7794',
          unitId: 'bca82d90-f8e6-4251-99eb-e21609916b02',
          quantity: 1,
        },
      ],
    })

    expect(parsed.discount).toBe(0)
    expect(parsed.items[0]?.discountValue).toBe(0)
  })

  it('rejects a non-zero legacy transaction discount', () => {
    const result = saleInputSchema.safeParse({
      idempotencyKey: '5a5ab2a3-67e4-4533-88be-9789209b0376',
      discount: 1,
      amountPaid: 10_000,
      items: [
        {
          productId: '55f49c79-6612-4c23-bdf4-5933dbda7794',
          unitId: 'bca82d90-f8e6-4251-99eb-e21609916b02',
          quantity: 1,
          discountValue: 0,
        },
      ],
    })

    expect(result.success).toBe(false)
  })

  it('rejects a line discount with more than three decimal places', () => {
    const result = saleInputSchema.safeParse({
      idempotencyKey: '5a5ab2a3-67e4-4533-88be-9789209b0376',
      amountPaid: 10_000,
      items: [
        {
          productId: '55f49c79-6612-4c23-bdf4-5933dbda7794',
          unitId: 'bca82d90-f8e6-4251-99eb-e21609916b02',
          quantity: 1,
          discountValue: 1.0001,
        },
      ],
    })

    expect(result.success).toBe(false)
  })

  it('accepts a line discount with exactly three decimal places', () => {
    const parsed = saleInputSchema.parse({
      idempotencyKey: '5a5ab2a3-67e4-4533-88be-9789209b0376',
      amountPaid: 10_000,
      items: [
        {
          productId: '55f49c79-6612-4c23-bdf4-5933dbda7794',
          unitId: 'bca82d90-f8e6-4251-99eb-e21609916b02',
          quantity: 1,
          discountValue: 1.001,
        },
      ],
    })

    expect(parsed.items[0]?.discountValue).toBe(1.001)
  })

  it('rejects an empty cart', () => {
    const result = saleInputSchema.safeParse({
      idempotencyKey: '5a5ab2a3-67e4-4533-88be-9789209b0376',
      discount: 0,
      amountPaid: 0,
      items: [],
    })

    expect(result.success).toBe(false)
  })

  it('rejects duplicate products in one cart', () => {
    const productId = '55f49c79-6612-4c23-bdf4-5933dbda7794'
    const result = saleInputSchema.safeParse({
      idempotencyKey: '5a5ab2a3-67e4-4533-88be-9789209b0376',
      discount: 0,
      amountPaid: 20_000,
      items: [
        {
          productId,
          unitId: 'bca82d90-f8e6-4251-99eb-e21609916b02',
          quantity: 1,
        },
        {
          productId,
          unitId: 'd193a14e-3bca-4054-a4af-8349479a931c',
          quantity: 1,
        },
      ],
    })

    expect(result.success).toBe(false)
  })
})
