import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StorefrontPage } from './StorefrontPage.js'

vi.mock('../../api/client.js', () => ({
  apiRequest: vi.fn((url: string) => {
    if (url.includes('/info')) {
      return Promise.resolve({
        storeName: 'Toko Zaina Test',
        address: 'Jl. Ahmad Yani',
        phone: '08123456789',
      })
    }
    if (url.includes('/catalog')) {
      return Promise.resolve({
        categories: [
          { id: 'cat-1', name: 'Sembako', color: '#16a34a', isActive: true },
          { id: 'cat-2', name: 'Minuman', color: '#2563eb', isActive: true },
        ],
        products: [
          {
            id: 'prod-1',
            name: 'Gula Pasir 1kg',
            categoryId: 'cat-1',
            categoryName: 'Sembako',
            categoryColor: '#16a34a',
            baseUnit: 'bungkus',
            imageUrl: null,
            stockStatus: 'OK',
            units: [
              { id: 'unit-1', name: 'bungkus', factor: 1, salePrice: 17_000, isDefault: true },
              { id: 'unit-2', name: 'dus', factor: 10, salePrice: 165_000, isDefault: false },
            ],
          },
          {
            id: 'prod-2',
            name: 'Air Mineral 600ml',
            categoryId: 'cat-2',
            categoryName: 'Minuman',
            categoryColor: '#2563eb',
            baseUnit: 'botol',
            imageUrl: null,
            stockStatus: 'LOW',
            units: [
              { id: 'unit-3', name: 'botol', factor: 1, salePrice: 4_000, isDefault: true },
            ],
          },
        ],
      })
    }
    return Promise.reject(new Error('Unknown url'))
  }),
}))

function renderStorefront(isStaff?: boolean) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <StorefrontPage isStaff={isStaff} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('StorefrontPage', () => {
  beforeEach(() => {
    localStorage.clear()
    document.body.style.overflow = ''
  })

  it('renders boutique hero, store header, and catalog products', async () => {
    renderStorefront()

    expect(await screen.findByText('Toko Zaina Test')).toBeInTheDocument()
    expect(
      screen.getByText('Kebutuhan rumah tangga, siap antar dari rak kami.'),
    ).toBeInTheDocument()
    expect(await screen.findByText('Gula Pasir 1kg')).toBeInTheDocument()
    expect(screen.getByText(/Rp\s*17\.000/)).toBeInTheDocument()
    expect(screen.getByText('2 satuan')).toBeInTheDocument()

    const staffLink = screen.getByRole('link', { name: /Staf/i })
    expect(staffLink).toHaveAttribute('href', '/login')
  })

  it('links staff header button to /dashboard when isStaff is true', async () => {
    renderStorefront(true)

    expect(await screen.findByText('Toko Zaina Test')).toBeInTheDocument()
    const staffLink = screen.getByRole('link', { name: /Panel Kasir/i })
    expect(staffLink).toHaveAttribute('href', '/dashboard')
  })

  it('quick-adds single-unit product straight to cart without opening modal', async () => {
    renderStorefront()

    const quickAddBtn = await screen.findByRole('button', {
      name: 'Tambah Air Mineral 600ml ke keranjang',
    })
    fireEvent.click(quickAddBtn)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('1 di keranjang')).toBeInTheDocument()
    expect(screen.getByText('1 Barang')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Lihat Keranjang/i })).toBeInTheDocument()
  })

  it('opens product detail sheet, switches unit, adds to cart, and validates checkout', async () => {
    renderStorefront()

    const selectButton = await screen.findByRole('button', {
      name: 'Pilih Gula Pasir 1kg',
    })
    fireEvent.click(selectButton)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Detail Produk')).toBeInTheDocument()
    expect(document.body.style.overflow).toBe('hidden')

    fireEvent.click(screen.getByRole('button', { name: /dus/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Tambah jumlah' }))
    expect(screen.getByText(/Rp\s*330\.000/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Tambah ke Keranjang' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.body.style.overflow).toBe('')
    expect(screen.getByText('2 Barang')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Lihat Keranjang/i }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Keranjang Belanja (1)')).toBeInTheDocument()
    expect(screen.getByText(/165\.000 \/ dus/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Pesan via WhatsApp' }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Mohon isi nama Anda terlebih dahulu',
    )

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('filters products and resets search from empty state', async () => {
    renderStorefront()

    await screen.findByText('Gula Pasir 1kg')

    const searchInput = screen.getByRole('searchbox', { name: 'Cari produk toko' })
    fireEvent.change(searchInput, { target: { value: 'BarangTidakAda' } })

    expect(screen.getByText('Produk tidak ditemukan')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Reset Pencarian' }))
    expect(screen.getByText('Gula Pasir 1kg')).toBeInTheDocument()
    expect(screen.getByText('Air Mineral 600ml')).toBeInTheDocument()
  })
})
