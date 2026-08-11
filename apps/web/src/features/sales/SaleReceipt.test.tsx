import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SaleReceipt } from './SaleReceipt.js'

function renderReceipt() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/sales/sale-1']}>
        <Routes>
          <Route path="/sales/:id" element={<SaleReceipt />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('SaleReceipt', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows gross, discount, and net values from the saved sale-item snapshot', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              id: 'sale-1',
              saleNumber: 'INV-20260811-0001',
              soldAt: '2026-08-11T05:00:00.000Z',
              status: 'COMPLETED',
              subtotal: 20_000,
              discount: 2_000,
              total: 18_000,
              amountPaid: 20_000,
              changeAmount: 2_000,
              note: null,
              cancelledAt: null,
              cancellationReason: null,
              items: [
                {
                  id: 'item-1',
                  productId: 'product-1',
                  unitId: 'unit-piece',
                  productName: 'Piring Kaca Bening',
                  unitName: 'buah',
                  factorSnapshot: 1,
                  quantityInput: 2,
                  quantityBase: 2,
                  unitPrice: 10_000,
                  costPrice: 7_000,
                  subtotal: 20_000,
                  discountTypeSnapshot: 'PERCENTAGE',
                  minimumDiscountSnapshot: 5,
                  maximumDiscountSnapshot: 20,
                  discountValue: 10,
                  discountAmount: 2_000,
                  total: 18_000,
                },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )

    renderReceipt()

    const productName = await screen.findByText('Piring Kaca Bening')
    const row = productName.closest('.receipt__row') as HTMLElement
    expect(within(row).getByText('Rp20.000')).toBeVisible()
    expect(within(row).getByText('− Rp2.000')).toBeVisible()
    expect(within(row).getByText('Rp18.000')).toBeVisible()
    expect(within(row).getByText('Diskon 10%')).toBeVisible()
    expect(screen.getByText('Total').nextElementSibling).toHaveTextContent('Rp18.000')
  })
})
