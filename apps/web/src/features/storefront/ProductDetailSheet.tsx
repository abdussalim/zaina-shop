import { useState } from 'react'
import { Minus, Plus, X } from 'lucide-react'
import { formatCurrency } from '../../lib/format.js'
import type { CartItem, StorefrontProduct } from './types.js'

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

  const selectedUnit = product.units.find((u) => u.id === selectedUnitId) ?? product.units[0]

  if (!selectedUnit) return null

  function handleAdd() {
    if (!selectedUnit) return
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
      <div className="modal__overlay" onClick={onClose} />
      <div className="modal modal--small" style={{ padding: 'var(--space-4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Detail Produk</h2>
          <button type="button" className="btn btn--ghost" onClick={onClose} style={{ minHeight: '2.5rem' }} aria-label="Tutup">
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'grid', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
          {product.imageUrl && (
            <div style={{ width: '100%', height: '180px', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
              <img src={product.imageUrl} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          )}

          <div>
            <h3 style={{ fontSize: '1.2rem', margin: '0 0 0.25rem 0' }}>{product.name}</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--ink-soft)' }}>Kategori: {product.categoryName}</span>
          </div>

          <div>
            <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>
              Pilih Satuan:
            </label>
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              {product.units.map((unit) => (
                <button
                  key={unit.id}
                  type="button"
                  className={`category-pill ${unit.id === selectedUnit.id ? 'category-pill--active' : ''}`}
                  onClick={() => setSelectedUnitId(unit.id)}
                >
                  {unit.name} ({formatCurrency(unit.salePrice)})
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBlock: 'var(--space-2)' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Jumlah:</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <button
                type="button"
                className="btn btn--secondary"
                style={{ width: '2.5rem', minHeight: '2.5rem', padding: 0 }}
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                aria-label="Kurangi jumlah"
              >
                <Minus size={16} />
              </button>
              <span style={{ minWidth: '2rem', textAlign: 'center', fontWeight: 700 }}>{quantity}</span>
              <button
                type="button"
                className="btn btn--secondary"
                style={{ width: '2.5rem', minHeight: '2.5rem', padding: 0 }}
                onClick={() => setQuantity((q) => q + 1)}
                aria-label="Tambah jumlah"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--line)', paddingTop: 'var(--space-3)' }}>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--ink-soft)', display: 'block' }}>Total Harga:</span>
              <strong style={{ fontSize: '1.2rem', color: 'var(--olive-dark)' }}>
                {formatCurrency(selectedUnit.salePrice * quantity)}
              </strong>
            </div>
            <button
              type="button"
              className="btn btn--primary"
              disabled={product.stockStatus === 'OUT_OF_STOCK'}
              onClick={handleAdd}
            >
              Tambah ke Keranjang
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
