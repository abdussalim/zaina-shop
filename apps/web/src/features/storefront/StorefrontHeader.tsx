import { MessageCircle, User } from 'lucide-react'
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
  onOpenInquiry,
  isStaff,
}: {
  storeInfo: StorefrontInfo
  onOpenInquiry: () => void
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
            <p>{storeInfo.address}</p>
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
            onClick={onOpenInquiry}
            className="storefront-header-wa"
            aria-label="Tanya Toko via WhatsApp"
          >
            <MessageCircle size={17} aria-hidden="true" />
            <span>Tanya WA</span>
          </button>
        </nav>
      </div>
    </header>
  )
}
