import { describe, expect, it } from 'vitest'

import { calculateSaleTotals, toBaseQuantity } from './domain.js'

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
  it('calculates subtotal, discount, and total from hand-checked values', () => {
    expect(
      calculateSaleTotals(
        [
          { quantity: 2, unitPrice: 15_000 },
          { quantity: 1, unitPrice: 10_000 },
        ],
        5_000,
      ),
    ).toEqual({ subtotal: 40_000, discount: 5_000, total: 35_000 })
  })

  it('rejects a discount larger than the subtotal', () => {
    expect(() =>
      calculateSaleTotals([{ quantity: 1, unitPrice: 10_000 }], 10_001),
    ).toThrow('Diskon tidak boleh melebihi subtotal')
  })
})
