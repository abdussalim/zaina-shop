import { MemoryRouter } from 'react-router-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LoginPage } from './LoginPage.js'

describe('LoginPage', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('signs in with the shared store account and preserves clear feedback', async () => {
    const onAuthenticated = vi.fn()
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { id: 'user-1', username: 'toko', displayName: 'Pengelola Toko' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <LoginPage onAuthenticated={onAuthenticated} />
      </MemoryRouter>,
    )
    await user.type(screen.getByLabelText('Nama pengguna'), 'toko')
    await user.type(screen.getByLabelText('Kata sandi'), 'rahasia-yang-kuat')
    await user.click(screen.getByRole('button', { name: 'Masuk ke aplikasi' }))

    expect(await screen.findByText('Selamat datang kembali')).toBeInTheDocument()
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledTimes(1))
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/auth/login',
      expect.objectContaining({ credentials: 'include', method: 'POST' }),
    )
  })

  it('keeps the submitted username when authentication fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: 'INVALID_CREDENTIALS',
              message: 'Nama pengguna atau kata sandi salah',
              requestId: 'req-1',
            },
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )

    render(
      <MemoryRouter>
        <LoginPage onAuthenticated={vi.fn()} />
      </MemoryRouter>,
    )
    fireEvent.change(screen.getByLabelText('Nama pengguna'), {
      target: { value: 'toko' },
    })
    fireEvent.change(screen.getByLabelText('Kata sandi'), {
      target: { value: 'kata-sandi-salah' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Masuk ke aplikasi' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Nama pengguna atau kata sandi salah',
    )
    expect(screen.getByLabelText('Nama pengguna')).toHaveValue('toko')
  })
})
