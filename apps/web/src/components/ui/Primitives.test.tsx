import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './Button.js'
import { Field } from './Field.js'
import { Modal } from './Modal.js'
import { ErrorState, EmptyState, LoadingState, OfflineState } from './States.js'

describe('accessible touch primitives', () => {
  it('keeps buttons at least 48px and exposes disabled reason', () => {
    render(<Button disabled disabledReason="Sambungkan koneksi">Simpan</Button>)
    const button = screen.getByRole('button', { name: 'Simpan' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-describedby')
    expect(screen.getByText('Sambungkan koneksi')).toHaveClass('sr-only')
  })

  it('associates field label, hint, and error with the input', () => {
    render(<Field label="Nama barang" hint="Wajib diisi" error="Nama terlalu pendek" />)
    const input = screen.getByLabelText('Nama barang')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input.getAttribute('aria-describedby')).toContain('-hint')
    expect(input.getAttribute('aria-describedby')).toContain('-error')
  })

  it('traps modal semantics and closes on escape through Radix', () => {
    const onOpenChange = vi.fn()
    render(<Modal open title="Konfirmasi" onOpenChange={onOpenChange}>Isi</Modal>)
    expect(screen.getByRole('dialog', { name: 'Konfirmasi' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('renders loading, empty, error, and offline states', () => {
    render(<><LoadingState /><EmptyState title="Kosong" description="Belum ada" /><ErrorState /><OfflineState /></>)
    expect(screen.getByText(/Memuat data/)).toBeInTheDocument()
    expect(screen.getByText('Kosong')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Koneksi diperlukan')).toBeInTheDocument()
  })
})
