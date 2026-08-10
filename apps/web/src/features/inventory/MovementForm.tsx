import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo, useRef, useState } from 'react'

import { apiRequest, ApiClientError, jsonBody } from '../../api/client.js'
import type { Product, StockMovement } from '../../api/types.js'
import { Button } from '../../components/ui/Button.js'
import { formatCurrency, formatQuantity } from '../../lib/format.js'

const movementOptions = [
  ['RECEIPT', 'Barang masuk'],
  ['DAMAGE', 'Barang pecah / rusak'],
  ['ADJUSTMENT_IN', 'Penyesuaian tambah'],
  ['ADJUSTMENT_OUT', 'Penyesuaian kurang'],
  ['RETURN_IN', 'Retur masuk'],
  ['RETURN_OUT', 'Retur keluar'],
  ['OPENING', 'Stok awal'],
] as const

export function MovementForm({
  products,
  initialProductId,
  initialType = 'RECEIPT',
  onSuccess,
  onCancel,
}: {
  products: Product[]
  initialProductId?: string | undefined
  initialType?: (typeof movementOptions)[number][0]
  onSuccess: (movement: StockMovement) => void
  onCancel: () => void
}) {
  const queryClient = useQueryClient()
  const [type, setType] = useState<(typeof movementOptions)[number][0]>(initialType)
  const [productId, setProductId] = useState(initialProductId ?? products[0]?.id ?? '')
  const product = useMemo(
    () => products.find((item) => item.id === productId) ?? products[0],
    [productId, products],
  )
  const initialUnit = product?.units.find((unit) => unit.isDefault) ?? product?.units[0]
  const [unitId, setUnitId] = useState(() => initialUnit?.id ?? '')
  const [quantity, setQuantity] = useState(1)
  const [unitCost, setUnitCost] = useState<number | undefined>(() =>
    product && initialUnit ? Math.round(product.costPrice * initialUnit.factor) : undefined,
  )
  const [note, setNote] = useState('')
  const [referenceId, setReferenceId] = useState('')
  const submissionAttempt = useRef<{ signature: string; key: string } | undefined>(undefined)
  const unit = product?.units.find((item) => item.id === unitId) ?? product?.units[0]
  const reasonRequired = type !== 'RECEIPT' && type !== 'OPENING'

  function chooseProduct(nextProductId: string) {
    setProductId(nextProductId)
    const next = products.find((item) => item.id === nextProductId)
    const nextUnit = next?.units.find((item) => item.isDefault) ?? next?.units[0]
    setUnitId(nextUnit?.id ?? '')
    setUnitCost(next && nextUnit ? Math.round(next.costPrice * nextUnit.factor) : undefined)
  }

  function chooseUnit(nextUnitId: string) {
    setUnitId(nextUnitId)
    const nextUnit = product?.units.find((item) => item.id === nextUnitId)
    setUnitCost(product && nextUnit ? Math.round(product.costPrice * nextUnit.factor) : undefined)
  }

  const mutation = useMutation({
    mutationFn: () => {
      const movement = {
        type,
        productId: product!.id,
        unitId: unit!.id,
        quantity,
        ...((type === 'RECEIPT' || type === 'OPENING') && unitCost !== undefined
          ? { unitCost }
          : {}),
        note,
        referenceId,
      }
      const signature = JSON.stringify(movement)
      if (submissionAttempt.current?.signature !== signature) {
        submissionAttempt.current = { signature, key: crypto.randomUUID() }
      }
      return apiRequest<StockMovement>('/api/v1/inventory/movements', {
        method: 'POST',
        ...jsonBody({
          idempotencyKey: submissionAttempt.current.key,
          ...movement,
        }),
      })
    },
    onSuccess: async (movement) => {
      submissionAttempt.current = undefined
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['reports'] }),
      ])
      onSuccess(movement)
    },
  })

  const valid = Boolean(
    product && unit && quantity > 0 && (!reasonRequired || note.trim().length > 0),
  )
  return (
    <form
      className="form-stack"
      onSubmit={(event) => {
        event.preventDefault()
        if (valid) mutation.mutate()
      }}
    >
      <div className="form-grid form-grid--2">
        <label className="form-field"><span>Jenis mutasi</span><select value={type} onChange={(event) => setType(event.target.value as typeof type)}>{movementOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="form-field"><span>Barang</span><select value={product?.id ?? ''} onChange={(event) => chooseProduct(event.target.value)}>{products.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.sku}</option>)}</select></label>
        <label className="form-field"><span>Satuan input</span><select value={unit?.id ?? ''} onChange={(event) => chooseUnit(event.target.value)}>{product?.units.map((item) => <option key={item.id} value={item.id}>{item.name} ({formatQuantity(item.factor)} {product.baseUnit})</option>)}</select></label>
        <label className="form-field"><span>Jumlah</span><input type="number" min="0.001" step="0.001" value={quantity || ''} onChange={(event) => setQuantity(Number(event.target.value))} /></label>
        {type === 'RECEIPT' || type === 'OPENING' ? (
          <label className="form-field"><span>Harga modal per {unit?.name ?? 'satuan'}</span><input type="number" min="0" value={unitCost ?? ''} onChange={(event) => setUnitCost(event.target.value === '' ? undefined : Number(event.target.value))} /><small>{unitCost === undefined ? 'Harga modal katalog tidak akan diubah' : `Setara ${formatCurrency(unit && unit.factor ? unitCost / unit.factor : 0)} per ${product?.baseUnit ?? 'satuan dasar'}`}</small></label>
        ) : null}
        <label className="form-field"><span>Referensi (opsional)</span><input placeholder="Contoh: PO-2026-08" value={referenceId} onChange={(event) => setReferenceId(event.target.value)} /></label>
      </div>
      <label className="form-field"><span>{reasonRequired ? 'Alasan / catatan' : 'Catatan (opsional)'}</span><textarea rows={3} required={reasonRequired} value={note} onChange={(event) => setNote(event.target.value)} placeholder={reasonRequired ? 'Jelaskan alasan agar riwayat mudah diaudit' : 'Nama pemasok atau keterangan lain'} /></label>
      {product && unit ? <div className="conversion-note"><strong>{formatQuantity(quantity)} {unit.name}</strong><span>akan mengubah stok sebesar {formatQuantity(quantity * unit.factor)} {product.baseUnit}</span></div> : null}
      {mutation.error ? <div className="form-alert" role="alert">{mutation.error instanceof ApiClientError ? mutation.error.message : 'Mutasi stok belum dapat disimpan.'}</div> : null}
      <div className="form-actions"><Button type="button" variant="ghost" onClick={onCancel}>Batal</Button><Button type="submit" pending={mutation.isPending} disabled={!valid}>Simpan mutasi</Button></div>
    </form>
  )
}
