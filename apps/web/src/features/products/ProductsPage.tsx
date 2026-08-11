import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Boxes, PackagePlus, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { ProductInput } from '@zaina/shared'

import { apiRequest, ApiClientError, jsonBody } from '../../api/client.js'
import type { Category, Product } from '../../api/types.js'
import { Button } from '../../components/ui/Button.js'
import { Modal } from '../../components/ui/Modal.js'
import { PageHeader } from '../../components/ui/PageHeader.js'
import { EmptyState, LoadingState } from '../../components/ui/States.js'
import { StatusBadge } from '../../components/ui/StatusBadge.js'
import { formatCurrency, formatQuantity, getStockLabel, getStockTone } from '../../lib/format.js'
import { ProductForm } from './ProductForm.js'
import { useStoreSettings } from '../../app/StoreSettingsContext.js'
import { useConnectivity } from '../../app/ConnectivityContext.js'
import { createSnapshot } from '../../pwa/snapshotPolicy.js'
import type { OfflineProduct } from '../../pwa/types.js'

export function ProductsPage() {
  const storeSettings = useStoreSettings()
  const { isOffline, canWrite, readSnapshot, writeSnapshot, storeKey, lastSnapshotAt } = useConnectivity()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [stockStatus, setStockStatus] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiRequest<Category[]>('/api/v1/categories'),
    enabled: !isOffline,
  })
  const products = useQuery({
    queryKey: ['products'],
    queryFn: () => apiRequest<Product[]>('/api/v1/products'),
    enabled: !isOffline,
  })
  const [offlineProducts, setOfflineProducts] = useState<OfflineProduct[]>([])
  useEffect(() => {
    if (isOffline) void readSnapshot().then((snapshot) => setOfflineProducts(snapshot?.products ?? []))
  }, [isOffline, readSnapshot])
  useEffect(() => {
    if (!isOffline && products.data) void writeSnapshot(createSnapshot(storeKey, products.data))
  }, [isOffline, products.data, storeKey, writeSnapshot])
  const createProduct = useMutation({
    mutationFn: (input: ProductInput) =>
      apiRequest<Product>('/api/v1/products', { method: 'POST', ...jsonBody(input) }),
    onSuccess: async () => {
      setFormOpen(false)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['reports'] }),
      ])
    },
  })

  const filtered = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase('id-ID')
    return (products.data ?? []).filter((product) => {
      const matchesSearch =
        !normalized ||
        product.name.toLocaleLowerCase('id-ID').includes(normalized) ||
        product.sku.toLocaleLowerCase('id-ID').includes(normalized)
      return (
        matchesSearch &&
        (!category || product.categoryId === category) &&
        (!stockStatus || product.stockStatus === stockStatus)
      )
    })
  }, [category, products.data, search, stockStatus])

  if (isOffline) return <OfflineProducts products={offlineProducts} search={search} setSearch={setSearch} lastSnapshotAt={lastSnapshotAt} />

  return (
    <div className="page-stack products-page">
      <PageHeader
        eyebrow="Katalog"
        title="Barang di setiap rak"
        description="Kelola identitas barang, satuan jual, harga, lokasi, dan batas stok."
        actions={<Button icon={<PackagePlus />} disabled={!categories.data?.length || !canWrite} disabledReason={!canWrite ? 'Sambungkan koneksi untuk menambah barang' : undefined} onClick={() => setFormOpen(true)}>Tambah barang</Button>}
      />

      <div className="filter-bar">
        <label className="filter-search"><Search /><input aria-label="Cari barang" type="search" placeholder="Cari nama atau SKU…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <label><span>Kategori</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">Semua kategori</option>{categories.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label><span>Status stok</span><select value={stockStatus} onChange={(event) => setStockStatus(event.target.value)}><option value="">Semua status</option><option value="OK">Tersedia</option><option value="LOW">Stok tipis</option><option value="OUT_OF_STOCK">Habis</option></select></label>
        <span className="filter-count"><Boxes /> {filtered.length} barang</span>
      </div>

      {products.isPending ? <LoadingState label="Membaca katalog" /> : null}
      {products.isError ? <EmptyState title="Katalog belum dapat dimuat" description="Periksa koneksi server, lalu coba kembali." /> : null}
      {products.isSuccess && filtered.length === 0 ? <EmptyState title="Barang tidak ditemukan" description="Ubah kata pencarian atau filter untuk melihat barang lain." action={<Button variant="secondary" onClick={() => { setSearch(''); setCategory(''); setStockStatus('') }}>Bersihkan filter</Button>} /> : null}
      {filtered.length ? (
        <div className="data-surface">
          <table className="data-table product-table">
            <thead><tr><th>Barang</th><th>Kategori / rak</th><th>Harga jual</th><th>Saldo dasar</th><th>Status</th><th aria-label="Tindakan" /></tr></thead>
            <tbody>
              {filtered.map((product) => (
                <tr key={product.id}>
                  <td data-label="Barang"><span className="table-product">{product.imageUrl ? <img src={product.imageUrl} alt="" loading="lazy" /> : <i style={{ background: product.category.color }} />}<span><strong>{product.name}</strong><small>{product.sku}</small></span></span></td>
                  <td data-label="Kategori / rak"><strong>{product.category.name}</strong><small>{product.location ?? 'Lokasi belum diisi'}</small></td>
                  <td data-label="Harga jual"><strong>{formatCurrency(product.salePrice)}</strong><small>per {product.baseUnit}</small></td>
                  <td data-label="Saldo dasar"><strong className="data-number">{formatQuantity(product.balanceBase)}</strong><small>{product.baseUnit}</small></td>
                  <td data-label="Status"><StatusBadge tone={getStockTone(product.stockStatus)}>{getStockLabel(product.stockStatus)}</StatusBadge></td>
                  <td><Link className="table-link" to={`/products/${product.id}`}>Lihat detail</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <Modal open={formOpen} onOpenChange={setFormOpen} title="Tambah barang baru" description="Mulai dari satuan dasar, lalu tambahkan kemasan seperti set atau lusin." size="large">
        <ProductForm
          categories={categories.data ?? []}
          defaultMinimumStock={storeSettings.defaultMinimumStock}
          pending={createProduct.isPending}
          serverError={createProduct.error instanceof ApiClientError ? createProduct.error.message : undefined}
          onSubmit={(input) => createProduct.mutate(input)}
          onCancel={() => setFormOpen(false)}
        />
      </Modal>
    </div>
  )
}

function OfflineProducts({
  products,
  search,
  setSearch,
  lastSnapshotAt,
}: {
  products: OfflineProduct[]
  search: string
  setSearch: (value: string) => void
  lastSnapshotAt: string | null
}) {
  const normalized = search.trim().toLocaleLowerCase('id-ID')
  const filtered = products.filter((product) => !normalized || product.name.toLocaleLowerCase('id-ID').includes(normalized) || product.sku.toLocaleLowerCase('id-ID').includes(normalized))
  return (
    <div className="page-stack products-page">
      <PageHeader eyebrow="Katalog baca saja" title="Barang tersimpan" description={`Offline${lastSnapshotAt ? ` · snapshot ${new Date(lastSnapshotAt).toLocaleString('id-ID')}` : ''}. Harga modal dan aksi tulis tidak disimpan di perangkat.`} />
      <label className="filter-search"><Search aria-hidden="true" /><input aria-label="Cari barang" type="search" placeholder="Cari nama atau SKU…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      {filtered.length ? <div className="offline-product-grid">{filtered.map((product) => <Link className="data-card" to={`/products/${product.id}`} key={product.id}><span className="table-product"><i /><span><strong>{product.name}</strong><small>{product.sku} · {product.category}</small></span></span><span><strong>{formatCurrency(product.salePrice)}</strong><small>per {product.baseUnit}</small></span><span><strong>{formatQuantity(product.balance)}</strong><small>{product.baseUnit} · {getStockLabel(product.stockStatus)}</small></span><small>Diskon {product.minimumDiscountPercent}%–{product.maximumDiscountPercent}%</small></Link>)}</div> : <EmptyState title="Barang tidak ditemukan" description="Ubah kata pencarian untuk melihat snapshot lain." />}
    </div>
  )
}
