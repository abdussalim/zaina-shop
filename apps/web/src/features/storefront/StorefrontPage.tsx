import { useEffect, useState, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ExternalLink,
  MapPin,
  MessageCircle,
  PackageOpen,
  Search,
  X,
} from 'lucide-react'
import { apiRequest } from '../../api/client.js'
import { BrandLogo } from '../../components/ui/BrandLogo.js'
import { Button } from '../../components/ui/Button.js'
import { ErrorState, LoadingState } from '../../components/ui/States.js'
import { ProductCard } from './ProductCard.js'
import { ProductDetailSheet } from './ProductDetailSheet.js'
import { StorefrontHeader } from './StorefrontHeader.js'
import { StorefrontInquirySheet } from './StorefrontInquirySheet.js'
import type {
  StorefrontCatalogResponse,
  StorefrontInfo,
  StorefrontProduct,
} from './types.js'

const DEFAULT_STORE_NAME = 'Toko Zaina'
const DEFAULT_STORE_ADDRESS =
  'Jl. Patih Rumbih No. 35, Selat Tengah, Kec. Selat, Kabupaten Kapuas, Kalimantan Tengah 73516'
const DEFAULT_STORE_PHONE = '088744982845'

function buildGoogleMapsEmbedUrl(address: string): string {
  if (address === DEFAULT_STORE_ADDRESS) {
    return 'https://maps.google.com/maps?q=Jl.+Patih+Rumbih+No.+35,+Selat+Tengah,+Kec.+Selat,+Kabupaten+Kapuas,+Kalimantan+Tengah+73516&t=&z=16&ie=UTF8&iwloc=&output=embed'
  }
  const params = new URLSearchParams({
    q: address,
    t: '',
    z: '16',
    ie: 'UTF8',
    iwloc: '',
    output: 'embed',
  })
  return `https://maps.google.com/maps?${params.toString()}`
}

function buildGoogleMapsSearchUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

export function StorefrontPage({ isStaff }: { isStaff?: boolean | undefined } = {}) {
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedProduct, setSelectedProduct] = useState<StorefrontProduct | null>(null)
  const [isInquiryOpen, setIsInquiryOpen] = useState(false)

  useEffect(() => {
    if (!selectedProduct && !isInquiryOpen) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [selectedProduct, isInquiryOpen])

  const storeInfoQuery = useQuery({
    queryKey: ['storefront', 'info'],
    queryFn: () => apiRequest<StorefrontInfo>('/api/v1/storefront/info'),
  })

  const catalogQuery = useQuery({
    queryKey: ['storefront', 'catalog'],
    queryFn: () => apiRequest<StorefrontCatalogResponse>('/api/v1/storefront/catalog'),
  })

  const rawInfo = storeInfoQuery.data
  const storeInfo: StorefrontInfo = {
    storeName: rawInfo?.storeName?.trim() || DEFAULT_STORE_NAME,
    address: rawInfo?.address?.trim() || DEFAULT_STORE_ADDRESS,
    phone: rawInfo?.phone?.trim() || DEFAULT_STORE_PHONE,
  }

  const catalog = catalogQuery.data ?? { categories: [], products: [] }

  const categoryCounts = new Map<string, number>()
  for (const product of catalog.products) {
    categoryCounts.set(product.categoryId, (categoryCounts.get(product.categoryId) ?? 0) + 1)
  }

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

  const hasActiveFilter = selectedCategory !== 'ALL' || searchQuery.trim().length > 0

  function handleResetFilters() {
    setSelectedCategory('ALL')
    setSearchQuery('')
  }

  return (
    <div className="storefront">
      <StorefrontHeader
        storeInfo={storeInfo}
        onOpenInquiry={() => setIsInquiryOpen(true)}
        isStaff={isStaff}
      />

      <section className="storefront-hero" aria-label="Sambutan toko">
        <div className="storefront-hero__inner">
          <div className="storefront-hero__mark" aria-hidden="true">
            <BrandLogo variant="mark" tone="dark" />
          </div>
          <div className="storefront-hero__content">
            <h2 className="storefront-hero__title">
              Cek katalog &amp; ketersediaan barang.
            </h2>
            <p className="storefront-hero__meta">
              Zaina Arsyi · Kuala Kapuas · Tanya stok via WhatsApp
            </p>
          </div>
        </div>
      </section>

      <section className="storefront-discovery" aria-label="Pencarian dan kategori produk">
        <div className="storefront-search">
          <Search size={18} className="storefront-search__icon" aria-hidden="true" />
          <input
            type="search"
            className="storefront-search__input"
            placeholder="Cari piring, wajan, wadah plastik..."
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
            <span>Semua</span>
            <span className="storefront-category-pill__count">
              {catalog.products.length}
            </span>
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
              <span className="storefront-category-pill__count">
                {categoryCounts.get(cat.id) ?? 0}
              </span>
            </button>
          ))}
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
          <>
            <div className="storefront-catalog-bar">
              <span>Menampilkan {filteredProducts.length} produk</span>
              {hasActiveFilter && (
                <button
                  type="button"
                  className="storefront-catalog-bar__clear"
                  onClick={handleResetFilters}
                >
                  Tampilkan semua
                </button>
              )}
            </div>
            <div className="storefront-grid">
              {filteredProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onSelect={setSelectedProduct}
                />
              ))}
            </div>
          </>
        )}

        <section className="storefront-visit" aria-label="Kunjungi Toko Kami">
          <div className="storefront-visit__card">
            <div className="storefront-visit__head">
              <span className="storefront-visit__eyebrow">
                <MapPin size={14} aria-hidden="true" />
                <span>Lokasi Toko</span>
              </span>
              <h2 className="storefront-visit__title">Mampir langsung ke Toko Zaina</h2>
              <p className="storefront-visit__address">{storeInfo.address}</p>
              <p className="storefront-visit__note">
                Saat ini melayani pembelian langsung di toko. Cek stok dulu lewat WhatsApp
                agar makin praktis.
              </p>
            </div>

            <div className="storefront-visit__map-wrap">
              <iframe
                title="Peta lokasi Toko Zaina"
                className="storefront-visit__map"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                src={buildGoogleMapsEmbedUrl(storeInfo.address)}
              />
            </div>

            <div className="storefront-visit__actions">
              <a
                href={buildGoogleMapsSearchUrl(storeInfo.address)}
                target="_blank"
                rel="noopener noreferrer"
                className="button button--primary storefront-visit__btn"
              >
                <ExternalLink size={17} aria-hidden="true" />
                <span>Buka di Google Maps</span>
              </a>

              <button
                type="button"
                className="button button--secondary storefront-visit__btn"
                onClick={() => setIsInquiryOpen(true)}
              >
                <MessageCircle size={17} aria-hidden="true" />
                <span>Tanya via WhatsApp</span>
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="storefront-footer">
        <p>
          {storeInfo.storeName} · {storeInfo.address}
        </p>
      </footer>

      {!selectedProduct && !isInquiryOpen && (
        <button
          type="button"
          className="storefront-floating-wa"
          onClick={() => setIsInquiryOpen(true)}
        >
          <MessageCircle size={18} aria-hidden="true" />
          <span>Tanya Toko (WA)</span>
        </button>
      )}

      {selectedProduct && (
        <ProductDetailSheet
          product={selectedProduct}
          storeInfo={storeInfo}
          onClose={() => setSelectedProduct(null)}
        />
      )}

      {isInquiryOpen && (
        <StorefrontInquirySheet
          storeInfo={storeInfo}
          onClose={() => setIsInquiryOpen(false)}
        />
      )}
    </div>
  )
}
