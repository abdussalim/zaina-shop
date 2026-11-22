import { useEffect, useState, type CSSProperties } from 'react'
import { Check, Minus, Package, Plus, X } from 'lucide-react'
import { Button } from '../../components/ui/Button.js'
import { formatCurrency } from '../../lib/format.js'
import type { CartItem, StorefrontProduct } from './types.js'

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
  onClose,
  onAddToCart,
}: {
  product: StorefrontProduct
  onClose: () => void
  onAddToCart: (item: CartItem) => void
}) {
  const [selectedUnitId, setSelectedUnitId] = useState(
    product.units.find((u) => u.isDefault)?.id ?? product.units[0]?.id ?? '',
  )
  const [quantity, setQuantity] = useState(1)

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

  const isOutOfStock = product.stockStatus === 'OUT_OF_STOCK'
  const categoryStyle = {
    '--category-color': product.categoryColor,
  } as CSSProperties

  function handleAdd() {
    if (!selectedUnit || isOutOfStock) return
    onAddToCart({
      productId: product.id,
      productName: product.name,
      unitId: selectedUnit.id,
      unitName: selectedUnit.name,
      unitPrice: selectedUnit.salePrice,
      quantity,
      imageUrl: product.imageUrl,
    })
    onClose()
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

          <div className="storefront-detail__qty-row">
            <span className="storefront-detail__label">Jumlah</span>
            <div className="storefront-stepper">
              <button
                type="button"
                className="button button--secondary storefront-stepper__btn"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1}
                aria-label="Kurangi jumlah"
              >
                <Minus size={18} aria-hidden="true" />
              </button>
              <span className="storefront-stepper__value" aria-live="polite">
                {quantity}
              </span>
              <button
                type="button"
                className="button button--secondary storefront-stepper__btn"
                onClick={() => setQuantity((q) => q + 1)}
                aria-label="Tambah jumlah"
              >
                <Plus size={18} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        <div className="storefront-sheet__footer">
          <div className="storefront-detail__footer-row">
            <div className="storefront-sheet__subtotal">
              <span className="storefront-sheet__subtotal-label">Subtotal</span>
              <strong className="storefront-sheet__subtotal-value">
                {formatCurrency(selectedUnit.salePrice * quantity)}
              </strong>
            </div>

            <Button
              type="button"
              variant="primary"
              size="large"
              className="storefront-detail__add-btn"
              disabled={isOutOfStock}
              onClick={handleAdd}
            >
              {isOutOfStock ? 'Stok Habis' : 'Tambah ke Keranjang'}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
