import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { Product } from '../../api/types.js'
import { MovementForm } from './MovementForm.js'

const product: Product = {
  id: 'product-1',
  categoryId: 'category-1',
  category: { id: 'category-1', name: 'Pecah Belah', color: '#B96947' },
  sku: 'PRG-001',
  barcode: null,
  name: 'Piring Kaca',
  location: 'Rak A1',
  baseUnit: 'buah',
  costPrice: 7_000,
  salePrice: 10_000,
  minimumStock: 5,
  imageUrl: null,
  isActive: true,
  balanceBase: 24,
  stockStatus: 'OK',
  units: [
    {
      id: 'unit-piece',
      name: 'buah',
      factor: 1,
      salePrice: 10_000,
      isDefault: true,
      discountType: 'PERCENTAGE',
      minimumDiscount: 0,
      maximumDiscount: 0,
    },
    {
      id: 'unit-dozen',
      name: 'lusin',
      factor: 12,
      salePrice: 115_000,
      isDefault: false,
      discountType: 'PERCENTAGE',
      minimumDiscount: 0,
      maximumDiscount: 0,
    },
  ],
}

describe('MovementForm', () => {
  it('suggests a unit cost that follows the selected conversion', async () => {
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MovementForm
          products={[product]}
          onSuccess={vi.fn()}
          onCancel={vi.fn()}
        />
      </QueryClientProvider>,
    )

    expect(screen.getByLabelText(/Harga modal per buah/)).toHaveValue(7_000)
    await user.selectOptions(screen.getByLabelText('Satuan input'), 'unit-dozen')
    expect(screen.getByLabelText(/Harga modal per lusin/)).toHaveValue(84_000)
  })
})
