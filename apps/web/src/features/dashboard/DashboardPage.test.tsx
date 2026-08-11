import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DashboardPage } from './DashboardPage.js'
import { ConnectivityProvider } from '../../app/ConnectivityContext.js'
import type { ConnectivityController } from '../../pwa/connectivity.js'
import type { SnapshotStore } from '../../pwa/types.js'

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

  it('shows only catalog and stock cards when offline', async () => {
    const offlineController: ConnectivityController = {
      getStatus: () => 'offline',
      getLastCheckedAt: () => null,
      subscribe: () => () => undefined,
      refresh: async () => false,
      dispose: () => undefined,
    }
    const snapshotStore: SnapshotStore = {
      read: async () => ({ version: 1, storeKey: 'user-1', updatedAt: '2026-08-11T00:00:00.000Z', products: [{ id: 'p-1', sku: 'G-1', name: 'Gelas', category: 'Pecah belah', location: 'Rak A', baseUnit: 'pcs', salePrice: 20_000, minimumDiscountPercent: 0, maximumDiscountPercent: 10, minimumStock: 2, balance: 1, stockStatus: 'LOW', units: [] }] }),
      write: async () => undefined,
      clear: async () => undefined,
      clearAll: async () => undefined,
    }
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <ConnectivityProvider storeKey="user-1" controller={offlineController} snapshotStore={snapshotStore}>
          <MemoryRouter><DashboardPage /></MemoryRouter>
        </ConnectivityProvider>
      </QueryClientProvider>,
    )
    expect(await screen.findByText('Gelas')).toBeInTheDocument()
    expect(screen.queryByText('Omzet hari ini')).not.toBeInTheDocument()
  })
})
