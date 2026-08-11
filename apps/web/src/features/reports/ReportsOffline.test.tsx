import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { ConnectivityProvider } from '../../app/ConnectivityContext.js'
import type { ConnectivityController } from '../../pwa/connectivity.js'
import { ReportsPage } from './ReportsPage.js'

const controller: ConnectivityController = {
  getStatus: () => 'offline',
  getLastCheckedAt: () => null,
  subscribe: () => () => undefined,
  refresh: async () => false,
  dispose: () => undefined,
}

describe('ReportsPage offline', () => {
  it('rejects business report cache explicitly', () => {
    render(<QueryClientProvider client={new QueryClient()}><ConnectivityProvider storeKey="user-1" controller={controller}><MemoryRouter><ReportsPage /></MemoryRouter></ConnectivityProvider></QueryClientProvider>)
    expect(screen.getByText('Laporan membutuhkan koneksi')).toBeInTheDocument()
  })
})
