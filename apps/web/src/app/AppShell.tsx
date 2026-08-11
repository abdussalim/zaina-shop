import {
  Boxes,
  CircleUserRound,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  PackageSearch,
  ShoppingBasket,
  Settings,
  BarChart3,
} from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { Suspense } from 'react'

import { apiRequest } from '../api/client.js'
import type { StoreSettings } from '../api/types.js'
import type { AuthenticatedUser } from '../features/auth/LoginPage.js'
import { LoadingState } from '../components/ui/States.js'
import { StoreSettingsProvider } from './StoreSettingsContext.js'
import { ConnectivityProvider, useConnectivity } from './ConnectivityContext.js'
import { OfflineBanner } from './OfflineBanner.js'

const navigation = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/products', label: 'Barang', icon: PackageSearch },
  { to: '/sales/new', label: 'Jual', icon: ShoppingBasket, featured: true },
  { to: '/inventory', label: 'Stok', icon: Boxes },
  { to: '/reports', label: 'Laporan', icon: BarChart3, desktopOnly: true },
  { to: '/settings', label: 'Pengaturan', mobileLabel: 'Lainnya', icon: MoreHorizontal },
]

export function AppShell({
  user,
  storeSettings,
  onLoggedOut,
}: {
  user: AuthenticatedUser
  storeSettings: StoreSettings
  onLoggedOut: () => void
}) {
  return (
    <ConnectivityProvider storeKey={user.id}>
      <StoreSettingsProvider settings={storeSettings}>
        <ShellContent user={user} storeSettings={storeSettings} onLoggedOut={onLoggedOut} />
      </StoreSettingsProvider>
    </ConnectivityProvider>
  )
}

function ShellContent({
  user,
  storeSettings,
  onLoggedOut,
}: {
  user: AuthenticatedUser
  storeSettings: StoreSettings
  onLoggedOut: () => void
}) {
  const { status, clearSnapshot } = useConnectivity()
  async function logout() {
    try {
      await apiRequest('/api/v1/auth/logout', { method: 'POST' })
    } finally {
      await clearSnapshot()
      onLoggedOut()
    }
  }

  return (
      <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <span className="brand-seal" aria-hidden="true"><span>Z</span></span>
          <span><strong>{storeSettings.storeName}</strong><small>Inventaris toko</small></span>
        </div>
        <nav className="sidebar__nav" aria-label="Navigasi utama">
          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              {...(end ? { end: true } : {})}
              className={({ isActive }) => `nav-link ${isActive ? 'nav-link--active' : ''}`}
            >
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar__account">
          <CircleUserRound aria-hidden="true" />
          <span><strong>{user.displayName}</strong><small>@{user.username}</small></span>
          <button className="icon-button" onClick={logout} aria-label="Keluar dari aplikasi">
            <LogOut aria-hidden="true" />
          </button>
        </div>
      </aside>

      <div className="app-shell__body">
        <header className="mobile-header">
          <div className="brand-lockup">
            <span className="brand-seal" aria-hidden="true"><span>Z</span></span>
            <span><strong>{storeSettings.storeName}</strong><small>Inventaris toko</small></span>
          </div>
          <span className={`connection-pill ${status === 'offline' ? 'connection-pill--offline' : ''}`}><i /> {status === 'offline' ? 'Offline' : status === 'checking' ? 'Memeriksa' : 'Tersambung'}</span>
        </header>
        <div className="top-status" aria-hidden="true">
          <span>Inventaris satu toko</span>
          <span className="top-status__line" />
          <span className={`connection-pill ${status === 'offline' ? 'connection-pill--offline' : ''}`}><i /> {status === 'offline' ? 'Server offline' : 'Server tersambung'}</span>
        </div>
        <div className="page-container">
          <OfflineBanner />
          <Suspense fallback={<LoadingState label="Membuka halaman" />}>
            <Outlet />
          </Suspense>
        </div>
      </div>

      <nav className="bottom-nav" aria-label="Navigasi seluler">
        {navigation.filter((item) => !item.desktopOnly).map(({ to, label, mobileLabel, icon: Icon, end, featured }) => (
          <NavLink
            key={to}
            to={to}
            {...(end ? { end: true } : {})}
            className={({ isActive }) =>
              `bottom-nav__link ${isActive ? 'bottom-nav__link--active' : ''} ${featured ? 'bottom-nav__link--featured' : ''}`
            }
          >
            <Icon aria-hidden="true" />
            <span>{mobileLabel ?? label}</span>
          </NavLink>
        ))}
      </nav>
      </div>
  )
}
