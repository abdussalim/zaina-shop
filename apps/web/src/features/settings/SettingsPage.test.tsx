import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SettingsPage } from './SettingsPage.js'

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
})
