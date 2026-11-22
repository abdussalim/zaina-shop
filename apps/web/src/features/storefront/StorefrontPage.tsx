import { useEffect, useState, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, PackageOpen, Search, ShoppingBag, X } from 'lucide-react'
import { toast } from 'sonner'
import { apiRequest } from '../../api/client.js'
import { Button } from '../../components/ui/Button.js'
import { ErrorState, LoadingState } from '../../components/ui/States.js'
import { formatCurrency } from '../../lib/format.js'
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

  useEffect(() => {
    if (!selectedProduct && !isCartOpen) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [selectedProduct, isCartOpen])

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
    const trimmedQuery = searchQuery.trim().toLowerCase()
    const matchesQuery =
      !trimmedQuery ||
      product.name.toLowerCase().includes(trimmedQuery) ||
      product.categoryName.toLowerCase().includes(trimmedQuery)
    return matchesCategory && matchesQuery
  })

  const cartTotal = getCartTotal(cart)
  const totalItemCount = cart.reduce((sum, item) => sum + item.quantity, 0)
  const hasActiveFilter = selectedCategory !== 'ALL' || searchQuery.trim().length > 0

  function handleResetFilters() {
    setSelectedCategory('ALL')
    setSearchQuery('')
  }

  function handleAddToCart(item: CartItem) {
    setCart((prev) => addItemToCart(prev, item))
    toast.success(`${item.productName} (${item.quantity} ${item.unitName}) ditambahkan ke keranjang`)
  }

  return (
    <div className="storefront">
      <StorefrontHeader
        storeInfo={storeInfo}
        cartCount={totalItemCount}
        onOpenCart={() => setIsCartOpen(true)}
        isStaff={isStaff}
      />

      <section className="storefront-hero" aria-label="Pencarian dan kategori produk">
        <div className="storefront-hero__inner">
          <p className="storefront-intro__guide">
            Pilih barang &amp; satuan yang dibutuhkan, lalu kirim pesanan langsung lewat WhatsApp — tanpa perlu bikin akun.
          </p>

          <div className="storefront-search">
            <Search size={18} className="storefront-search__icon" aria-hidden="true" />
            <input
              type="search"
              className="storefront-search__input"
              placeholder="Cari gula, beras, minyak goreng..."
              aria-label="Cari produk toko"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery.length > 0 && (
              <button
                type="button"
                className="storefront-search__clear"
                onClick={() => setSearchQuery('')}
                aria-label="Hapus pencarian"
              >
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="storefront-categories" role="region" aria-label="Kategori produk">
            <button
              type="button"
              className={`storefront-category-pill ${selectedCategory === 'ALL' ? 'storefront-category-pill--active' : ''}`}
              aria-pressed={selectedCategory === 'ALL'}
              onClick={() => setSelectedCategory('ALL')}
            >
              Semua ({catalog.products.length})
            </button>
            {catalog.categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={`storefront-category-pill ${selectedCategory === cat.id ? 'storefront-category-pill--active' : ''}`}
                aria-pressed={selectedCategory === cat.id}
                onClick={() => setSelectedCategory(cat.id)}
              >
                <span
                  className="storefront-category-pill__dot"
                  style={{ '--category-color': cat.color } as CSSProperties}
                  aria-hidden="true"
                />
                <span>{cat.name}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <main className="storefront-main">
        {catalogQuery.isLoading ? (
          <div className="storefront-status">
            <LoadingState label="Memuat etalase produk" />
          </div>
        ) : catalogQuery.isError ? (
          <div className="storefront-status">
            <ErrorState
              title="Etalase belum dapat dimuat"
              description="Periksa koneksi internet Anda lalu muat ulang halaman."
              action={
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void catalogQuery.refetch()}
                >
                  Coba Lagi
                </Button>
              }
            />
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="storefront-empty">
            <span className="storefront-empty__icon" aria-hidden="true">
              <PackageOpen size={24} />
            </span>
            <h2>Produk tidak ditemukan</h2>
            <p>
              {hasActiveFilter
                ? 'Tidak ada barang yang cocok dengan pencarian atau kategori yang dipilih.'
                : 'Belum ada produk yang tersedia di etalase saat ini.'}
            </p>
            {hasActiveFilter && (
              <Button type="button" variant="secondary" onClick={handleResetFilters}>
                Reset Pencarian
              </Button>
            )}
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
      </main>

      {totalItemCount > 0 && !isCartOpen && (
        <button
          type="button"
          className="storefront-floating-cart"
          onClick={() => setIsCartOpen(true)}
        >
          <span className="storefront-floating-cart__info">
            <ShoppingBag size={18} aria-hidden="true" />
            <span className="storefront-floating-cart__count data-number">
              {totalItemCount} Barang
            </span>
            <span>Lihat Keranjang</span>
          </span>
          <span className="storefront-floating-cart__total data-number">
            <span>{formatCurrency(cartTotal)}</span>
            <ChevronRight size={18} aria-hidden="true" />
          </span>
        </button>
      )}

      {selectedProduct && (
        <ProductDetailSheet
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onAddToCart={handleAddToCart}
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
