import { describe, expect, it } from 'vitest'

import { prepareSaleLine } from './sales.service.js'

describe('prepareSaleLine', () => {
  it('calculates and snapshots a percentage discount', () => {
    expect(
      prepareSaleLine(
        {
          productId: 'product-1',
          unitId: 'unit-piece',
          quantity: 2,
          discountValue: 10,
        },
        {
          productId: 'product-1',
          productName: 'Piring Kaca',
          unitId: 'unit-piece',
          unitName: 'buah',
          factor: 1,
          salePrice: 10_000,
          costPrice: 7_000,
          discountType: 'PERCENTAGE',
          minimumDiscount: 5,
          maximumDiscount: 20,
        },
      ),
    ).toMatchObject({
      quantityBase: 2,
      subtotal: 20_000,
      discountValue: 10,
      discountAmount: 2_000,
      total: 18_000,
      costTotal: 14_000,
    })
  })

  it('multiplies a fixed discount by purchased quantity', () => {
    expect(
      prepareSaleLine(
        {
          productId: 'product-1',
          unitId: 'unit-dozen',
          quantity: 2,
          discountValue: 5_000,
        },
        {
          productId: 'product-1',
          productName: 'Piring Kaca',
          unitId: 'unit-dozen',
          unitName: 'lusin',
          factor: 12,
          salePrice: 115_000,
          costPrice: 7_000,
          discountType: 'FIXED',
          minimumDiscount: 5_000,
          maximumDiscount: 10_000,
        },
      ),
    ).toMatchObject({
      quantityBase: 24,
      subtotal: 230_000,
      discountValue: 5_000,
      discountAmount: 10_000,
      total: 220_000,
      costTotal: 168_000,
    })
  })

  it('rejects a non-zero discount below the configured minimum', () => {
    let thrown: unknown
    try {
      prepareSaleLine(
        {
          productId: 'product-1',
          unitId: 'unit-piece',
          quantity: 1,
          discountValue: 1,
        },
        {
          productId: 'product-1',
          productName: 'Piring Kaca',
          unitId: 'unit-piece',
          unitName: 'buah',
          factor: 1,
          salePrice: 10_000,
          costPrice: 7_000,
          discountType: 'PERCENTAGE',
          minimumDiscount: 5,
          maximumDiscount: 20,
        },
      )
    } catch (error) {
      thrown = error
    }

    expect(thrown).toMatchObject({
      status: 422,
      code: 'DISCOUNT_OUT_OF_RANGE',
    })
  })
})
