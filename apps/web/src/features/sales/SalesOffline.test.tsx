import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { assertOnlineWrite, OfflineWriteError } from '../../api/client.js'
import { ConnectivityProvider } from '../../app/ConnectivityContext.js'
import type { ConnectivityController } from '../../pwa/connectivity.js'
import { SaleReceipt } from './SaleReceipt.js'

const controller: ConnectivityController = {
  getStatus: () => 'offline',
  getLastCheckedAt: () => null,
  subscribe: () => () => undefined,
  refresh: async () => false,
  dispose: () => undefined,
}

describe('online-only sales guard', () => {
  it('throws a typed error before any offline write', () => {
    expect(() => assertOnlineWrite(false)).toThrow(OfflineWriteError)
    expect(() => assertOnlineWrite(true)).not.toThrow()
  })

  it('shows an honest offline state for receipts', () => {
    render(<QueryClientProvider client={new QueryClient()}><ConnectivityProvider storeKey="user-1" controller={controller}><MemoryRouter initialEntries={['/sales/sale-1']}><Routes><Route path="/sales/:id" element={<SaleReceipt />} /></Routes></MemoryRouter></ConnectivityProvider></QueryClientProvider>)
    expect(screen.getByText('Nota membutuhkan koneksi')).toBeInTheDocument()
  })
})
