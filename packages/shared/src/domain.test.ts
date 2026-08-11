import { describe, expect, it } from 'vitest'

import {
  calculateSaleTotals,
  getDiscountValidationMessage,
  toBaseQuantity,
} from './domain.js'

describe('toBaseQuantity', () => {
  it('converts a derived unit into the product base unit', () => {
    expect(toBaseQuantity(2, 12)).toBe(24)
  })

  it('normalizes fractional stock to three decimal places', () => {
    expect(toBaseQuantity(0.1, 3)).toBe(0.3)
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects an invalid conversion factor: %s',
    (factor) => {
      expect(() => toBaseQuantity(1, factor)).toThrow(
        'Faktor konversi harus berupa angka positif',
      )
    },
  )
})

describe('calculateSaleTotals', () => {
  it('aggregates percentage and fixed discounts from hand-checked lines', () => {
    expect(
      calculateSaleTotals([
        {
          quantity: 2,
          unitPrice: 15_000,
          discountType: 'PERCENTAGE',
          discountValue: 10,
        },
        {
          quantity: 1,
          unitPrice: 10_000,
          discountType: 'FIXED',
          discountValue: 1_000,
        },
      ]),
    ).toEqual({ subtotal: 40_000, discount: 4_000, total: 36_000 })
  })

  it('multiplies a fixed discount by fractional purchased quantity', () => {
    expect(
      calculateSaleTotals([
        {
          quantity: 1.5,
          unitPrice: 10_000,
          discountType: 'FIXED',
          discountValue: 1_250,
        },
      ]),
    ).toEqual({ subtotal: 15_000, discount: 1_875, total: 13_125 })
  })

  it('rounds a half rupiah up', () => {
    expect(
      calculateSaleTotals([
        {
          quantity: 1,
          unitPrice: 10,
          discountType: 'PERCENTAGE',
          discountValue: 5,
        },
      ]),
    ).toEqual({ subtotal: 10, discount: 1, total: 9 })
  })

  it('rejects a calculated line discount larger than its subtotal', () => {
    expect(() =>
      calculateSaleTotals([
        {
          quantity: 1,
          unitPrice: 10_000,
          discountType: 'FIXED',
          discountValue: 10_001,
        },
      ]),
    ).toThrow('Diskon tidak boleh melebihi subtotal')
  })
})

describe('getDiscountValidationMessage', () => {
  const percentageRule = {
    discountType: 'PERCENTAGE',
    minimumDiscount: 5,
    maximumDiscount: 20,
  } as const

  it('always accepts zero even when the configured minimum is greater', () => {
    expect(getDiscountValidationMessage(percentageRule, 0)).toBeUndefined()
  })

  it('returns the inclusive percentage range for an invalid value', () => {
    expect(getDiscountValidationMessage(percentageRule, 1)).toBe(
      'Gunakan 0 atau diskon 5%–20%',
    )
  })

  it('accepts a percentage value with exactly three decimal places', () => {
    expect(
      getDiscountValidationMessage(
        {
          discountType: 'PERCENTAGE',
          minimumDiscount: 1,
          maximumDiscount: 2,
        },
        1.001,
      ),
    ).toBeUndefined()
  })

  it('rejects a fractional fixed discount before checking its range', () => {
    expect(
      getDiscountValidationMessage(
        {
          discountType: 'FIXED',
          minimumDiscount: 2_000,
          maximumDiscount: 5_000,
        },
        2_000.5,
      ),
    ).toBe('Diskon nominal harus berupa rupiah bulat')
  })

  it('formats the fixed discount range in Indonesian rupiah', () => {
    expect(
      getDiscountValidationMessage(
        {
          discountType: 'FIXED',
          minimumDiscount: 2_000,
          maximumDiscount: 5_000,
        },
        1_000,
      ),
    ).toBe('Gunakan 0 atau diskon Rp2.000–Rp5.000')
  })
})
