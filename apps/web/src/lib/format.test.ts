import { describe, expect, it } from 'vitest'

import { formatDiscountRange } from './format.js'

describe('formatDiscountRange', () => {
  it('formats an inclusive percentage range', () => {
    expect(
      formatDiscountRange({
        discountType: 'PERCENTAGE',
        minimumDiscount: 5,
        maximumDiscount: 20,
      }),
    ).toBe('5%–20%')
  })

  it('formats an inclusive fixed rupiah range', () => {
    expect(
      formatDiscountRange({
        discountType: 'FIXED',
        minimumDiscount: 2_000,
        maximumDiscount: 5_000,
      }),
    ).toBe('Rp2.000–Rp5.000')
  })

  it('labels a zero range as no discount', () => {
    expect(
      formatDiscountRange({
        discountType: 'PERCENTAGE',
        minimumDiscount: 0,
        maximumDiscount: 0,
      }),
    ).toBe('Tanpa diskon')
  })
})
