import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Minus, Plus, Search, ShoppingBasket, Trash2 } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { calculateSaleLineTotals, getDiscountValidationMessage } from '@zaina/shared'

import { apiRequest, ApiClientError, assertOnlineWrite, jsonBody, OfflineWriteError } from '../../api/client.js'
import type { Product, ProductUnit, Sale } from '../../api/types.js'
import { Button } from '../../components/ui/Button.js'
import { PageHeader } from '../../components/ui/PageHeader.js'
import { EmptyState, LoadingState } from '../../components/ui/States.js'
import { StatusBadge } from '../../components/ui/StatusBadge.js'
import { formatCurrency, formatDiscountRange, formatQuantity, getStockLabel, getStockTone } from '../../lib/format.js'
import { useConnectivity } from '../../app/ConnectivityContext.js'

interface CartLine {
  product: Product
  unitId: string
  quantity: number
  discountValue: number
}

export function SalesPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { isOffline, canWrite } = useConnectivity()
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartLine[]>([])
  const [amountPaid, setAmountPaid] = useState(0)
  const [note, setNote] = useState('')
  const [checkoutError, setCheckoutError] = useState<string>()
  const checkoutAttempt = useRef<{ signature: string; key: string } | undefined>(undefined)
  const products = useQuery({
    queryKey: ['products', 'sales'],
    queryFn: () => apiRequest<Product[]>('/api/v1/products'),
    enabled: !isOffline,
  })

  const visibleProducts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('id-ID')
    return (products.data ?? []).filter(
      (product) =>
        !query ||
        product.name.toLocaleLowerCase('id-ID').includes(query) ||
        product.sku.toLocaleLowerCase('id-ID').includes(query),
    )
  }, [products.data, search])

  const lineSummaries = cart.map(summarizeLine)
  const subtotal = lineSummaries.reduce((sum, line) => sum + line.subtotal, 0)
  const discount = lineSummaries.reduce((sum, line) => sum + line.discountAmount, 0)
  const total = lineSummaries.reduce((sum, line) => sum + line.total, 0)

  const checkout = useMutation({
    mutationFn: () => {
      assertOnlineWrite(canWrite)
      const transaction = {
        amountPaid,
        note,
        items: cart.map((line) => ({
          productId: line.product.id,
          unitId: line.unitId,
          quantity: line.quantity,
          discountValue: line.discountValue,
        })),
      }
      const signature = JSON.stringify(transaction)
      if (checkoutAttempt.current?.signature !== signature) {
        checkoutAttempt.current = { signature, key: crypto.randomUUID() }
      }
      return apiRequest<Sale>('/api/v1/sales', {
        method: 'POST',
        ...jsonBody({
          idempotencyKey: checkoutAttempt.current.key,
          ...transaction,
        }),
      })
    },
    onSuccess: async (sale) => {
      checkoutAttempt.current = undefined
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['sales'] }),
        queryClient.invalidateQueries({ queryKey: ['reports'] }),
      ])
      navigate(`/sales/${sale.id}`)
    },
    onError: (error) => {
      setCheckoutError(error instanceof ApiClientError || error instanceof OfflineWriteError ? error.message : 'Penjualan belum dapat disimpan.')
    },
  })

  function addProduct(product: Product) {
    if (cart.some((line) => line.product.id === product.id)) return
    const defaultUnit = product.units.find((unit) => unit.isDefault) ?? product.units[0]
    if (!defaultUnit) return
    setCart((current) => [
      ...current,
      { product, unitId: defaultUnit.id, quantity: 1, discountValue: 0 },
    ])
  }

  function updateLine(
    productId: string,
    patch: Partial<Pick<CartLine, 'unitId' | 'quantity' | 'discountValue'>>,
  ) {
    setCart((current) =>
      current.map((line) => (line.product.id === productId ? { ...line, ...patch } : line)),
    )
  }

  const stockEnough = cart.every(
    (line) => line.quantity * selectedUnit(line).factor <= line.product.balanceBase,
  )
  const validQuantities = cart.every(
    (line) =>
      Number.isFinite(line.quantity) &&
      line.quantity > 0 &&
      Number(line.quantity.toFixed(3)) === line.quantity,
  )
  const validDiscounts = lineSummaries.every((line) => !line.discountError)
  const validPayment = Number.isFinite(amountPaid) && amountPaid >= 0
  const canCheckout =
    cart.length > 0 &&
    validQuantities &&
    validDiscounts &&
    validPayment &&
    amountPaid >= total &&
    stockEnough &&
    canWrite &&
    !checkout.isPending

  return (
    <div className="page-stack sales-page">
      <PageHeader
        eyebrow="Kasir"
        title="Penjualan baru"
        description="Pilih barang dari rak digital, tentukan satuan, lalu selesaikan pembayaran."
      />
      {isOffline ? <div className="offline-banner" aria-live="polite" aria-atomic="true">Offline. Keranjang tetap di layar, tetapi checkout membutuhkan koneksi server.</div> : null}
      <div className="sales-workspace">
        <section className="sales-catalog">
          <div className="catalog-search">
            <Search aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari nama atau SKU barang…"
              aria-label="Cari barang"
            />
          </div>

          {products.isPending ? <LoadingState label="Memuat rak barang" /> : null}
          {products.isError ? (
            <EmptyState title="Barang belum dapat dimuat" description="Periksa koneksi lalu coba lagi." />
          ) : null}
          {products.isSuccess ? (
            <div className="product-picker">
              {visibleProducts.map((product) => {
                const saleUnit = defaultSellingUnit(product)
                return (
                  <button
                  type="button"
                  key={product.id}
                  className="product-pick"
                  onClick={() => addProduct(product)}
                  disabled={!saleUnit || product.balanceBase <= 0 || cart.some((line) => line.product.id === product.id)}
                  aria-label={`Tambahkan ${product.name}, ${formatCurrency(saleUnit?.salePrice ?? product.salePrice)}`}
                >
                  <span className="product-pick__category" style={{ '--category-color': product.category.color } as React.CSSProperties}>
                    {product.category.name}
                  </span>
                  <strong>{product.name}</strong>
                  <small>{product.sku} · {product.location ?? 'Lokasi belum diisi'}</small>
                  <span className="product-pick__footer">
                    <b>{formatCurrency(saleUnit?.salePrice ?? product.salePrice)}{saleUnit ? <small> / {saleUnit.name}</small> : null}</b>
                    <StatusBadge tone={getStockTone(product.stockStatus)}>{getStockLabel(product.stockStatus)} · {formatQuantity(product.balanceBase)}</StatusBadge>
                  </span>
                  </button>
                )
              })}
            </div>
          ) : null}
        </section>

        <aside className="cart-panel">
          <div className="cart-panel__heading">
            <span><ShoppingBasket aria-hidden="true" /><strong>Keranjang</strong></span>
            <small>{cart.length} barang</small>
          </div>
          {cart.length === 0 ? (
            <div className="cart-empty"><ShoppingBasket aria-hidden="true" /><p>Pilih barang di sebelah kiri untuk memulai penjualan.</p></div>
          ) : (
            <div className="cart-lines">
              {lineSummaries.map((summary) => {
                const { line, unit } = summary
                return (
                  <article className="cart-line" key={line.product.id}>
                    <div className="cart-line__title">
                      <span><strong>{line.product.name}</strong><small>{line.product.sku}</small></span>
                      <button type="button" className="icon-button" aria-label={`Hapus ${line.product.name}`} onClick={() => setCart((current) => current.filter((item) => item.product.id !== line.product.id))}><Trash2 /></button>
                    </div>
                    <div className="cart-line__controls">
                      <label>
                        <span>Satuan</span>
                        <select
                          aria-label={cart.length === 1 ? 'Satuan' : `Satuan ${line.product.name}`}
                          value={line.unitId}
                          onChange={(event) => updateLine(line.product.id, {
                            unitId: event.target.value,
                            discountValue: 0,
                          })}
                        >
                          {line.product.units.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                        </select>
                      </label>
                      <div className="cart-control">
                        <span>Jumlah</span>
                        <div className="quantity-stepper">
                          <button type="button" aria-label={`Kurangi ${line.product.name}`} onClick={() => updateLine(line.product.id, { quantity: Math.max(0.001, line.quantity - 1) })}><Minus /></button>
                          <input aria-label={cart.length === 1 ? 'Jumlah' : `Jumlah ${line.product.name}`} type="number" min="0.001" step="0.001" value={line.quantity || ''} onChange={(event) => updateLine(line.product.id, { quantity: Number(event.target.value) })} />
                          <button type="button" aria-label={`Tambah ${line.product.name}`} onClick={() => updateLine(line.product.id, { quantity: line.quantity + 1 })}><Plus /></button>
                        </div>
                      </div>
                    </div>
                    <div className="cart-line__conversion">
                      <span>{formatQuantity(line.quantity * unit.factor)} {line.product.baseUnit} dari stok</span>
                      <small>@ {formatCurrency(unit.salePrice)} / {unit.name}</small>
                    </div>
                    <label className="cart-line__discount">
                      <span>Diskon per {unit.name}</span>
                      <div className="discount-input">
                        {unit.discountType === 'FIXED' ? <span>Rp</span> : null}
                        <input
                          aria-label={cart.length === 1 ? 'Diskon per satuan' : `Diskon ${line.product.name}`}
                          type="number"
                          min="0"
                          step={unit.discountType === 'FIXED' ? '1' : '0.001'}
                          value={line.discountValue}
                          onChange={(event) => updateLine(line.product.id, {
                            discountValue: Number(event.target.value),
                          })}
                        />
                        {unit.discountType === 'PERCENTAGE' ? <span>%</span> : null}
                      </div>
                      <small>0 selalu boleh · {formatDiscountRange(unit)}</small>
                      {summary.discountError ? (
                        <small className="cart-line__error">{summary.discountError}</small>
                      ) : null}
                    </label>
                    <div className="cart-line__pricing">
                      <div><span>Kotor</span><strong>{formatCurrency(summary.subtotal)}</strong></div>
                      <div><span>Potongan</span><strong>− {formatCurrency(summary.discountAmount)}</strong></div>
                      <div><span>Bersih</span><strong>{formatCurrency(summary.total)}</strong></div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}

          <div className="cart-totals">
            <div><span>Subtotal kotor</span><strong>{formatCurrency(subtotal)}</strong></div>
            <div><span>Total diskon</span><strong>− {formatCurrency(discount)}</strong></div>
            <div className="cart-totals__grand"><span>Total</span><strong>{formatCurrency(total)}</strong></div>
            <label><span>Jumlah dibayar</span><input aria-label="Jumlah dibayar" type="number" min="0" value={amountPaid || ''} onChange={(event) => setAmountPaid(Number(event.target.value))} /></label>
            <div><span>Kembalian</span><strong>{formatCurrency(Math.max(0, amountPaid - total))}</strong></div>
            <label><span>Catatan (opsional)</span><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} /></label>
          </div>

          {checkoutError ? <div className="form-alert" role="alert">{checkoutError}</div> : null}
          <Button
            size="large"
            pending={checkout.isPending}
            disabled={!canCheckout}
            disabledReason={!canWrite ? 'Sambungkan koneksi untuk menyelesaikan penjualan' : undefined}
            onClick={() => {
              setCheckoutError(undefined)
              checkout.mutate()
            }}
          >
            Selesaikan penjualan
          </Button>
          {cart.length > 0 && !validQuantities ? <small className="cart-hint">Jumlah setiap barang harus lebih dari nol.</small> : null}
          {cart.length > 0 && !stockEnough ? <small className="cart-hint">Jumlah keranjang melebihi stok yang tersedia.</small> : null}
          {cart.length > 0 && amountPaid < total ? <small className="cart-hint">Jumlah dibayar harus mencapai total.</small> : null}
        </aside>
      </div>
    </div>
  )
}

function selectedUnit(line: CartLine): ProductUnit {
  return line.product.units.find((unit) => unit.id === line.unitId) ?? line.product.units[0]!
}

function summarizeLine(line: CartLine) {
  const unit = selectedUnit(line)
  const discountError = getDiscountValidationMessage(unit, line.discountValue)
  const validQuantity =
    Number.isFinite(line.quantity) &&
    line.quantity > 0 &&
    Number(line.quantity.toFixed(3)) === line.quantity
  const totals = validQuantity
    ? calculateSaleLineTotals({
        quantity: line.quantity,
        unitPrice: unit.salePrice,
        discountType: unit.discountType,
        discountValue: discountError ? 0 : line.discountValue,
      })
    : { subtotal: 0, discountAmount: 0, total: 0 }
  return { line, unit, discountError, ...totals }
}

function defaultSellingUnit(product: Product): ProductUnit | undefined {
  return product.units.find((unit) => unit.isDefault) ?? product.units[0]
}
