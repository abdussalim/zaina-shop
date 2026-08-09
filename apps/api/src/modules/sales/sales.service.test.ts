import { describe, expect, it } from 'vitest'

import { prepareSaleLine } from './sales.service.js'

describe('prepareSaleLine', () => {
  it('snapshots a dozen as twelve base units at the catalog price', () => {
    expect(
      prepareSaleLine(
        { productId: 'product-1', unitId: 'unit-1', quantity: 1 },
        {
          productId: 'product-1',
          productName: 'Piring Kaca',
          unitId: 'unit-1',
          unitName: 'lusin',
          factor: 12,
          salePrice: 115_000,
          costPrice: 7_000,
        },
      ),
    ).toMatchObject({ quantityBase: 12, subtotal: 115_000, costTotal: 84_000 })
  })
})
