import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { StoreSettings } from '../api/types.js'
import { AppShell } from './AppShell.js'

const customStore: StoreSettings = {
  storeName: 'Rumah Bening',
  address: 'Jl. Melati 5',
  phone: '08123456789',
  timezone: 'Asia/Makassar',
  defaultMinimumStock: 9,
}

describe('AppShell', () => {
  it('uses the saved store identity throughout the shell', () => {
    const queryClient = new QueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Routes>
            <Route
              element={
                <AppShell
                  user={{ id: 'user-1', username: 'owner', displayName: 'Pemilik' }}
                  storeSettings={customStore}
                  onLoggedOut={vi.fn()}
                />
              }
            >
              <Route index element={<div>Isi halaman</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )

    expect(screen.getAllByText('Rumah Bening')).toHaveLength(2)
    expect(screen.getByText('Isi halaman')).toBeInTheDocument()
  })
})
