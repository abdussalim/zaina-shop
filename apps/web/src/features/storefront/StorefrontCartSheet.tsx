import { useState } from 'react'
import { Minus, Plus, Trash2, X } from 'lucide-react'
import { buildWhatsAppLink, formatWhatsAppOrder } from '@zaina/shared'
import { formatCurrency } from '../../lib/format.js'
import type { CartItem, StorefrontInfo } from './types.js'

export function StorefrontCartSheet({
  cart,
  storeInfo,
  onClose,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
}: {
  cart: CartItem[]
  storeInfo: StorefrontInfo
  onClose: () => void
  onUpdateQuantity: (productId: string, unitId: string, quantity: number) => void
  onRemoveItem: (productId: string, unitId: string) => void
  onClearCart: () => void
}) {
  const [customerName, setCustomerName] = useState('')
  const [addressOrNotes, setAddressOrNotes] = useState('')
  const [error, setError] = useState<string>()

  const total = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)

  function handleCheckoutWhatsApp() {
    if (!customerName.trim()) {
      setError('Mohon isi nama Anda terlebih dahulu')
      return
    }

    if (!storeInfo.phone.trim()) {
      setError('Nomor WhatsApp toko belum diatur di pengaturan toko')
      return
    }

    const message = formatWhatsAppOrder({
      storeName: storeInfo.storeName || 'Toko Zaina',
      customerName: customerName.trim(),
      ...(addressOrNotes.trim() ? { customerAddressOrNotes: addressOrNotes.trim() } : {}),
      items: cart.map((i) => ({
        productName: i.productName,
        unitName: i.unitName,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        subtotal: i.unitPrice * i.quantity,
      })),
      total,
    })

    const waUrl = buildWhatsAppLink(storeInfo.phone, message)
    window.open(waUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <>
      <div className="modal__overlay" onClick={onClose} />
      <div className="modal modal--medium" style={{ padding: 'var(--space-4)', maxHeight: '90dvh' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Keranjang Belanja ({cart.length})</h2>
          <button type="button" className="btn btn--ghost" onClick={onClose} style={{ minHeight: '2.5rem' }} aria-label="Tutup keranjang">
            <X size={20} />
          </button>
        </div>

        {cart.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 'var(--space-8) var(--space-4)' }}>
            <p style={{ color: 'var(--ink-soft)' }}>Keranjang Anda masih kosong</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 'var(--space-4)', marginTop: 'var(--space-3)' }}>
            <div style={{ display: 'grid', gap: 'var(--space-2)', maxHeight: '35vh', overflowY: 'auto' }}>
              {cart.map((item) => (
                <div
                  key={`${item.productId}-${item.unitId}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: 'var(--space-2)',
                    alignItems: 'center',
                    padding: 'var(--space-2) 0',
                    borderBottom: '1px solid var(--line)',
                  }}
                >
                  <div>
                    <h4 style={{ margin: 0, fontSize: '0.88rem' }}>{item.productName}</h4>
                    <span style={{ fontSize: '0.75rem', color: 'var(--ink-soft)' }}>
                      {formatCurrency(item.unitPrice)} / {item.unitName}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <button
                      type="button"
                      className="btn btn--secondary"
                      style={{ width: '2rem', minHeight: '2rem', padding: 0 }}
                      onClick={() => onUpdateQuantity(item.productId, item.unitId, item.quantity - 1)}
                      aria-label={`Kurangi ${item.productName}`}
                    >
                      <Minus size={14} />
                    </button>
                    <span style={{ minWidth: '1.5rem', textAlign: 'center', fontWeight: 600, fontSize: '0.88rem' }}>
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      className="btn btn--secondary"
                      style={{ width: '2rem', minHeight: '2rem', padding: 0 }}
                      onClick={() => onUpdateQuantity(item.productId, item.unitId, item.quantity + 1)}
                      aria-label={`Tambah ${item.productName}`}
                    >
                      <Plus size={14} />
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      style={{ width: '2rem', minHeight: '2rem', padding: 0, color: 'var(--danger)' }}
                      onClick={() => onRemoveItem(item.productId, item.unitId)}
                      aria-label={`Hapus ${item.productName} dari keranjang`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600 }}>Total Belanja:</span>
              <strong style={{ fontSize: '1.2rem', color: 'var(--olive-dark)' }}>{formatCurrency(total)}</strong>
            </div>

            {error && (
              <div style={{ color: 'var(--danger)', fontSize: '0.8rem', background: '#ffebee', padding: '0.5rem', borderRadius: '4px' }}>
                {error}
              </div>
            )}

            <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.2rem' }}>
                  Nama Anda <span style={{ color: 'var(--danger)' }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Ibu Ani"
                  value={customerName}
                  onChange={(e) => {
                    setCustomerName(e.target.value)
                    if (error) setError(undefined)
                  }}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.2rem' }}>
                  Alamat Pengiriman / Catatan
                </label>
                <textarea
                  placeholder="Contoh: Jl. Mawar No. 5, tolong antar sebelum jam 3"
                  value={addressOrNotes}
                  onChange={(e) => setAddressOrNotes(e.target.value)}
                  rows={2}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={onClearCart}
                style={{ flex: '0 0 auto' }}
              >
                Kosongkan
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={handleCheckoutWhatsApp}
                style={{ flex: 1, backgroundColor: '#25D366', borderColor: '#25D366' }}
              >
                Pesan via WhatsApp
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
