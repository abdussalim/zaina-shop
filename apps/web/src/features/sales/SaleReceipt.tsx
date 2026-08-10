import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Ban, Printer, ShoppingBasket } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { apiRequest, ApiClientError, jsonBody } from '../../api/client.js'
import type { Sale } from '../../api/types.js'
import { Button } from '../../components/ui/Button.js'
import { Modal } from '../../components/ui/Modal.js'
import { EmptyState, LoadingState } from '../../components/ui/States.js'
import { StatusBadge } from '../../components/ui/StatusBadge.js'
import { formatCurrency, formatDateTime, formatQuantity } from '../../lib/format.js'
import { useStoreSettings } from '../../app/StoreSettingsContext.js'

export function SaleReceipt() {
  const storeSettings = useStoreSettings()
  const { id = '' } = useParams()
  const queryClient = useQueryClient()
  const [cancelOpen, setCancelOpen] = useState(false)
  const [reason, setReason] = useState('')
  const sale = useQuery({ queryKey: ['sales', id], queryFn: () => apiRequest<Sale>(`/api/v1/sales/${id}`), enabled: Boolean(id) })
  const cancellation = useMutation({
    mutationFn: () => apiRequest<Sale>(`/api/v1/sales/${id}/cancel`, { method: 'POST', ...jsonBody({ reason }) }),
    onSuccess: async () => {
      setCancelOpen(false)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['sales'] }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ])
    },
  })

  if (sale.isPending) return <LoadingState label="Membuka bukti penjualan" />
  if (sale.isError) return <EmptyState title="Bukti penjualan tidak ditemukan" description="Periksa nomor atau kembali ke dashboard." />
  const receipt = sale.data
  return (
    <div className="page-stack receipt-page">
      <div className="detail-topbar no-print">
        <Link className="back-link" to="/sales/new"><ArrowLeft /> Kembali ke kasir</Link>
        <div className="page-header__actions">
          {receipt.status === 'COMPLETED' ? <Button variant="ghost" icon={<Ban />} onClick={() => setCancelOpen(true)}>Batalkan penjualan</Button> : null}
          <Button variant="secondary" icon={<Printer />} onClick={() => window.print()}>Cetak bukti</Button>
          <Link className="button button--primary button--medium" to="/sales/new"><ShoppingBasket /> Penjualan baru</Link>
        </div>
      </div>
      <article className="receipt">
        <header className="receipt__header">
          <div className="brand-lockup"><span className="brand-seal"><span>Z</span></span><span><strong>{storeSettings.storeName}</strong><small>{[storeSettings.address, storeSettings.phone].filter(Boolean).join(' · ') || 'Perabotan rumah & pecah belah'}</small></span></div>
          <StatusBadge tone={receipt.status === 'COMPLETED' ? 'success' : 'danger'}>{receipt.status === 'COMPLETED' ? 'Lunas' : 'Dibatalkan'}</StatusBadge>
        </header>
        <div className="receipt__meta"><div><span>Nomor transaksi</span><strong>{receipt.saleNumber}</strong></div><div><span>Waktu</span><strong>{formatDateTime(receipt.soldAt, storeSettings.timezone)}</strong></div></div>
        <div className="receipt__items">
          <div className="receipt__row receipt__row--head"><span>Barang</span><span>Jumlah</span><span>Harga</span><span>Subtotal</span></div>
          {receipt.items?.map((item) => <div className="receipt__row" key={item.id}><span><strong>{item.productName}</strong><small>{item.unitName}</small></span><span>{formatQuantity(item.quantityInput)}</span><span>{formatCurrency(item.unitPrice)}</span><strong>{formatCurrency(item.subtotal)}</strong></div>)}
        </div>
        <dl className="receipt__totals"><div><dt>Subtotal</dt><dd>{formatCurrency(receipt.subtotal)}</dd></div><div><dt>Diskon</dt><dd>− {formatCurrency(receipt.discount)}</dd></div><div className="receipt__grand"><dt>Total</dt><dd>{formatCurrency(receipt.total)}</dd></div><div><dt>Dibayar</dt><dd>{formatCurrency(receipt.amountPaid)}</dd></div><div><dt>Kembalian</dt><dd>{formatCurrency(receipt.changeAmount)}</dd></div></dl>
        {receipt.note ? <p className="receipt__note">Catatan: {receipt.note}</p> : null}
        {receipt.status === 'CANCELLED' ? <div className="cancelled-note"><strong>Transaksi dibatalkan</strong><span>{receipt.cancellationReason} · {receipt.cancelledAt ? formatDateTime(receipt.cancelledAt, storeSettings.timezone) : ''}</span></div> : null}
        <footer>Terima kasih telah berbelanja di {storeSettings.storeName}.</footer>
      </article>

      <Modal open={cancelOpen} onOpenChange={setCancelOpen} title="Batalkan penjualan?" description="Stok setiap barang akan dikembalikan. Tindakan ini hanya dapat dilakukan sekali." size="small">
        <form className="form-stack" onSubmit={(event) => { event.preventDefault(); cancellation.mutate() }}>
          <label className="form-field"><span>Alasan pembatalan</span><textarea autoFocus rows={3} minLength={3} required value={reason} onChange={(event) => setReason(event.target.value)} /></label>
          {cancellation.error ? <div className="form-alert" role="alert">{cancellation.error instanceof ApiClientError ? cancellation.error.message : 'Penjualan belum dapat dibatalkan.'}</div> : null}
          <div className="form-actions"><Button type="button" variant="ghost" onClick={() => setCancelOpen(false)}>Kembali</Button><Button type="submit" variant="danger" pending={cancellation.isPending} disabled={reason.trim().length < 3}>Ya, batalkan</Button></div>
        </form>
      </Modal>
    </div>
  )
}
