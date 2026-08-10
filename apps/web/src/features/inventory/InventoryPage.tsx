import { useQuery } from '@tanstack/react-query'
import { ArrowDownToLine, ArrowUpFromLine, ClipboardList, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { apiRequest } from '../../api/client.js'
import type { Product, StockMovement } from '../../api/types.js'
import { Button } from '../../components/ui/Button.js'
import { Modal } from '../../components/ui/Modal.js'
import { PageHeader } from '../../components/ui/PageHeader.js'
import { EmptyState, LoadingState } from '../../components/ui/States.js'
import { StatusBadge } from '../../components/ui/StatusBadge.js'
import { formatCurrency, formatDateTime, formatQuantity, movementLabels } from '../../lib/format.js'
import { useStoreSettings } from '../../app/StoreSettingsContext.js'
import { MovementForm } from './MovementForm.js'

type FormType = 'RECEIPT' | 'DAMAGE' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT'

export function InventoryPage() {
  const storeSettings = useStoreSettings()
  const [searchParams, setSearchParams] = useSearchParams()
  const [formType, setFormType] = useState<FormType>()
  const [productFilter, setProductFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const products = useQuery({ queryKey: ['products'], queryFn: () => apiRequest<Product[]>('/api/v1/products') })
  const movements = useQuery({ queryKey: ['inventory', 'movements'], queryFn: () => apiRequest<StockMovement[]>('/api/v1/inventory/movements?limit=250') })
  const summary = useQuery({ queryKey: ['inventory', 'summary'], queryFn: () => apiRequest<{ totalProducts: number; inventoryValue: number; lowStockCount: number; outOfStockCount: number }>('/api/v1/inventory/summary') })

  useEffect(() => {
    const action = searchParams.get('action')
    if (action === 'receive') setFormType('RECEIPT')
    if (action === 'damage') setFormType('DAMAGE')
  }, [searchParams])

  const filtered = useMemo(
    () =>
      (movements.data ?? []).filter(
        (movement) =>
          (!productFilter || movement.productId === productFilter) &&
          (!typeFilter || movement.type === typeFilter),
      ),
    [movements.data, productFilter, typeFilter],
  )

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
            <Button variant="secondary" icon={<TriangleAlert />} onClick={() => setFormType('DAMAGE')}>Barang pecah</Button>
            <Button icon={<ArrowDownToLine />} onClick={() => setFormType('RECEIPT')}>Terima stok</Button>
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
                  <td data-label="Barang"><Link to={`/products/${movement.productId}`}><strong>{movement.productName}</strong></Link></td>
                  <td data-label="Jenis"><StatusBadge tone={movement.quantityBase >= 0 ? 'success' : movement.type === 'SALE' ? 'info' : 'warning'}>{movementLabels[movement.type] ?? movement.type}</StatusBadge></td>
                  <td data-label="Input"><strong>{formatQuantity(movement.quantityInput)}</strong> <small>{movement.unitName}</small></td>
                  <td data-label="Perubahan"><strong className={movement.quantityBase >= 0 ? 'quantity-in' : 'quantity-out'}>{movement.quantityBase >= 0 ? '+' : ''}{formatQuantity(movement.quantityBase)}</strong></td>
                  <td data-label="Saldo akhir"><strong className="data-number">{formatQuantity(movement.newBalance)}</strong></td>
                  <td data-label="Catatan"><span>{movement.note ?? '—'}</span></td>
                </tr>
              ))}</tbody>
            </table>
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
