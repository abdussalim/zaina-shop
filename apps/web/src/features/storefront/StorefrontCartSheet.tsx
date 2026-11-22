import { useEffect, useState } from 'react'
import { AlertCircle, MessageCircle, Minus, Package, Plus, ShoppingBag, Trash2, X } from 'lucide-react'
import { buildWhatsAppLink, formatWhatsAppOrder } from '@zaina/shared'
import { Button } from '../../components/ui/Button.js'
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

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

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
      <div className="modal__overlay" onClick={onClose} aria-hidden="true" />
      <div
        className="modal modal--medium storefront-sheet storefront-cart-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-sheet-title"
      >
        <div className="modal__handle" aria-hidden="true" />

        <div className="storefront-sheet__header">
          <h2 id="cart-sheet-title" className="storefront-sheet__title">
            Keranjang Belanja ({cart.length})
          </h2>
          <button
            type="button"
            className="icon-button storefront-sheet__close"
            onClick={onClose}
            aria-label="Tutup keranjang"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {cart.length === 0 ? (
          <div className="storefront-sheet__body">
            <div className="storefront-cart-empty">
              <span className="storefront-cart-empty__icon" aria-hidden="true">
                <ShoppingBag size={24} />
              </span>
              <p>Keranjang Anda masih kosong</p>
              <small>Pilih barang di etalase terlebih dahulu untuk mulai memesan.</small>
              <Button type="button" variant="secondary" onClick={onClose}>
                Lihat Produk
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="storefront-sheet__body">
              <div className="storefront-cart-list">
                {cart.map((item) => (
                  <div
                    key={`${item.productId}-${item.unitId}`}
                    className="storefront-cart-item"
                  >
                    <div className="storefront-cart-item__thumb" aria-hidden="true">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt="" />
                      ) : (
                        <Package size={18} />
                      )}
                    </div>

                    <div className="storefront-cart-item__info">
                      <h4>{item.productName}</h4>
                      <span className="storefront-cart-item__unit">
                        {formatCurrency(item.unitPrice)} / {item.unitName}
                      </span>
                      <strong className="storefront-cart-item__subtotal">
                        {formatCurrency(item.unitPrice * item.quantity)}
                      </strong>
                    </div>

                    <div className="storefront-cart-item__controls">
                      <button
                        type="button"
                        className="button button--secondary storefront-cart-stepper__btn"
                        onClick={() =>
                          onUpdateQuantity(item.productId, item.unitId, item.quantity - 1)
                        }
                        aria-label={`Kurangi ${item.productName}`}
                      >
                        <Minus size={14} aria-hidden="true" />
                      </button>
                      <span className="storefront-cart-stepper__val">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        className="button button--secondary storefront-cart-stepper__btn"
                        onClick={() =>
                          onUpdateQuantity(item.productId, item.unitId, item.quantity + 1)
                        }
                        aria-label={`Tambah ${item.productName}`}
                      >
                        <Plus size={14} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="button button--ghost storefront-cart-item__remove"
                        onClick={() => onRemoveItem(item.productId, item.unitId)}
                        aria-label={`Hapus ${item.productName} dari keranjang`}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="storefront-cart-summary">
                <span>Total Belanja</span>
                <strong>{formatCurrency(total)}</strong>
              </div>

              {error && (
                <div className="form-alert" role="alert">
                  <AlertCircle size={18} aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              <div className="storefront-cart-form">
                <div className={`field ${error && !customerName.trim() ? 'field--error' : ''}`}>
                  <label htmlFor="storefront-customer-name" className="field__label">
                    Nama Anda <span className="storefront-required">*</span>
                  </label>
                  <input
                    id="storefront-customer-name"
                    type="text"
                    placeholder="Contoh: Ibu Ani"
                    value={customerName}
                    onChange={(e) => {
                      setCustomerName(e.target.value)
                      if (error) setError(undefined)
                    }}
                  />
                  <p className="field__message">
                    Agar penjual mudah mengenali pesanan Anda
                  </p>
                </div>

                <div className="field">
                  <label htmlFor="storefront-customer-notes" className="field__label">
                    Alamat / Catatan Pengiriman
                  </label>
                  <textarea
                    id="storefront-customer-notes"
                    placeholder="Contoh: Jl. Mawar No. 5, antar sebelum jam 3 sore"
                    value={addressOrNotes}
                    onChange={(e) => setAddressOrNotes(e.target.value)}
                    rows={2}
                  />
                  <p className="field__message">
                    Opsional — isi jika perlu diantar atau ada catatan khusus
                  </p>
                </div>
              </div>
            </div>

            <div className="storefront-sheet__footer">
              <div className="storefront-cart-sheet__actions">
                <Button type="button" variant="ghost" onClick={onClearCart}>
                  Kosongkan
                </Button>
                <button
                  type="button"
                  className="button storefront-wa-btn"
                  onClick={handleCheckoutWhatsApp}
                >
                  <MessageCircle size={18} aria-hidden="true" />
                  <span>Pesan via WhatsApp</span>
                </button>
              </div>
              <p className="storefront-cart-sheet__reassurance">
                Pesanan otomatis terbuka di WhatsApp toko — tanpa perlu bikin akun
              </p>
            </div>
          </>
        )}
      </div>
    </>
  )
}
