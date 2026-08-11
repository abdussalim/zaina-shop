import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ProductForm } from './ProductForm.js'

describe('ProductForm', () => {
  const categories = [
    {
      id: '10000000-0000-4000-8000-000000000001',
      name: 'Pecah Belah',
      color: '#B96947',
    },
  ]

  it('shows actionable field validation instead of silently blocking submit', async () => {
    const submit = vi.fn()
    render(
      <ProductForm
        categories={categories}
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
        categories={categories}
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

  it('submits a fixed discount range for the base selling unit', async () => {
    const submit = vi.fn()
    render(
      <ProductForm
        categories={categories}
        pending={false}
        onSubmit={submit}
        onCancel={() => undefined}
      />,
    )

    fireEvent.change(screen.getByLabelText('Nama barang'), {
      target: { value: 'Piring Kaca' },
    })
    fireEvent.change(screen.getByLabelText('SKU'), { target: { value: 'PRG-002' } })
    fireEvent.change(screen.getByLabelText('Harga jual / satuan dasar'), {
      target: { value: '10000' },
    })
    fireEvent.change(screen.getByLabelText('Jenis diskon satuan 1'), {
      target: { value: 'FIXED' },
    })
    fireEvent.change(screen.getByLabelText('Diskon minimum satuan 1'), {
      target: { value: '2000' },
    })
    fireEvent.change(screen.getByLabelText('Diskon maksimum satuan 1'), {
      target: { value: '5000' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Tambah barang' }))

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1))
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        units: [
          expect.objectContaining({
            discountType: 'FIXED',
            minimumDiscount: 2_000,
            maximumDiscount: 5_000,
          }),
        ],
      }),
    )
  })

  it('shows a unit error when fixed discount exceeds its sale price', async () => {
    const submit = vi.fn()
    render(
      <ProductForm
        categories={categories}
        pending={false}
        onSubmit={submit}
        onCancel={() => undefined}
      />,
    )

    fireEvent.change(screen.getByLabelText('Nama barang'), {
      target: { value: 'Piring Kaca' },
    })
    fireEvent.change(screen.getByLabelText('SKU'), { target: { value: 'PRG-003' } })
    fireEvent.change(screen.getByLabelText('Harga jual / satuan dasar'), {
      target: { value: '10000' },
    })
    fireEvent.change(screen.getByLabelText('Jenis diskon satuan 1'), {
      target: { value: 'FIXED' },
    })
    fireEvent.change(screen.getByLabelText('Diskon minimum satuan 1'), {
      target: { value: '2000' },
    })
    fireEvent.change(screen.getByLabelText('Diskon maksimum satuan 1'), {
      target: { value: '10001' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Tambah barang' }))

    expect(
      await screen.findByText('Diskon nominal tidak boleh melebihi harga jual'),
    ).toBeVisible()
    expect(submit).not.toHaveBeenCalled()
  })
})
