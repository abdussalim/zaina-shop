import type { CSSProperties } from 'react'
import { Plus } from 'lucide-react'
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
  onSelect,
}: {
  product: StorefrontProduct
  onSelect: (product: StorefrontProduct) => void
}) {
  const defaultUnit = product.units.find((u) => u.isDefault) ?? product.units[0]
  const isAvailable = product.stockStatus !== 'OUT_OF_STOCK'
  const categoryStyle = {
    '--category-color': product.categoryColor,
  } as CSSProperties

  return (
    <div
      className={`storefront-card ${!isAvailable ? 'storefront-card--out' : ''}`}
      onClick={() => onSelect(product)}
      role="button"
      tabIndex={0}
      style={categoryStyle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(product)
        }
      }}
    >
      <div className="storefront-card__media">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} loading="lazy" />
        ) : (
          <div className="storefront-card__placeholder">
            <span className="storefront-card__monogram" aria-hidden="true">
              {product.name.charAt(0).toUpperCase()}
            </span>
          </div>
        )}
      </div>

      <div className="storefront-card__body">
        <div className="storefront-card__meta">
          <span className="storefront-card__category">
            <span className="storefront-card__category-dot" aria-hidden="true" />
            <span>{product.categoryName}</span>
          </span>
          <span className={`storefront-stock-pill ${getAvailabilityClass(product.stockStatus)}`}>
            <span className="storefront-stock-pill__dot" aria-hidden="true" />
            <span>{getAvailabilityLabel(product.stockStatus)}</span>
          </span>
        </div>

        <h3 className="storefront-card__title">{product.name}</h3>

        {product.units.length > 1 && (
          <span className="storefront-card__units-hint">
            {product.units.length} pilihan satuan
          </span>
        )}

        <div className="storefront-card__footer">
          <div className="storefront-card__price-group">
            <strong className="storefront-card__price data-number">
              {defaultUnit ? formatCurrency(defaultUnit.salePrice) : '-'}
            </strong>
            {defaultUnit && (
              <span className="storefront-card__unit">/ {defaultUnit.name}</span>
            )}
          </div>

          <button
            type="button"
            className="button button--secondary storefront-card__cta"
            disabled={!isAvailable}
            onClick={(e) => {
              e.stopPropagation()
              onSelect(product)
            }}
            aria-label={`Pilih ${product.name}`}
          >
            {isAvailable && <Plus size={15} aria-hidden="true" />}
            <span>{isAvailable ? 'Pilih' : 'Habis'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
