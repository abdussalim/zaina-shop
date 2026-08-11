import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { ConnectivityProvider } from '../../app/ConnectivityContext.js'
import type { ConnectivityController } from '../../pwa/connectivity.js'
import type { SnapshotStore } from '../../pwa/types.js'
import { ProductsPage } from './ProductsPage.js'

const controller: ConnectivityController = {
  getStatus: () => 'offline',
  getLastCheckedAt: () => null,
  subscribe: () => () => undefined,
  refresh: async () => false,
  dispose: () => undefined,
}

describe('ProductsPage offline', () => {
  it('renders sanitized snapshot data and disables server writes', async () => {
    const store: SnapshotStore = {
      read: async () => ({ version: 1, storeKey: 'user-1', updatedAt: '2026-08-11T00:00:00.000Z', products: [{ id: 'p-1', sku: 'G-1', name: 'Gelas kaca', category: 'Pecah belah', location: 'Rak A', baseUnit: 'pcs', salePrice: 20_000, minimumDiscountPercent: 0, maximumDiscountPercent: 10, minimumStock: 2, balance: 1, stockStatus: 'LOW', units: [] }] }),
      write: async () => undefined,
      clear: async () => undefined,
      clearAll: async () => undefined,
    }
    render(<QueryClientProvider client={new QueryClient()}><ConnectivityProvider storeKey="user-1" controller={controller} snapshotStore={store}><MemoryRouter><ProductsPage /></MemoryRouter></ConnectivityProvider></QueryClientProvider>)
    expect(await screen.findByText('Gelas kaca')).toBeInTheDocument()
    expect(screen.getByText(/snapshot/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Tambah barang/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Harga modal / satuan dasar')).not.toBeInTheDocument()
  })
})
