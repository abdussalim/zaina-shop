import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, ShoppingBag } from 'lucide-react'
import { apiRequest } from '../../api/client.js'
import { formatCurrency } from '../../lib/format.js'
import { LoadingState } from '../../components/ui/States.js'
import {
  addItemToCart,
  getCartTotal,
  loadCartFromStorage,
  removeItemFromCart,
  saveCartToStorage,
  updateCartItemQuantity,
} from './cartStore.js'
import { ProductCard } from './ProductCard.js'
import { ProductDetailSheet } from './ProductDetailSheet.js'
import { StorefrontCartSheet } from './StorefrontCartSheet.js'
import { StorefrontHeader } from './StorefrontHeader.js'
import type {
  CartItem,
  StorefrontCatalogResponse,
  StorefrontInfo,
  StorefrontProduct,
} from './types.js'

export function StorefrontPage({ isStaff }: { isStaff?: boolean | undefined } = {}) {
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<StorefrontProduct | null>(null)
  const [cart, setCart] = useState<CartItem[]>(() => loadCartFromStorage())
  const [isCartOpen, setIsCartOpen] = useState(false)

  useEffect(() => {
    saveCartToStorage(cart)
  }, [cart])

  const storeInfoQuery = useQuery({
    queryKey: ['storefront', 'info'],
    queryFn: () => apiRequest<StorefrontInfo>('/api/v1/storefront/info'),
  })

  const catalogQuery = useQuery({
    queryKey: ['storefront', 'catalog'],
    queryFn: () => apiRequest<StorefrontCatalogResponse>('/api/v1/storefront/catalog'),
  })

  const storeInfo = storeInfoQuery.data ?? {
    storeName: 'Toko Zaina',
    address: '',
    phone: '',
  }

  const catalog = catalogQuery.data ?? { categories: [], products: [] }

  const filteredProducts = catalog.products.filter((product) => {
    const matchesCategory =
      selectedCategory === 'ALL' || product.categoryId === selectedCategory
    const matchesQuery =
      !searchQuery.trim() ||
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.categoryName.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesQuery
  })

  const cartTotal = getCartTotal(cart)
  const totalItemCount = cart.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <div className="storefront">
      <StorefrontHeader
        storeInfo={storeInfo}
        cartCount={totalItemCount}
        onOpenCart={() => setIsCartOpen(true)}
        isStaff={isStaff}
      />

      <section className="storefront-hero">
        <div className="filter-search" style={{ width: '100%' }}>
          <Search size={18} color="var(--ink-soft)" />
          <input
            type="search"
            placeholder="Cari produk toko..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="category-pills">
          <button
            type="button"
            className={`category-pill ${selectedCategory === 'ALL' ? 'category-pill--active' : ''}`}
            onClick={() => setSelectedCategory('ALL')}
          >
            Semua ({catalog.products.length})
          </button>
          {catalog.categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={`category-pill ${selectedCategory === cat.id ? 'category-pill--active' : ''}`}
              onClick={() => setSelectedCategory(cat.id)}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </section>

      {catalogQuery.isLoading ? (
        <div style={{ padding: 'var(--space-8)' }}>
          <LoadingState label="Memuat etalase produk..." />
        </div>
      ) : filteredProducts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-8) var(--space-4)', color: 'var(--ink-soft)' }}>
          <p>Tidak ada produk yang cocok dengan pencarian.</p>
        </div>
      ) : (
        <div className="storefront-grid">
          {filteredProducts.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onSelect={setSelectedProduct}
            />
          ))}
        </div>
      )}

      {totalItemCount > 0 && !isCartOpen && (
        <button
          type="button"
          className="storefront-floating-cart"
          onClick={() => setIsCartOpen(true)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ShoppingBag size={20} />
            <span style={{ fontWeight: 600 }}>{totalItemCount} Barang</span>
          </div>
          <strong>{formatCurrency(cartTotal)}</strong>
        </button>
      )}

      {selectedProduct && (
        <ProductDetailSheet
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onAddToCart={(item) => setCart((prev) => addItemToCart(prev, item))}
        />
      )}

      {isCartOpen && (
        <StorefrontCartSheet
          cart={cart}
          storeInfo={storeInfo}
          onClose={() => setIsCartOpen(false)}
          onUpdateQuantity={(prodId, unitId, qty) =>
            setCart((prev) => updateCartItemQuantity(prev, prodId, unitId, qty))
          }
          onRemoveItem={(prodId, unitId) =>
            setCart((prev) => removeItemFromCart(prev, prodId, unitId))
          }
          onClearCart={() => setCart([])}
        />
      )}
    </div>
  )
}
