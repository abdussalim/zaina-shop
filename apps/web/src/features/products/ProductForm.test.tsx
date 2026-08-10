import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ProductForm } from './ProductForm.js'

describe('ProductForm', () => {
  it('shows actionable field validation instead of silently blocking submit', async () => {
    const submit = vi.fn()
    render(
      <ProductForm
        categories={[
          { id: '10000000-0000-4000-8000-000000000001', name: 'Pecah Belah', color: '#B96947' },
        ]}
        pending={false}
        onSubmit={submit}
        onCancel={() => undefined}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Tambah barang' }))

    expect(await screen.findByText('Nama barang minimal 2 karakter')).toBeVisible()
    expect(screen.getByText('SKU wajib diisi')).toBeVisible()
    expect(submit).not.toHaveBeenCalled()
  })

  it('shows cross-unit validation when a second factor-one unit is added', async () => {
    const submit = vi.fn()
    render(
      <ProductForm
        categories={[
          { id: '10000000-0000-4000-8000-000000000001', name: 'Pecah Belah', color: '#B96947' },
        ]}
        pending={false}
        onSubmit={submit}
        onCancel={() => undefined}
      />,
    )
    fireEvent.change(screen.getByLabelText('Nama barang'), {
      target: { value: 'Piring Kaca' },
    })
    fireEvent.change(screen.getByLabelText('SKU'), { target: { value: 'PRG-001' } })
    fireEvent.click(screen.getByRole('button', { name: 'Tambah satuan' }))
    fireEvent.change(screen.getAllByLabelText('Nama')[1]!, {
      target: { value: 'ecer' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Tambah barang' }))

    expect(
      await screen.findByText('Hanya satuan dasar yang boleh memiliki faktor 1'),
    ).toBeVisible()
    expect(submit).not.toHaveBeenCalled()
  })
})
