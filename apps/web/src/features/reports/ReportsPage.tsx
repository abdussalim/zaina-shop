import { useQuery } from '@tanstack/react-query'
import { BarChart3, Boxes, Download, FileText, Settings } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { apiRequest } from '../../api/client.js'
import type { InventoryReport, SalesReport } from '../../api/types.js'
import { PageHeader } from '../../components/ui/PageHeader.js'
import { EmptyState, LoadingState } from '../../components/ui/States.js'
import { StatusBadge } from '../../components/ui/StatusBadge.js'
import { formatCurrency, formatDateTime, formatQuantity, getStockLabel, getStockTone } from '../../lib/format.js'
import { useStoreSettings } from '../../app/StoreSettingsContext.js'

type ReportTab = 'sales' | 'inventory'

export function ReportsPage() {
  const storeSettings = useStoreSettings()
  const today = localDate(new Date(), storeSettings.timezone)
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`)
  const [to, setTo] = useState(today)
  const [tab, setTab] = useState<ReportTab>('sales')
  const sales = useQuery({
    queryKey: ['reports', 'sales', from, to],
    queryFn: () => apiRequest<SalesReport>(`/api/v1/reports/sales?from=${from}&to=${to}`),
  })
  const inventory = useQuery({
    queryKey: ['reports', 'inventory'],
    queryFn: () => apiRequest<InventoryReport>('/api/v1/reports/inventory'),
  })

  return (
    <div className="page-stack reports-page">
      <PageHeader
        eyebrow="Analisis toko"
        title="Laporan yang bisa ditindaklanjuti"
        description="Lihat omzet, laba kotor, barang terlaris, dan nilai stok tanpa mengubah catatan transaksi lama."
        actions={<Link to="/settings" className="button button--secondary button--medium"><Settings /> Pengaturan toko</Link>}
      />

      <div className="report-toolbar">
        <div className="segmented-control" role="tablist" aria-label="Jenis laporan">
          <button role="tab" aria-selected={tab === 'sales'} onClick={() => setTab('sales')}><BarChart3 /> Penjualan</button>
          <button role="tab" aria-selected={tab === 'inventory'} onClick={() => setTab('inventory')}><Boxes /> Persediaan</button>
        </div>
        {tab === 'sales' ? (
          <div className="date-range">
            <label><span>Dari</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
            <label><span>Sampai</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
            <a className="button button--secondary button--medium" href={`/api/v1/reports/sales?from=${from}&to=${to}&format=csv`}><Download /> Unduh CSV</a>
          </div>
        ) : <a className="button button--secondary button--medium" href="/api/v1/reports/inventory?format=csv"><Download /> Unduh CSV</a>}
      </div>

      {tab === 'sales' ? (
        <SalesReportView
          report={sales.data}
          loading={sales.isPending}
          failed={sales.isError}
          timezone={storeSettings.timezone}
        />
      ) : (
        <InventoryReportView
          report={inventory.data}
          loading={inventory.isPending}
          failed={inventory.isError}
        />
      )}
    </div>
  )
}

function SalesReportView({
  report,
  loading,
  failed,
  timezone,
}: {
  report?: SalesReport | undefined
  loading: boolean
  failed: boolean
  timezone: string
}) {
  if (loading) return <LoadingState label="Menghitung laporan penjualan" />
  if (failed || !report) return <EmptyState title="Laporan belum dapat dimuat" description="Periksa koneksi server lalu coba lagi." />
  return (
    <>
      <section className="compact-metrics compact-metrics--reports">
        <article><span>Omzet bersih</span><strong>{formatCurrency(report.summary.netSales)}</strong><small>{report.summary.transactionCount} transaksi</small></article>
        <article><span>Laba kotor</span><strong>{formatCurrency(report.summary.grossProfit)}</strong><small>Setelah harga modal</small></article>
        <article><span>Diskon</span><strong>{formatCurrency(report.summary.discounts)}</strong><small>Dari {formatCurrency(report.summary.grossSales)}</small></article>
        <article><span>Harga pokok</span><strong>{formatCurrency(report.summary.costOfGoods)}</strong><small>Snapshot saat transaksi</small></article>
      </section>
      <div className="report-grid">
        <section className="chart-panel">
          <div className="section-heading"><div><p className="eyebrow">Peringkat</p><h2>Barang terlaris</h2></div></div>
          {report.topProducts.length ? (
            <div className="report-chart" aria-label="Grafik barang terlaris">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={report.topProducts.slice(0, 8)} layout="vertical" margin={{ left: 8, right: 18 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#dcd6c8" />
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="productName" width={120} tick={{ fontSize: 11, fill: '#66675e' }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(value) => formatQuantity(Number(value))} cursor={{ fill: '#f4f0e7' }} />
                  <Bar dataKey="quantityBase" fill="#626a45" radius={[0, 4, 4, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <div className="inline-empty">Belum ada penjualan pada rentang ini.</div>}
        </section>
        <section className="ledger-section">
          <div className="section-heading"><div><p className="eyebrow">Margin</p><h2>Kontribusi produk</h2></div></div>
          <div className="ledger-list">{report.topProducts.slice(0, 8).map((product) => <div className="ledger-row" key={product.productId}><span><strong>{product.productName}</strong><small>{formatQuantity(product.quantityBase)} satuan dasar</small></span><span><strong>{formatCurrency(product.revenue)}</strong><small>laba {formatCurrency(product.grossProfit)}</small></span></div>)}</div>
        </section>
      </div>
      <section className="ledger-section">
        <div className="section-heading"><div><p className="eyebrow">Transaksi</p><h2>Rincian penjualan</h2></div></div>
        <div className="data-surface"><table className="data-table"><thead><tr><th>Nomor</th><th>Waktu</th><th>Subtotal</th><th>Diskon</th><th>Total</th><th aria-label="Tindakan" /></tr></thead><tbody>{report.transactions.map((sale) => <tr key={sale.id}><td data-label="Nomor"><strong>{sale.saleNumber}</strong></td><td data-label="Waktu">{formatDateTime(sale.soldAt, timezone)}</td><td data-label="Subtotal">{formatCurrency(sale.subtotal)}</td><td data-label="Diskon">{formatCurrency(sale.discount)}</td><td data-label="Total"><strong>{formatCurrency(sale.total)}</strong></td><td><Link className="table-link" to={`/sales/${sale.id}`}>Buka nota</Link></td></tr>)}</tbody></table></div>
      </section>
    </>
  )
}

function InventoryReportView({ report, loading, failed }: { report?: InventoryReport | undefined; loading: boolean; failed: boolean }) {
  if (loading) return <LoadingState label="Menghitung nilai persediaan" />
  if (failed || !report) return <EmptyState title="Laporan belum dapat dimuat" description="Periksa koneksi server lalu coba lagi." />
  return (
    <>
      <section className="compact-metrics">
        <article><span>Nilai persediaan</span><strong>{formatCurrency(report.summary.inventoryValue)}</strong></article>
        <article><span>Total barang</span><strong>{report.summary.totalProducts}</strong></article>
        <article className="compact-metrics__warn"><span>Stok tipis</span><strong>{report.summary.lowStockCount}</strong></article>
        <article className="compact-metrics__danger"><span>Stok habis</span><strong>{report.summary.outOfStockCount}</strong></article>
      </section>
      <section className="ledger-section">
        <div className="section-heading"><div><p className="eyebrow">Valuasi</p><h2>Nilai per barang</h2></div><FileText /></div>
        <div className="data-surface"><table className="data-table"><thead><tr><th>Barang</th><th>Kategori / rak</th><th>Saldo</th><th>Harga modal</th><th>Nilai</th><th>Status</th></tr></thead><tbody>{report.products.map((product) => <tr key={product.id}><td data-label="Barang"><Link aria-label={`Buka ${product.name}`} to={`/products/${product.id}`}><strong>{product.name}</strong><small>{product.sku}</small></Link></td><td data-label="Kategori / rak"><span>{product.categoryName}</span><small>{product.location ?? '—'}</small></td><td data-label="Saldo"><strong>{formatQuantity(product.balanceBase)}</strong> <small>{product.baseUnit}</small></td><td data-label="Harga modal">{formatCurrency(product.costPrice)}</td><td data-label="Nilai"><strong>{formatCurrency(product.inventoryValue)}</strong></td><td data-label="Status"><StatusBadge tone={getStockTone(product.stockStatus)}>{getStockLabel(product.stockStatus)}</StatusBadge></td></tr>)}</tbody></table></div>
      </section>
    </>
  )
}

function localDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: timezone,
  }).format(date)
}
