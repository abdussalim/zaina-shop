import type { CSSProperties } from 'react'
import { Package, Plus } from 'lucide-react'
import { formatCurrency } from '../../lib/format.js'
import type { StorefrontProduct } from './types.js'

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

export function ProductCard({
  product,
  cartQuantity = 0,
  onSelect,
  onQuickAdd,
}: {
  product: StorefrontProduct
  cartQuantity?: number
  onSelect: (product: StorefrontProduct) => void
  onQuickAdd: (product: StorefrontProduct) => void
}) {
  const defaultUnit = product.units.find((u) => u.isDefault) ?? product.units[0]
  const isAvailable = product.stockStatus !== 'OUT_OF_STOCK'
  const hasMultipleUnits = product.units.length > 1
  const canQuickAdd = isAvailable && product.units.length === 1 && Boolean(defaultUnit)
  const categoryStyle = {
    '--category-color': product.categoryColor,
  } as CSSProperties

  function handleActionClick() {
    if (!isAvailable) return
    if (canQuickAdd) {
      onQuickAdd(product)
      return
    }
    onSelect(product)
  }

  return (
    <article
      className={`storefront-card ${!isAvailable ? 'storefront-card--out' : ''}`}
      style={categoryStyle}
    >
      <button
        type="button"
        className="storefront-card__trigger"
        onClick={() => onSelect(product)}
        aria-label={`Lihat detail ${product.name}`}
      >
        <div className="storefront-card__media">
          <span
            className={`storefront-stock-pill storefront-card__stock-badge ${getAvailabilityClass(product.stockStatus)}`}
          >
            <span className="storefront-stock-pill__dot" aria-hidden="true" />
            <span>{getAvailabilityLabel(product.stockStatus)}</span>
          </span>

          {cartQuantity > 0 && (
            <span className="storefront-card__cart-badge">
              {cartQuantity} di keranjang
            </span>
          )}

          {product.imageUrl ? (
            <img src={product.imageUrl} alt={product.name} loading="lazy" />
          ) : (
            <div className="storefront-card__placeholder" aria-hidden="true">
              <span className="storefront-card__studio-badge">
                <Package />
              </span>
              <span className="storefront-card__studio-label">
                {product.categoryName}
              </span>
            </div>
          )}
        </div>

        <div className="storefront-card__body">
          <span className="storefront-card__category">
            <span className="storefront-card__category-dot" aria-hidden="true" />
            <span>{product.categoryName}</span>
          </span>

          <h3 className="storefront-card__title">{product.name}</h3>

          {hasMultipleUnits && (
            <span className="storefront-card__units-pill">
              {product.units.length} satuan
            </span>
          )}
        </div>
      </button>

      <div className="storefront-card__footer">
        <div
          className="storefront-card__price-group"
          onClick={() => onSelect(product)}
        >
          <strong className="storefront-card__price">
            {defaultUnit ? formatCurrency(defaultUnit.salePrice) : '-'}
          </strong>
          {defaultUnit && (
            <span className="storefront-card__unit">/ {defaultUnit.name}</span>
          )}
        </div>

        <button
          type="button"
          className={`storefront-card__add-btn ${cartQuantity > 0 ? 'storefront-card__add-btn--active' : ''}`}
          disabled={!isAvailable}
          onClick={handleActionClick}
          aria-label={
            !isAvailable
              ? `${product.name} habis`
              : canQuickAdd
                ? `Tambah ${product.name} ke keranjang`
                : `Pilih ${product.name}`
          }
        >
          <Plus size={18} aria-hidden="true" />
        </button>
      </div>
    </article>
  )
}
