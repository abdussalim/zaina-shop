import { useQuery } from '@tanstack/react-query'
import {
  ArrowDownToLine,
  ArrowRight,
  Boxes,
  CircleDollarSign,
  PackagePlus,
  ShoppingBasket,
  Sparkles,
  TriangleAlert,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import { apiRequest, ApiClientError } from '../../api/client.js'
import type { DashboardData } from '../../api/types.js'
import { PageHeader } from '../../components/ui/PageHeader.js'
import { EmptyState, LoadingState } from '../../components/ui/States.js'
import { StatusBadge } from '../../components/ui/StatusBadge.js'
import { formatCurrency, formatDateTime, formatQuantity, movementLabels } from '../../lib/format.js'
import { useStoreSettings } from '../../app/StoreSettingsContext.js'
import { useConnectivity } from '../../app/ConnectivityContext.js'
import { useEffect, useState } from 'react'
import type { InventorySnapshot } from '../../pwa/types.js'

export function DashboardPage() {
  const storeSettings = useStoreSettings()
  const { isOffline, readSnapshot, lastSnapshotAt } = useConnectivity()
  const [snapshot, setSnapshot] = useState<InventorySnapshot | null>(null)
  useEffect(() => {
    if (isOffline) void readSnapshot().then(setSnapshot)
  }, [isOffline, readSnapshot])
  const dashboard = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => apiRequest<DashboardData>('/api/v1/dashboard'),
    enabled: !isOffline,
  })

  if (isOffline) return <OfflineDashboard snapshot={snapshot} updatedAt={lastSnapshotAt} />

  if (dashboard.isPending) return <LoadingState label="Menyusun ringkasan toko" />
  if (dashboard.isError) {
    return (
      <EmptyState
        title="Ringkasan belum dapat dimuat"
        description={
          dashboard.error instanceof ApiClientError
            ? dashboard.error.message
            : 'Periksa koneksi server lalu muat ulang halaman.'
        }
      />
    )
  }

  const data = dashboard.data
  return (
    <div className="page-stack dashboard-page">
      <PageHeader
        eyebrow={greeting(storeSettings.timezone)}
        title="Kondisi toko hari ini"
        description="Angka utama, barang yang perlu diperhatikan, dan aktivitas terbaru dalam satu pandangan."
        actions={
          <>
            <Link to="/inventory?action=receive" className="button button--secondary button--medium">
              <PackagePlus aria-hidden="true" /> Terima stok
            </Link>
            <Link to="/sales/new" className="button button--primary button--medium">
              <ShoppingBasket aria-hidden="true" /> Penjualan baru
            </Link>
          </>
        }
      />

      <section className="metric-rail" aria-label="Ringkasan hari ini">
        <Metric label="Omzet hari ini" value={formatCurrency(data.revenueToday)} icon={CircleDollarSign} />
        <Metric label="Laba kotor" value={formatCurrency(data.profitToday)} icon={Sparkles} />
        <Metric label="Transaksi" value={formatQuantity(data.salesToday)} suffix="nota" icon={ShoppingBasket} />
        <Metric label="Nilai persediaan" value={formatCurrency(data.inventoryValue)} icon={Boxes} />
      </section>

      <div className="dashboard-grid">
        <section className="shelf-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Perlu tindakan</p>
              <h2>Stok di batas rak</h2>
            </div>
            <StatusBadge tone={data.outOfStockCount ? 'danger' : 'warning'}>
              {data.lowStockCount + data.outOfStockCount} barang
            </StatusBadge>
          </div>
          {data.lowStockProducts.length ? (
            <div className="stock-rail-list">
              {data.lowStockProducts.map((product) => {
                const depleted = product.balanceBase <= 0
                return (
                  <Link to={`/products/${product.id}`} className="stock-rail" key={product.id}>
                    <span className={`stock-rail__marker ${depleted ? 'stock-rail__marker--danger' : ''}`} />
                    <span className="stock-rail__identity">
                      <small>{product.sku}</small><strong>{product.name}</strong>
                    </span>
                    <span className="stock-rail__quantity">
                      <strong>{formatQuantity(product.balanceBase)}</strong>
                      <small>dari batas {formatQuantity(product.minimumStock)} {product.baseUnit}</small>
                    </span>
                    <ArrowRight aria-hidden="true" />
                  </Link>
                )
              })}
            </div>
          ) : (
            <div className="inline-empty"><Sparkles aria-hidden="true" /> Semua stok berada di atas batas minimum.</div>
          )}
        </section>

        <aside className="action-board">
          <p className="eyebrow">Aksi cepat</p>
          <h2>Mulai dari sini</h2>
          <Link to="/sales/new"><ShoppingBasket aria-hidden="true" /><span><strong>Catat penjualan</strong><small>Buka kasir dan susun keranjang</small></span><ArrowRight /></Link>
          <Link to="/inventory?action=receive"><ArrowDownToLine aria-hidden="true" /><span><strong>Terima stok</strong><small>Masukkan barang yang baru datang</small></span><ArrowRight /></Link>
          <Link to="/inventory?action=damage"><TriangleAlert aria-hidden="true" /><span><strong>Catat barang pecah</strong><small>Jaga saldo tetap sesuai rak</small></span><ArrowRight /></Link>
        </aside>
      </div>

      <div className="dashboard-grid dashboard-grid--activity">
        <section className="ledger-section">
          <div className="section-heading"><div><p className="eyebrow">Kasir</p><h2>Penjualan terbaru</h2></div><Link to="/reports">Lihat laporan <ArrowRight /></Link></div>
          {data.recentSales.length ? (
            <div className="ledger-list">
              {data.recentSales.map((sale) => (
                <Link to={`/sales/${sale.id}`} key={sale.id} className="ledger-row">
                  <span><strong>{sale.saleNumber}</strong><small>{formatDateTime(sale.soldAt, storeSettings.timezone)}</small></span>
                  <strong>{formatCurrency(sale.total)}</strong>
                  <StatusBadge tone={sale.status === 'COMPLETED' ? 'success' : 'danger'}>{sale.status === 'COMPLETED' ? 'Selesai' : 'Batal'}</StatusBadge>
                </Link>
              ))}
            </div>
          ) : <div className="inline-empty">Belum ada penjualan hari ini.</div>}
        </section>

        <section className="ledger-section">
          <div className="section-heading"><div><p className="eyebrow">Ledger stok</p><h2>Gerak barang</h2></div><Link to="/inventory">Lihat semua <ArrowRight /></Link></div>
          {data.recentMovements.length ? (
            <div className="ledger-list">
              {data.recentMovements.map((movement) => (
                <div key={movement.id} className="ledger-row">
                  <span><strong>{movement.productName}</strong><small>{movementLabels[movement.type] ?? movement.type} · {formatDateTime(movement.createdAt, storeSettings.timezone)}</small></span>
                  <strong className={movement.quantityBase >= 0 ? 'quantity-in' : 'quantity-out'}>{movement.quantityBase >= 0 ? '+' : ''}{formatQuantity(movement.quantityBase)}</strong>
                </div>
              ))}
            </div>
          ) : <div className="inline-empty">Belum ada pergerakan stok.</div>}
        </section>
      </div>
    </div>
  )
}

function OfflineDashboard({ snapshot, updatedAt }: { snapshot: InventorySnapshot | null; updatedAt: string | null }) {
  const products = snapshot?.products ?? []
  const attention = products.filter((product) => product.stockStatus !== 'OK')
  return (
    <div className="page-stack dashboard-page">
      <PageHeader
        eyebrow="Mode offline"
        title="Stok terakhir tersimpan"
        description="Ringkasan keuangan, laporan, dan aksi tulis disembunyikan saat offline. Data ini mungkin usang."
      />
      <div className="offline-banner" role="status">Snapshot katalog dan saldo stok {updatedAt ? `diperbarui ${new Date(updatedAt).toLocaleString('id-ID')}` : 'belum tersedia'}.</div>
      <section className="metric-rail" aria-label="Ringkasan stok offline">
        <Metric label="Barang tersimpan" value={formatQuantity(products.length)} icon={Boxes} />
        <Metric label="Stok perlu cek" value={formatQuantity(attention.length)} icon={TriangleAlert} />
      </section>
      <section className="shelf-section">
        <div className="section-heading"><div><p className="eyebrow">Baca saja</p><h2>Stok di batas rak</h2></div><StatusBadge tone={attention.length ? 'warning' : 'success'}>{attention.length} barang</StatusBadge></div>
        {attention.length ? <div className="stock-rail-list">{attention.map((product) => <Link to={`/products/${product.id}`} className="stock-rail" key={product.id}><span className={`stock-rail__marker ${product.stockStatus === 'OUT_OF_STOCK' ? 'stock-rail__marker--danger' : ''}`} /><span className="stock-rail__identity"><small>{product.sku}</small><strong>{product.name}</strong></span><span className="stock-rail__quantity"><strong>{formatQuantity(product.balance)}</strong><small>{product.baseUnit}</small></span></Link>)}</div> : <div className="inline-empty"><Sparkles aria-hidden="true" /> Semua stok snapshot berada di atas batas minimum.</div>}
      </section>
    </div>
  )
}

function Metric({
  label,
  value,
  suffix,
  icon: Icon,
}: {
  label: string
  value: string
  suffix?: string
  icon: typeof Boxes
}) {
  return (
    <article className="metric-rail__item">
      <Icon aria-hidden="true" />
      <span>{label}</span>
      <strong>{value}</strong>
      {suffix ? <small>{suffix}</small> : null}
    </article>
  )
}

function greeting(timezone: string) {
  const hour = Number(
    new Intl.DateTimeFormat('id-ID', {
      hour: '2-digit',
      hour12: false,
      timeZone: timezone,
    }).format(new Date()),
  )
  return hour < 11 ? 'Selamat pagi' : hour < 15 ? 'Selamat siang' : hour < 18 ? 'Selamat sore' : 'Selamat malam'
}
