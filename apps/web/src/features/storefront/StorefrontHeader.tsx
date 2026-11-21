import { ShoppingBag, User } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { StorefrontInfo } from './types.js'

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
  return (
    <header className="storefront-header">
      <div className="storefront-brand">
        <h1>{storeInfo.storeName || 'Toko Zaina'}</h1>
        <p>{storeInfo.address || 'Katalog & Pesan Online'}</p>
      </div>
      <div className="storefront-nav-actions">
        <button
          type="button"
          onClick={onOpenCart}
          className="storefront-staff-link"
          aria-label="Keranjang Belanja"
        >
          <ShoppingBag size={16} />
          {cartCount > 0 && <span>{cartCount}</span>}
        </button>
        <Link
          to={isStaff ? '/sales' : '/login'}
          className="storefront-staff-link"
        >
          <User size={16} />
          <span>{isStaff ? 'Kasir' : 'Staf'}</span>
        </Link>
      </div>
    </header>
  )
}
