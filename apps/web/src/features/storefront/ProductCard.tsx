import { Plus } from 'lucide-react'
import { formatCurrency } from '../../lib/format.js'
import type { StorefrontProduct } from './types.js'

export function ProductCard({
  product,
  onSelect,
}: {
  product: StorefrontProduct
  onSelect: (product: StorefrontProduct) => void
}) {
  const defaultUnit = product.units.find((u) => u.isDefault) ?? product.units[0]
  const isAvailable = product.stockStatus !== 'OUT_OF_STOCK'

  return (
    <div
      className="storefront-card"
      onClick={() => onSelect(product)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(product)
        }
      }}
    >
      <div className="storefront-card__thumb">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} loading="lazy" />
        ) : (
          <span className="storefront-card__placeholder">
            {product.name.charAt(0).toUpperCase()}
          </span>
        )}
      </div>
      <div className="storefront-card__body">
        <span
          className="badge"
          style={{
            alignSelf: 'flex-start',
            fontSize: '0.65rem',
            padding: '0.15rem 0.4rem',
            backgroundColor: `${product.categoryColor}20`,
            color: product.categoryColor,
          }}
        >
          {product.categoryName}
        </span>
        <h3 className="storefront-card__title">{product.name}</h3>
        <div className="storefront-card__price">
          {defaultUnit ? formatCurrency(defaultUnit.salePrice) : '-'}
          {defaultUnit && <span className="storefront-card__unit"> /{defaultUnit.name}</span>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem' }}>
          <span style={{ fontSize: '0.7rem', color: isAvailable ? 'var(--olive-dark)' : 'var(--danger)' }}>
            {isAvailable ? 'Tersedia' : 'Habis'}
          </span>
          <button
            type="button"
            className="btn btn--secondary"
            style={{ minHeight: '2rem', height: '2rem', width: '2rem', padding: 0, borderRadius: '99rem' }}
            disabled={!isAvailable}
            onClick={(e) => {
              e.stopPropagation()
              onSelect(product)
            }}
            aria-label={`Pilih ${product.name}`}
          >
            <Plus size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
