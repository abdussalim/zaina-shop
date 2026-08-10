import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Boxes, PackagePlus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
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

export function ProductsPage() {
  const storeSettings = useStoreSettings()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [stockStatus, setStockStatus] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiRequest<Category[]>('/api/v1/categories'),
  })
  const products = useQuery({
    queryKey: ['products'],
    queryFn: () => apiRequest<Product[]>('/api/v1/products'),
  })
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

  return (
    <div className="page-stack products-page">
      <PageHeader
        eyebrow="Katalog"
        title="Barang di setiap rak"
        description="Kelola identitas barang, satuan jual, harga, lokasi, dan batas stok."
        actions={<Button icon={<PackagePlus />} disabled={!categories.data?.length} onClick={() => setFormOpen(true)}>Tambah barang</Button>}
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
