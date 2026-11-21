import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
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
        categories: [{ id: 'cat-1', name: 'Sembako', color: '#16a34a', isActive: true }],
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
            ],
          },
        ],
      })
    }
    return Promise.reject(new Error('Unknown url'))
  }),
}))

describe('StorefrontPage', () => {
  it('renders store header and products from catalog query', async () => {
    const queryClient = new QueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <StorefrontPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(await screen.findByText('Toko Zaina Test')).toBeInTheDocument()
    expect(await screen.findByText('Gula Pasir 1kg')).toBeInTheDocument()
    expect(screen.getByText(/Rp\s*17\.000/)).toBeInTheDocument()
  })
})
