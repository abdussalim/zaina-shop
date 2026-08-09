import { describe, expect, it } from 'vitest'

import { calculateMovementDelta } from './inventory.service.js'

describe('calculateMovementDelta', () => {
  it('converts incoming stock into a positive base quantity', () => {
    expect(calculateMovementDelta('RECEIPT', 1, 12)).toBe(12)
  })

  it('converts damaged stock into a negative base quantity', () => {
    expect(calculateMovementDelta('DAMAGE', 2, 1)).toBe(-2)
  })

  it('normalizes fractional base quantities to three decimal places', () => {
    expect(calculateMovementDelta('ADJUSTMENT_IN', 0.1, 3)).toBe(0.3)
  })
})
