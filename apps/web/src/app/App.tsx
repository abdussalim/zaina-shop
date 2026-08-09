import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'

import { apiRequest, ApiClientError } from '../api/client.js'
import { PageHeader } from '../components/ui/PageHeader.js'
import { LoadingState } from '../components/ui/States.js'
import { LoginPage, type AuthenticatedUser } from '../features/auth/LoginPage.js'
import { AppShell } from './AppShell.js'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
    mutations: { retry: false },
  },
})

function Placeholder({ title }: { title: string }) {
  return (
    <div className="page-stack">
      <PageHeader title={title} description="Modul ini sedang disiapkan." />
    </div>
  )
}

function RoutedApp() {
  const cache = useQueryClient()
  const session = useQuery({
    queryKey: ['session'],
    queryFn: () => apiRequest<AuthenticatedUser>('/api/v1/auth/session'),
    retry: (count, error) => !(error instanceof ApiClientError && error.status === 401) && count < 1,
  })

  if (session.isPending) {
    return <main className="boot-screen"><LoadingState label="Menyiapkan ruang toko" /></main>
  }

  if (!session.data) {
    return (
      <Routes>
        <Route
          path="/login"
          element={<LoginPage onAuthenticated={(user) => cache.setQueryData(['session'], user)} />}
        />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route
        element={
          <AppShell
            user={session.data}
            onLoggedOut={() => cache.setQueryData(['session'], undefined)}
          />
        }
      >
        <Route index element={<Placeholder title="Dashboard" />} />
        <Route path="products" element={<Placeholder title="Barang" />} />
        <Route path="products/:id" element={<Placeholder title="Detail barang" />} />
        <Route path="sales/new" element={<Placeholder title="Penjualan baru" />} />
        <Route path="sales/:id" element={<Placeholder title="Bukti penjualan" />} />
        <Route path="inventory" element={<Placeholder title="Stok" />} />
        <Route path="reports" element={<Placeholder title="Laporan" />} />
        <Route path="settings" element={<Placeholder title="Pengaturan" />} />
      </Route>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
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
