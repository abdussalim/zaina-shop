import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { lazy, useEffect, useState } from 'react'

import { apiRequest, ApiClientError, SESSION_EXPIRED_EVENT } from '../api/client.js'
import type { StoreSettings } from '../api/types.js'
import { LoadingState } from '../components/ui/States.js'
import { LoginPage, type AuthenticatedUser } from '../features/auth/LoginPage.js'
import { SessionReauthDialog } from '../features/auth/SessionReauthDialog.js'
import { AppShell } from './AppShell.js'
import { defaultStoreSettings } from './StoreSettingsContext.js'

const DashboardPage = lazy(() =>
  import('../features/dashboard/DashboardPage.js').then((module) => ({ default: module.DashboardPage })),
)
const ProductsPage = lazy(() =>
  import('../features/products/ProductsPage.js').then((module) => ({ default: module.ProductsPage })),
)
const ProductDetailPage = lazy(() =>
  import('../features/products/ProductDetailPage.js').then((module) => ({ default: module.ProductDetailPage })),
)
const InventoryPage = lazy(() =>
  import('../features/inventory/InventoryPage.js').then((module) => ({ default: module.InventoryPage })),
)
const SalesPage = lazy(() =>
  import('../features/sales/SalesPage.js').then((module) => ({ default: module.SalesPage })),
)
const SaleReceipt = lazy(() =>
  import('../features/sales/SaleReceipt.js').then((module) => ({ default: module.SaleReceipt })),
)
const ReportsPage = lazy(() =>
  import('../features/reports/ReportsPage.js').then((module) => ({ default: module.ReportsPage })),
)
const SettingsPage = lazy(() =>
  import('../features/settings/SettingsPage.js').then((module) => ({ default: module.SettingsPage })),
)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
    mutations: { retry: false },
  },
})

function RoutedApp() {
  const cache = useQueryClient()
  const [reauthRequired, setReauthRequired] = useState(false)
  useEffect(() => {
    const requireReauthentication = () => setReauthRequired(true)
    window.addEventListener(SESSION_EXPIRED_EVENT, requireReauthentication)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, requireReauthentication)
  }, [])
  const session = useQuery({
    queryKey: ['session'],
    queryFn: () => apiRequest<AuthenticatedUser>('/api/v1/auth/session'),
    retry: (count, error) => !(error instanceof ApiClientError && error.status === 401) && count < 1,
  })
  const storeSettings = useQuery({
    queryKey: ['settings', 'store'],
    queryFn: () => apiRequest<StoreSettings>('/api/v1/settings/store'),
    enabled: Boolean(session.data),
  })

  if (session.isPending) {
    return <main className="boot-screen"><LoadingState label="Menyiapkan ruang toko" /></main>
  }

  if (!session.data) {
    return (
      <Routes>
        <Route
          path="/login"
          element={<LoginPage onAuthenticated={(user) => {
            cache.setQueryData(['session'], user)
            setReauthRequired(false)
          }} />}
        />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  if (storeSettings.isPending) {
    return <main className="boot-screen"><LoadingState label="Membaca pengaturan toko" /></main>
  }

  return (
    <>
      <Routes>
      <Route
        element={
          <AppShell
            user={session.data}
            storeSettings={storeSettings.data ?? defaultStoreSettings}
            onLoggedOut={() => cache.setQueryData(['session'], undefined)}
          />
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="products/:id" element={<ProductDetailPage />} />
        <Route path="sales/new" element={<SalesPage />} />
        <Route path="sales/:id" element={<SaleReceipt />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <SessionReauthDialog
        open={reauthRequired}
        onAuthenticated={(user) => {
          cache.setQueryData(['session'], user)
          setReauthRequired(false)
          void cache.invalidateQueries()
        }}
      />
    </>
  )
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <RoutedApp />
        <Toaster position="top-right" richColors closeButton />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
