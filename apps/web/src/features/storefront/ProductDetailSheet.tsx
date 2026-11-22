import { useEffect, useState, type CSSProperties } from 'react'
import { Check, MessageCircle, Package, X } from 'lucide-react'
import { buildWhatsAppLink, formatWhatsAppProductInquiry } from '@zaina/shared'
import { formatCurrency } from '../../lib/format.js'
import type { StorefrontInfo, StorefrontProduct } from './types.js'

const QUICK_QUESTIONS = [
  'Apakah barang ini masih tersedia di toko?',
  'Boleh info harga grosir / beli banyak?',
  'Apakah ada pilihan warna / ukuran lain?',
  'Saya ingin mampir mengambil barang ini, boleh disisihkan?',
] as const

function getAvailabilityLabel(status: StorefrontProduct['stockStatus']): string {
  if (status === 'OUT_OF_STOCK') return 'Habis'
  if (status === 'LOW') return 'Stok Menipis'
  return 'Tersedia'
}

function getAvailabilityClass(status: StorefrontProduct['stockStatus']): string {
  if (status === 'OUT_OF_STOCK') return 'storefront-stock-pill--out'
  if (status === 'LOW') return 'storefront-stock-pill--low'
  return 'storefront-stock-pill--ok'
}

export function ProductDetailSheet({
  product,
  storeInfo,
  onClose,
}: {
  product: StorefrontProduct
  storeInfo: StorefrontInfo
  onClose: () => void
}) {
  const [selectedUnitId, setSelectedUnitId] = useState(
    product.units.find((u) => u.isDefault)?.id ?? product.units[0]?.id ?? '',
  )
  const [selectedQuestion, setSelectedQuestion] = useState<string>(QUICK_QUESTIONS[0])
  const [customNote, setCustomNote] = useState('')

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const selectedUnit =
    product.units.find((u) => u.id === selectedUnitId) ?? product.units[0]

  if (!selectedUnit) return null

  const categoryStyle = {
    '--category-color': product.categoryColor,
  } as CSSProperties

  function handleAskWhatsApp() {
    if (!selectedUnit) return
    const phone = storeInfo.phone.trim() || '088744982845'
    const message = formatWhatsAppProductInquiry({
      storeName: storeInfo.storeName.trim() || 'Toko Zaina',
      productName: product.name,
      unitName: selectedUnit.name,
      unitPrice: selectedUnit.salePrice,
      question: selectedQuestion,
      ...(customNote.trim() ? { customNote: customNote.trim() } : {}),
    })
    const waUrl = buildWhatsAppLink(phone, message)
    window.open(waUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <>
      <div className="modal__overlay" onClick={onClose} aria-hidden="true" />
      <div
        className="modal modal--small storefront-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-detail-title"
        style={categoryStyle}
      >
        <div className="modal__handle" aria-hidden="true" />

        <div className="storefront-sheet__header">
          <h2 id="product-detail-title" className="storefront-sheet__title">
            Detail Produk
          </h2>
          <button
            type="button"
            className="icon-button storefront-sheet__close"
            onClick={onClose}
            aria-label="Tutup"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="storefront-sheet__body">
          <div className="storefront-detail__media">
            {product.imageUrl ? (
              <img src={product.imageUrl} alt={product.name} />
            ) : (
              <div className="storefront-detail__placeholder" aria-hidden="true">
                <span className="storefront-detail__studio-badge">
                  <Package />
                </span>
                <span className="storefront-card__studio-label">
                  {product.categoryName}
                </span>
              </div>
            )}
          </div>

          <div className="storefront-detail__info">
            <div className="storefront-detail__badges">
              <span className="storefront-detail__cat-badge">
                <span className="storefront-card__category-dot" aria-hidden="true" />
                <span>{product.categoryName}</span>
              </span>
              <span
                className={`storefront-stock-pill ${getAvailabilityClass(product.stockStatus)}`}
              >
                <span className="storefront-stock-pill__dot" aria-hidden="true" />
                <span>{getAvailabilityLabel(product.stockStatus)}</span>
              </span>
            </div>
            <h3 className="storefront-detail__name">{product.name}</h3>
          </div>

          <div className="storefront-detail__section">
            <div className="storefront-detail__section-head">
              <span className="storefront-detail__label">Pilih Satuan</span>
              {product.units.length > 1 && (
                <span className="storefront-detail__hint">
                  Harga menyesuaikan satuan
                </span>
              )}
            </div>

            <div className="storefront-unit-grid">
              {product.units.map((unit) => {
                const isActive = unit.id === selectedUnit.id
                return (
                  <button
                    key={unit.id}
                    type="button"
                    className={`storefront-unit-card ${isActive ? 'storefront-unit-card--active' : ''}`}
                    aria-pressed={isActive}
                    onClick={() => setSelectedUnitId(unit.id)}
                  >
                    <span className="storefront-unit-card__top">
                      <span className="storefront-unit-card__name">{unit.name}</span>
                      {isActive && (
                        <span className="storefront-unit-card__check" aria-hidden="true">
                          <Check size={12} />
                        </span>
                      )}
                    </span>
                    <span className="storefront-unit-card__price">
                      {formatCurrency(unit.salePrice)}
                    </span>
                    {unit.factor > 1 && (
                      <span className="storefront-unit-card__factor">
                        Isi {unit.factor} {product.baseUnit}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="storefront-detail__section">
            <div className="storefront-detail__section-head">
              <span className="storefront-detail__label">Pertanyaan Cepat</span>
              <span className="storefront-detail__hint">Pilih topik pertanyaan</span>
            </div>

            <div className="storefront-chip-grid" role="group" aria-label="Pertanyaan Cepat">
              {QUICK_QUESTIONS.map((question) => {
                const isActive = selectedQuestion === question
                return (
                  <button
                    key={question}
                    type="button"
                    className={`storefront-chip ${isActive ? 'storefront-chip--active' : ''}`}
                    aria-pressed={isActive}
                    onClick={() => setSelectedQuestion(question)}
                  >
                    {question}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="field">
            <label htmlFor="product-inquiry-note" className="field__label">
              Tulis pertanyaan lain (opsional)
            </label>
            <textarea
              id="product-inquiry-note"
              className="storefront-inquiry-note"
              rows={2}
              placeholder="Contoh: Kira-kira jam 4 sore masih ada?"
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
            />
          </div>
        </div>

        <div className="storefront-sheet__footer">
          <button
            type="button"
            className="button button--large storefront-wa-btn"
            onClick={handleAskWhatsApp}
          >
            <MessageCircle size={18} aria-hidden="true" />
            <span>Tanya via WhatsApp</span>
          </button>
          <p className="storefront-sheet__helper">
            Pesan otomatis berisi detail barang &amp; pertanyaan Anda
          </p>
        </div>
      </div>
    </>
  )
}
