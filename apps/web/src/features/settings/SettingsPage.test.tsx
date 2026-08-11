import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SettingsPage } from './SettingsPage.js'
import { ConnectivityProvider } from '../../app/ConnectivityContext.js'
import type { ConnectivityController } from '../../pwa/connectivity.js'

describe('SettingsPage', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('renders store field errors without sending invalid settings', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            storeName: 'Toko Zaina',
            address: null,
            phone: null,
            timezone: 'Asia/Jakarta',
            defaultMinimumStock: 5,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    render(
      <QueryClientProvider client={client}>
        <SettingsPage />
      </QueryClientProvider>,
    )
    const storeName = await screen.findByLabelText('Nama toko')
    fireEvent.change(storeName, { target: { value: '' } })

    fireEvent.click(screen.getByRole('button', { name: 'Simpan identitas' }))

    expect(await screen.findByText('Nama toko minimal 2 karakter')).toBeVisible()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('shows an online-only state when disconnected', () => {
    const controller: ConnectivityController = { getStatus: () => 'offline', getLastCheckedAt: () => null, subscribe: () => () => undefined, refresh: async () => false, dispose: () => undefined }
    render(<QueryClientProvider client={new QueryClient()}><ConnectivityProvider storeKey="user-1" controller={controller}><SettingsPage /></ConnectivityProvider></QueryClientProvider>)
    expect(screen.getByText('Pengaturan membutuhkan koneksi')).toBeInTheDocument()
  })
})
