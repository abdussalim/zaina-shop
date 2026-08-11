import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, ArrowLeft, Edit3, PackagePlus, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { ProductInput } from '@zaina/shared'

import { apiRequest, ApiClientError, jsonBody } from '../../api/client.js'
import type { Category, Product, StockMovementPage } from '../../api/types.js'
import { Button } from '../../components/ui/Button.js'
import { Modal } from '../../components/ui/Modal.js'
import { EmptyState, LoadingState } from '../../components/ui/States.js'
import { StatusBadge } from '../../components/ui/StatusBadge.js'
import { formatCurrency, formatDateTime, formatDiscountRange, formatQuantity, getStockLabel, getStockTone, movementLabels } from '../../lib/format.js'
import { MovementForm } from '../inventory/MovementForm.js'
import { ProductForm } from './ProductForm.js'
import { useStoreSettings } from '../../app/StoreSettingsContext.js'

export function ProductDetailPage() {
  const storeSettings = useStoreSettings()
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)
  const [movementType, setMovementType] = useState<'RECEIPT' | 'DAMAGE'>()
  const [archiveOpen, setArchiveOpen] = useState(false)
  const product = useQuery({ queryKey: ['products', id], queryFn: () => apiRequest<Product>(`/api/v1/products/${id}`), enabled: Boolean(id) })
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => apiRequest<Category[]>('/api/v1/categories') })
  const movements = useInfiniteQuery({
    queryKey: ['inventory', 'movements', id],
    initialPageParam: null as string | null,
    enabled: Boolean(id),
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams({ productId: id, limit: '100' })
      if (pageParam) query.set('cursor', pageParam)
      return apiRequest<StockMovementPage>(`/api/v1/inventory/movements?${query}`)
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  })

  const update = useMutation({
    mutationFn: (input: ProductInput) => apiRequest<Product>(`/api/v1/products/${id}`, { method: 'PATCH', ...jsonBody(input) }),
    onSuccess: async () => {
      setEditOpen(false)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['reports'] }),
      ])
    },
  })
  const archive = useMutation({
    mutationFn: () => apiRequest<Product>(`/api/v1/products/${id}/archive`, { method: 'POST' }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['reports'] }),
      ])
      navigate('/products')
    },
  })

  if (product.isPending) return <LoadingState label="Membuka kartu barang" />
  if (product.isError) return <EmptyState title="Barang tidak ditemukan" description="Barang mungkin sudah dipindahkan atau alamat tidak tepat." action={<Link className="button button--secondary button--medium" to="/products">Kembali ke barang</Link>} />
  const item = product.data
  const movementItems = movements.data?.pages.flatMap((page) => page.items) ?? []

  return (
    <div className="page-stack product-detail">
      <div className="detail-topbar">
        <Link to="/products" className="back-link"><ArrowLeft /> Semua barang</Link>
        <div className="page-header__actions">
          {item.isActive ? <Button variant="secondary" icon={<Edit3 />} disabled={!categories.data?.length} onClick={() => setEditOpen(true)}>Edit barang</Button> : null}
          {item.isActive ? <Button variant="ghost" icon={<Archive />} disabled={item.balanceBase > 0} onClick={() => setArchiveOpen(true)}>Arsipkan</Button> : <StatusBadge tone="neutral">Diarsipkan</StatusBadge>}
        </div>
      </div>

      <section className="product-hero" style={{ '--category-color': item.category.color } as React.CSSProperties}>
        <div className="product-hero__identity">
          {item.imageUrl ? <img className="product-hero__image" src={item.imageUrl} alt={`Foto ${item.name}`} /> : null}
          <span className="category-stamp">{item.category.name}</span>
          <h1>{item.name}</h1>
          <p>{item.sku} · {item.location ?? 'Lokasi rak belum diisi'}</p>
        </div>
        <div className="product-hero__stock">
          <span>Saldo tersedia</span>
          <strong>{formatQuantity(item.balanceBase)}</strong>
          <small>{item.baseUnit}</small>
          <StatusBadge tone={getStockTone(item.stockStatus)}>{getStockLabel(item.stockStatus)}</StatusBadge>
        </div>
      </section>

      <div className="detail-grid">
        <section className="detail-panel">
          <div className="section-heading"><div><p className="eyebrow">Konversi</p><h2>Saldo per satuan</h2></div></div>
          <div className="unit-cards">
            {item.units.map((unit) => (
              <article key={unit.id} className="unit-card">
                <span>{unit.name}{unit.isDefault ? <small>default</small> : null}</span>
                <strong>{formatQuantity(item.balanceBase / unit.factor)}</strong>
                <small>{formatQuantity(unit.factor)} {item.baseUnit} · {formatCurrency(unit.salePrice)}</small>
                <small className="unit-card__discount">
                  {unit.minimumDiscount === 0 && unit.maximumDiscount === 0 ? '' : 'Diskon '}
                  {formatDiscountRange(unit)}
                </small>
              </article>
            ))}
          </div>
          <dl className="detail-list">
            <div><dt>Harga modal</dt><dd>{formatCurrency(item.costPrice)} / {item.baseUnit}</dd></div>
            <div><dt>Harga jual dasar</dt><dd>{formatCurrency(item.salePrice)} / {item.baseUnit}</dd></div>
            <div><dt>Batas minimum</dt><dd>{formatQuantity(item.minimumStock)} {item.baseUnit}</dd></div>
            <div><dt>Barcode</dt><dd>{item.barcode ?? 'Belum diisi'}</dd></div>
          </dl>
        </section>

        <aside className="action-board action-board--light">
          <p className="eyebrow">Tindakan stok</p><h2>{item.isActive ? 'Perbarui saldo' : 'Barang diarsipkan'}</h2>
          {item.isActive ? (
            <>
              <button onClick={() => setMovementType('RECEIPT')}><PackagePlus /><span><strong>Terima barang</strong><small>Tambah stok dari pemasok</small></span></button>
              <button onClick={() => setMovementType('DAMAGE')}><TriangleAlert /><span><strong>Barang pecah / rusak</strong><small>Kurangi stok dengan alasan</small></span></button>
            </>
          ) : <p className="modal-copy">Riwayat tetap tersedia, tetapi barang ini tidak menerima mutasi atau penjualan baru.</p>}
        </aside>
      </div>

      <section className="ledger-section">
        <div className="section-heading"><div><p className="eyebrow">Jejak barang</p><h2>Riwayat mutasi</h2></div></div>
        {movements.isPending ? <LoadingState /> : null}
        {movements.isError ? <EmptyState title="Riwayat belum dapat dimuat" description="Periksa koneksi server lalu coba kembali." /> : null}
        {movementItems.length ? <div className="ledger-list">{movementItems.map((movement) => (
          <div className="ledger-row" key={movement.id}>
            <span><strong>{movementLabels[movement.type] ?? movement.type}</strong><small>{formatDateTime(movement.createdAt, storeSettings.timezone)} · {movement.note ?? 'Tanpa catatan'}</small></span>
            <strong className={movement.quantityBase >= 0 ? 'quantity-in' : 'quantity-out'}>{movement.quantityBase >= 0 ? '+' : ''}{formatQuantity(movement.quantityBase)} {item.baseUnit}</strong>
            <small>Saldo {formatQuantity(movement.newBalance)}</small>
          </div>
        ))}</div> : null}
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
      </section>

      <Modal open={editOpen} onOpenChange={setEditOpen} title="Edit barang" description="Riwayat lama tetap memakai harga dan faktor saat transaksi terjadi." size="large">
        <ProductForm categories={categories.data ?? []} product={item} defaultMinimumStock={storeSettings.defaultMinimumStock} pending={update.isPending} serverError={update.error instanceof ApiClientError ? update.error.message : undefined} onSubmit={(input) => update.mutate(input)} onCancel={() => setEditOpen(false)} />
      </Modal>
      <Modal open={Boolean(movementType)} onOpenChange={(open) => { if (!open) setMovementType(undefined) }} title={movementType === 'RECEIPT' ? 'Terima stok barang' : 'Catat barang pecah'} description={item.name}>
        {movementType ? <MovementForm products={[item]} initialProductId={item.id} initialType={movementType} onSuccess={() => setMovementType(undefined)} onCancel={() => setMovementType(undefined)} /> : null}
      </Modal>
      <Modal open={archiveOpen} onOpenChange={setArchiveOpen} title="Arsipkan barang?" description="Barang tidak lagi muncul untuk penjualan baru, tetapi seluruh riwayatnya tetap tersimpan." size="small" footer={<><Button variant="ghost" onClick={() => setArchiveOpen(false)}>Batal</Button><Button variant="danger" pending={archive.isPending} onClick={() => archive.mutate()}>Arsipkan barang</Button></>}>
        <p className="modal-copy">Arsipkan <strong>{item.name}</strong> hanya setelah saldo stoknya nol.</p>
        {archive.error ? <div className="form-alert" role="alert">{archive.error instanceof ApiClientError ? archive.error.message : 'Barang belum dapat diarsipkan.'}</div> : null}
      </Modal>
    </div>
  )
}
