import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

  it('still completes logout cleanly even if logout request fails', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('Network offline'))
    const onLoggedOut = vi.fn()
    const queryClient = new QueryClient()

    try {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/dashboard']}>
            <Routes>
              <Route
                element={
                  <AppShell
                    user={{ id: 'user-1', username: 'owner', displayName: 'Pemilik' }}
                    storeSettings={customStore}
                    onLoggedOut={onLoggedOut}
                  />
                }
              >
                <Route path="/dashboard" element={<div>Dashboard</div>} />
              </Route>
              <Route path="/login" element={<div>Halaman Login</div>} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      )

      fireEvent.click(screen.getByRole('button', { name: 'Keluar dari aplikasi' }))
      await waitFor(() => expect(onLoggedOut).toHaveBeenCalledTimes(1))
      expect(await screen.findByText('Halaman Login')).toBeInTheDocument()
    } finally {
      fetchSpy.mockRestore()
    }
  })
})
