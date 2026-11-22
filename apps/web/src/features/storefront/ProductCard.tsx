import type { CSSProperties } from 'react'
import { MessageCircle, Package } from 'lucide-react'
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
  const hasMultipleUnits = product.units.length > 1
  const categoryStyle = {
    '--category-color': product.categoryColor,
  } as CSSProperties

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
          className="storefront-card__inquiry-btn"
          onClick={() => onSelect(product)}
          aria-label={`Tanya ${product.name}`}
        >
          <MessageCircle size={16} aria-hidden="true" />
          <span>Tanya</span>
        </button>
      </div>
    </article>
  )
}
