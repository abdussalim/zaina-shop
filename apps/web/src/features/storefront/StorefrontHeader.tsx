import { ShoppingBag, User } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { StorefrontInfo } from './types.js'

function getStoreMonogram(storeName: string): string {
  const words = storeName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (words.length >= 2) {
    return `${words[0]!.charAt(0)}${words[1]!.charAt(0)}`.toUpperCase()
  }
  return (words[0]?.slice(0, 2) || 'TZ').toUpperCase()
}

export function StorefrontHeader({
  storeInfo,
  cartCount,
  onOpenCart,
  isStaff,
}: {
  storeInfo: StorefrontInfo
  cartCount: number
  onOpenCart: () => void
  isStaff?: boolean | undefined
}) {
  const displayName = storeInfo.storeName || 'Toko Zaina'

  return (
    <header className="storefront-header">
      <div className="storefront-header__inner">
        <div className="storefront-brand">
          <span className="storefront-brand__seal" aria-hidden="true">
            {getStoreMonogram(displayName)}
          </span>
          <div className="storefront-brand__text">
            <h1>{displayName}</h1>
            <p>{storeInfo.address || 'Belanja mudah & pesan via WhatsApp'}</p>
          </div>
        </div>

        <nav className="storefront-nav-actions" aria-label="Navigasi etalase">
          <Link
            to={isStaff ? '/dashboard' : '/login'}
            className="storefront-staff-link"
          >
            <User size={15} aria-hidden="true" />
            <span>{isStaff ? 'Panel Kasir' : 'Staf'}</span>
          </Link>

          <button
            type="button"
            onClick={onOpenCart}
            className="storefront-cart-trigger"
            aria-label={
              cartCount > 0
                ? `Keranjang Belanja, ${cartCount} barang`
                : 'Keranjang Belanja'
            }
          >
            <ShoppingBag size={18} aria-hidden="true" />
            <span className="storefront-cart-trigger__label">Keranjang</span>
            {cartCount > 0 && (
              <span className="storefront-cart-trigger__badge data-number">
                {cartCount}
              </span>
            )}
          </button>
        </nav>
      </div>
    </header>
  )
}
