import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SalesPage } from './SalesPage.js'

const products = [
  {
    id: 'product-1',
    categoryId: 'category-1',
    category: { id: 'category-1', name: 'Pecah Belah', color: '#B96947' },
    sku: 'PRG-001',
    barcode: null,
    name: 'Piring Kaca Bening',
    location: 'Rak A1',
    baseUnit: 'buah',
    costPrice: 7_000,
    salePrice: 10_000,
    minimumStock: 6,
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
        discountType: 'PERCENTAGE' as const,
        minimumDiscount: 5,
        maximumDiscount: 20,
      },
      {
        id: 'unit-dozen',
        name: 'lusin',
        factor: 12,
        salePrice: 115_000,
        isDefault: false,
        discountType: 'FIXED' as const,
        minimumDiscount: 5_000,
        maximumDiscount: 10_000,
      },
    ],
  },
]

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SalesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('SalesPage', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows the base-stock conversion and catalog price for a selected unit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: products }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
    const user = userEvent.setup()
    renderPage()

    await user.click(
      await screen.findByRole('button', { name: /Piring Kaca Bening/ }, { timeout: 5_000 }),
    )
    await user.selectOptions(screen.getByLabelText('Satuan'), 'unit-dozen')
    await user.clear(screen.getByLabelText('Jumlah'))
    await user.type(screen.getByLabelText('Jumlah'), '1')

    expect(screen.getByText('12 buah dari stok')).toBeInTheDocument()
    expect(screen.getAllByText('Rp115.000').length).toBeGreaterThan(0)
  })

  it('keeps the cart when checkout fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: products }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: 'INSUFFICIENT_STOCK',
              message: 'Stok Piring Kaca Bening tidak mencukupi',
              requestId: 'req-sale',
            },
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderPage()

    await user.click(
      await screen.findByRole('button', { name: /Piring Kaca Bening/ }, { timeout: 5_000 }),
    )
    await user.type(screen.getByLabelText('Jumlah dibayar'), '10000')
    await user.click(screen.getByRole('button', { name: 'Selesaikan penjualan' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Stok Piring Kaca Bening tidak mencukupi',
    )
    const cart = screen.getByText('Keranjang').closest('aside')!
    expect(within(cart).getByText('Piring Kaca Bening')).toBeInTheDocument()
  })

  it('does not allow checkout with an empty quantity', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: products }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
    const user = userEvent.setup()
    renderPage()

    await user.click(
      await screen.findByRole('button', { name: /Piring Kaca Bening/ }, { timeout: 5_000 }),
    )
    await user.type(screen.getByLabelText('Jumlah dibayar'), '10000')
    await user.clear(screen.getByLabelText('Jumlah'))

    expect(screen.getByRole('button', { name: 'Selesaikan penjualan' })).toBeDisabled()
  })

  it('reuses the idempotency key when the same checkout is retried', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: products }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockRejectedValueOnce(new TypeError('network interrupted'))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { code: 'TEMPORARY', message: 'Coba kembali' } }),
          { status: 503, headers: { 'Content-Type': 'application/json' } },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    renderPage()

    await user.click(
      await screen.findByRole('button', { name: /Piring Kaca Bening/ }, { timeout: 5_000 }),
    )
    await user.type(screen.getByLabelText('Jumlah dibayar'), '10000')
    const submit = screen.getByRole('button', { name: 'Selesaikan penjualan' })
    await user.click(submit)
    await screen.findByRole('alert')
    await user.click(submit)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))

    const firstBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as {
      idempotencyKey: string
    }
    const secondBody = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body)) as {
      idempotencyKey: string
    }
    expect(secondBody.idempotencyKey).toBe(firstBody.idempotencyKey)
  })
})
