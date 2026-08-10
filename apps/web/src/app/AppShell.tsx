import {
  BarChart3,
  Boxes,
  CircleUserRound,
  LayoutDashboard,
  LogOut,
  PackageSearch,
  Settings,
  ShoppingBasket,
} from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { Suspense } from 'react'

import { apiRequest } from '../api/client.js'
import type { StoreSettings } from '../api/types.js'
import type { AuthenticatedUser } from '../features/auth/LoginPage.js'
import { LoadingState } from '../components/ui/States.js'
import { StoreSettingsProvider } from './StoreSettingsContext.js'

const navigation = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/products', label: 'Barang', icon: PackageSearch },
  { to: '/sales/new', label: 'Jual', icon: ShoppingBasket, featured: true },
  { to: '/inventory', label: 'Stok', icon: Boxes },
  { to: '/reports', label: 'Laporan', mobileLabel: 'Lainnya', icon: BarChart3 },
  { to: '/settings', label: 'Pengaturan', icon: Settings, desktopOnly: true },
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
  async function logout() {
    await apiRequest('/api/v1/auth/logout', { method: 'POST' })
    onLoggedOut()
  }

  return (
    <StoreSettingsProvider settings={storeSettings}>
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
          <span className="connection-pill"><i /> Tersambung</span>
        </header>
        <div className="top-status" aria-hidden="true">
          <span>Inventaris satu toko</span>
          <span className="top-status__line" />
          <span className="connection-pill"><i /> Server tersambung</span>
        </div>
        <div className="page-container">
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
    </StoreSettingsProvider>
  )
}
