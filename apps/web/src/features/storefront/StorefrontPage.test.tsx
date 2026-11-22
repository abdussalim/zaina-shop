import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StorefrontPage } from './StorefrontPage.js'

const REAL_ADDRESS =
  'Jl. Patih Rumbih No. 35, Selat Tengah, Kec. Selat, Kabupaten Kapuas, Kalimantan Tengah 73516'

vi.mock('../../api/client.js', () => ({
  apiRequest: vi.fn((url: string) => {
    if (url.includes('/info')) {
      return Promise.resolve({
        storeName: 'Toko Zaina',
        address: REAL_ADDRESS,
        phone: '088744982845',
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
  let openSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    localStorage.clear()
    document.body.style.overflow = ''
    openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
  })

  afterEach(() => {
    openSpy.mockRestore()
  })

  it('renders boutique hero without cart/delivery copy, plus store map and catalog products', async () => {
    const { container } = renderStorefront()

    expect(
      await screen.findByText('Cek katalog & ketersediaan barang.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Zaina Arsyi · Kuala Kapuas · Tanya stok via WhatsApp'),
    ).toBeInTheDocument()
    expect(container.querySelectorAll('.brand-logo__mark')).toHaveLength(2)

    expect(await screen.findByText('Gula Pasir 1kg')).toBeInTheDocument()
    expect(screen.getByText(/Rp\s*17\.000/)).toBeInTheDocument()
    expect(screen.getByText('2 satuan')).toBeInTheDocument()

    // No cart UI or delivery wording anywhere
    expect(screen.queryByRole('button', { name: /Keranjang/i })).not.toBeInTheDocument()
    expect(container.textContent).not.toMatch(/keranjang/i)
    expect(container.textContent).not.toMatch(/\bantar\b|pengantaran/i)

    // Store address & embedded Google Map iframe
    expect(screen.getByText('Mampir langsung ke Toko Zaina')).toBeInTheDocument()
    const visitSection = screen.getByRole('region', { name: 'Kunjungi Toko Kami' })
    expect(within(visitSection).getByText(REAL_ADDRESS)).toBeInTheDocument()
    const mapFrame = screen.getByTitle('Peta lokasi Toko Zaina')
    expect(mapFrame).toHaveAttribute('src', expect.stringContaining('maps.google.com/maps'))
    expect(mapFrame).toHaveAttribute('src', expect.stringContaining('Patih+Rumbih'))

    const mapsLink = screen.getByRole('link', { name: /Buka di Google Maps/i })
    expect(mapsLink).toHaveAttribute('href', expect.stringContaining('google.com/maps/search'))
    expect(mapsLink).toHaveAttribute('target', '_blank')

    const staffLink = screen.getByRole('link', { name: /Staf/i })
    expect(staffLink).toHaveAttribute('href', '/login')
  })

  it('links staff header button to /dashboard when isStaff is true', async () => {
    renderStorefront(true)

    expect(
      await screen.findByText('Cek katalog & ketersediaan barang.'),
    ).toBeInTheDocument()
    const staffLink = screen.getByRole('link', { name: /Panel Kasir/i })
    expect(staffLink).toHaveAttribute('href', '/dashboard')
  })

  it('opens product detail sheet, picks unit & quick question, and launches WhatsApp link', async () => {
    renderStorefront()

    const tanyaBtn = await screen.findByRole('button', {
      name: 'Tanya Gula Pasir 1kg',
    })
    fireEvent.click(tanyaBtn)

    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(screen.getByText('Detail Produk')).toBeInTheDocument()
    expect(document.body.style.overflow).toBe('hidden')

    fireEvent.click(within(dialog).getByRole('button', { name: /dus/i }))
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: 'Boleh info harga grosir / beli banyak?',
      }),
    )
    fireEvent.change(
      within(dialog).getByLabelText('Tulis pertanyaan lain (opsional)'),
      { target: { value: 'Saya mau ambil 2 dus sore ini' } },
    )

    fireEvent.click(within(dialog).getByRole('button', { name: /Tanya via WhatsApp/i }))

    expect(openSpy).toHaveBeenCalledTimes(1)
    const [waUrl, target, features] = openSpy.mock.calls[0]!
    expect(waUrl).toContain('https://wa.me/6288744982845?text=')
    expect(waUrl).toContain(encodeURIComponent('Gula Pasir 1kg'))
    expect(waUrl).toContain(encodeURIComponent('dus'))
    expect(waUrl).toContain(encodeURIComponent('Boleh info harga grosir / beli banyak?'))
    expect(waUrl).toContain(encodeURIComponent('Saya mau ambil 2 dus sore ini'))
    expect(target).toBe('_blank')
    expect(features).toBe('noopener,noreferrer')

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.body.style.overflow).toBe('')
  })

  it('opens general WhatsApp inquiry sheet and sends topic inquiry', async () => {
    renderStorefront()

    await screen.findByText('Gula Pasir 1kg')
    fireEvent.click(screen.getByRole('button', { name: 'Tanya Toko via WhatsApp' }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Tanya Toko via WhatsApp')).toBeInTheDocument()

    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Tanya petunjuk arah ke toko' }),
    )
    fireEvent.change(
      within(dialog).getByLabelText('Detail pertanyaan (opsional)'),
      { target: { value: 'Patokan dari bundaran besar sebelah mana ya?' } },
    )

    fireEvent.click(within(dialog).getByRole('button', { name: /Kirim ke WhatsApp/i }))

    expect(openSpy).toHaveBeenCalledTimes(1)
    const [waUrl] = openSpy.mock.calls[0]!
    expect(waUrl).toContain('https://wa.me/6288744982845?text=')
    expect(waUrl).toContain(encodeURIComponent('Tanya petunjuk arah ke toko'))
    expect(waUrl).toContain(
      encodeURIComponent('Patokan dari bundaran besar sebelah mana ya?'),
    )
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
