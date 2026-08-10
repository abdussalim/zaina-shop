import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DashboardPage } from './DashboardPage.js'

describe('DashboardPage', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('presents daily business health and low-stock actions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              salesToday: 4,
              revenueToday: 450_000,
              profitToday: 125_000,
              totalProducts: 38,
              inventoryValue: 8_750_000,
              lowStockCount: 2,
              outOfStockCount: 1,
              recentSales: [],
              recentMovements: [],
              lowStockProducts: [
                {
                  id: 'product-1',
                  sku: 'GLS-001',
                  name: 'Gelas Motif Daun',
                  baseUnit: 'buah',
                  balanceBase: 6,
                  minimumStock: 12,
                },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(await screen.findByText('Rp450.000')).toBeInTheDocument()
    expect(screen.getByText('Gelas Motif Daun')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Terima stok' })).toHaveAttribute(
      'href',
      '/inventory?action=receive',
    )
  })
})
