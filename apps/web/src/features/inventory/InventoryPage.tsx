import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { ArrowDownToLine, ArrowUpFromLine, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { apiRequest } from '../../api/client.js'
import type { Product, StockMovementPage } from '../../api/types.js'
import { Button } from '../../components/ui/Button.js'
import { Modal } from '../../components/ui/Modal.js'
import { PageHeader } from '../../components/ui/PageHeader.js'
import { EmptyState, LoadingState } from '../../components/ui/States.js'
import { StatusBadge } from '../../components/ui/StatusBadge.js'
import { formatCurrency, formatDateTime, formatQuantity, movementLabels } from '../../lib/format.js'
import { useStoreSettings } from '../../app/StoreSettingsContext.js'
import { useConnectivity } from '../../app/ConnectivityContext.js'
import type { OfflineProduct } from '../../pwa/types.js'
import { MovementForm } from './MovementForm.js'

type FormType = 'RECEIPT' | 'DAMAGE' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT'

export function InventoryPage() {
  const storeSettings = useStoreSettings()
  const { isOffline, canWrite, readSnapshot, lastSnapshotAt } = useConnectivity()
  const [searchParams, setSearchParams] = useSearchParams()
  const [formType, setFormType] = useState<FormType>()
  const [productFilter, setProductFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const products = useQuery({ queryKey: ['products'], queryFn: () => apiRequest<Product[]>('/api/v1/products'), enabled: !isOffline })
  const movements = useInfiniteQuery({
    queryKey: ['inventory', 'movements', productFilter, typeFilter],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams({ limit: '100' })
      if (productFilter) query.set('productId', productFilter)
      if (typeFilter) query.set('type', typeFilter)
      if (pageParam) query.set('cursor', pageParam)
      return apiRequest<StockMovementPage>(`/api/v1/inventory/movements?${query}`)
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: !isOffline,
  })
  const summary = useQuery({ queryKey: ['inventory', 'summary'], queryFn: () => apiRequest<{ totalProducts: number; inventoryValue: number; lowStockCount: number; outOfStockCount: number }>('/api/v1/inventory/summary'), enabled: !isOffline })
  const [offlineProducts, setOfflineProducts] = useState<OfflineProduct[]>([])
  useEffect(() => {
    if (isOffline) void readSnapshot().then((snapshot) => setOfflineProducts(snapshot?.products ?? []))
  }, [isOffline, readSnapshot])

  useEffect(() => {
    const action = searchParams.get('action')
    if (action === 'receive') setFormType('RECEIPT')
    if (action === 'damage') setFormType('DAMAGE')
  }, [searchParams])

  const filtered = movements.data?.pages.flatMap((page) => page.items) ?? []

  if (isOffline) return <OfflineInventory products={offlineProducts} updatedAt={lastSnapshotAt} />

  function closeForm() {
    setFormType(undefined)
    setSearchParams({}, { replace: true })
  }

  return (
    <div className="page-stack inventory-page">
      <PageHeader
        eyebrow="Ledger persediaan"
        title="Stok masuk, keluar, dan pecah"
        description="Setiap perubahan dicatat sebagai jejak yang tidak menghapus riwayat sebelumnya."
        actions={
          <>
            <Button variant="secondary" icon={<TriangleAlert />} disabled={!canWrite} disabledReason="Sambungkan koneksi untuk mengubah stok" onClick={() => setFormType('DAMAGE')}>Barang pecah</Button>
            <Button icon={<ArrowDownToLine />} disabled={!canWrite} disabledReason="Sambungkan koneksi untuk mengubah stok" onClick={() => setFormType('RECEIPT')}>Terima stok</Button>
          </>
        }
      />

      {summary.data ? (
        <section className="compact-metrics">
          <article><span>Nilai persediaan</span><strong>{formatCurrency(summary.data.inventoryValue)}</strong></article>
          <article><span>Total barang</span><strong>{summary.data.totalProducts}</strong></article>
          <article className="compact-metrics__warn"><span>Stok tipis</span><strong>{summary.data.lowStockCount}</strong></article>
          <article className="compact-metrics__danger"><span>Stok habis</span><strong>{summary.data.outOfStockCount}</strong></article>
        </section>
      ) : null}

      <section className="ledger-section">
        <div className="section-heading section-heading--wrap">
          <div><p className="eyebrow">Riwayat</p><h2>Mutasi terbaru</h2></div>
          <div className="inline-filters">
            <select aria-label="Filter barang" value={productFilter} onChange={(event) => setProductFilter(event.target.value)}><option value="">Semua barang</option>{products.data?.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select>
            <select aria-label="Filter jenis mutasi" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="">Semua mutasi</option>{Object.entries(movementLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
            <Button size="small" variant="ghost" icon={<ArrowUpFromLine />} onClick={() => setFormType('ADJUSTMENT_OUT')}>Penyesuaian</Button>
          </div>
        </div>
        {movements.isPending ? <LoadingState label="Membaca ledger stok" /> : null}
        {movements.isError ? <EmptyState title="Riwayat stok belum dapat dimuat" description="Periksa koneksi server lalu coba kembali." /> : null}
        {movements.isSuccess && filtered.length === 0 ? <EmptyState title="Belum ada mutasi" description="Terima stok atau catat stok awal untuk mulai membangun riwayat." /> : null}
        {filtered.length ? (
          <div className="data-surface">
            <table className="data-table movement-table">
              <thead><tr><th>Waktu</th><th>Barang</th><th>Jenis</th><th>Input</th><th>Perubahan dasar</th><th>Saldo akhir</th><th>Catatan</th></tr></thead>
              <tbody>{filtered.map((movement) => (
                <tr key={movement.id}>
                  <td data-label="Waktu"><span>{formatDateTime(movement.createdAt, storeSettings.timezone)}</span></td>
                  <td data-label="Barang"><Link aria-label={`Buka ${movement.productName}`} to={`/products/${movement.productId}`}><strong>{movement.productName}</strong></Link></td>
                  <td data-label="Jenis"><StatusBadge tone={movement.quantityBase >= 0 ? 'success' : movement.type === 'SALE' ? 'info' : 'warning'}>{movementLabels[movement.type] ?? movement.type}</StatusBadge></td>
                  <td data-label="Input"><strong>{formatQuantity(movement.quantityInput)}</strong> <small>{movement.unitName}</small></td>
                  <td data-label="Perubahan"><strong className={movement.quantityBase >= 0 ? 'quantity-in' : 'quantity-out'}>{movement.quantityBase >= 0 ? '+' : ''}{formatQuantity(movement.quantityBase)}</strong></td>
                  <td data-label="Saldo akhir"><strong className="data-number">{formatQuantity(movement.newBalance)}</strong></td>
                  <td data-label="Catatan"><span>{movement.note ?? '—'}</span></td>
                </tr>
              ))}</tbody>
            </table>
            {movements.hasNextPage ? (
              <div className="form-actions ledger-pagination">
                <Button
                  variant="secondary"
                  pending={movements.isFetchingNextPage}
                  onClick={() => void movements.fetchNextPage()}
                >
                  Muat riwayat sebelumnya
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <Modal open={Boolean(formType)} onOpenChange={(open) => { if (!open) closeForm() }} title={formType === 'RECEIPT' ? 'Terima stok barang' : formType === 'DAMAGE' ? 'Catat barang pecah / rusak' : 'Penyesuaian stok'} description="Saldo baru dihitung dan dikonfirmasi oleh server." size="medium">
        {formType && products.data ? (
          <MovementForm
            products={products.data}
            initialProductId={searchParams.get('productId') ?? undefined}
            initialType={formType}
            onSuccess={closeForm}
            onCancel={closeForm}
          />
        ) : <LoadingState />}
      </Modal>
    </div>
  )
}

function OfflineInventory({ products, updatedAt }: { products: OfflineProduct[]; updatedAt: string | null }) {
  const low = products.filter((product) => product.stockStatus === 'LOW').length
  const out = products.filter((product) => product.stockStatus === 'OUT_OF_STOCK').length
  return (
    <div className="page-stack inventory-page">
      <PageHeader eyebrow="Stok baca saja" title="Saldo stok terakhir" description={`Mutasi dinonaktifkan saat offline${updatedAt ? ` · snapshot ${new Date(updatedAt).toLocaleString('id-ID')}` : ''}.`} />
      <section className="compact-metrics"><article><span>Total barang</span><strong>{products.length}</strong></article><article className="compact-metrics__warn"><span>Stok tipis</span><strong>{low}</strong></article><article className="compact-metrics__danger"><span>Stok habis</span><strong>{out}</strong></article></section>
      <section className="ledger-section"><div className="section-heading"><div><p className="eyebrow">Snapshot</p><h2>Saldo per barang</h2></div><StatusBadge tone="info">Baca saja</StatusBadge></div>{products.length ? <div className="offline-product-grid">{products.map((product) => <Link className="data-card" to={`/products/${product.id}`} key={product.id}><span className="table-product"><i /><span><strong>{product.name}</strong><small>{product.sku} · {product.location ?? 'Lokasi belum diisi'}</small></span></span><span><strong>{formatQuantity(product.balance)}</strong><small>{product.baseUnit}</small></span><StatusBadge tone={product.stockStatus === 'OUT_OF_STOCK' ? 'danger' : product.stockStatus === 'LOW' ? 'warning' : 'success'}>{product.stockStatus === 'OUT_OF_STOCK' ? 'Habis' : product.stockStatus === 'LOW' ? 'Tipis' : 'Aman'}</StatusBadge></Link>)}</div> : <EmptyState title="Snapshot stok belum tersedia" description="Buka halaman ini saat online untuk menyimpan saldo terakhir." />}</section>
    </div>
  )
}
