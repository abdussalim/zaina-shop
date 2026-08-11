const currencyFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
})

export function formatCurrency(value: number): string {
  return currencyFormatter.format(value).replace(/\s/g, '')
}

export const formatQuantity = new Intl.NumberFormat('id-ID', {
  maximumFractionDigits: 3,
}).format

export function formatDiscountRange(rule: {
  discountType: 'PERCENTAGE' | 'FIXED'
  minimumDiscount: number
  maximumDiscount: number
}): string {
  if (rule.minimumDiscount === 0 && rule.maximumDiscount === 0) {
    return 'Tanpa diskon'
  }
  if (rule.discountType === 'FIXED') {
    return `${formatCurrency(rule.minimumDiscount)}–${formatCurrency(rule.maximumDiscount)}`
  }
  return `${formatQuantity(rule.minimumDiscount)}%–${formatQuantity(rule.maximumDiscount)}%`
}

const dateTimeFormatters = new Map<string, Intl.DateTimeFormat>()

export function formatDateTime(
  value: string | Date,
  timezone = 'Asia/Jakarta',
): string {
  let formatter = dateTimeFormatters.get(timezone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timezone,
    })
    dateTimeFormatters.set(timezone, formatter)
  }
  return formatter.format(new Date(value))
}

export const movementLabels: Record<string, string> = {
  OPENING: 'Stok awal',
  RECEIPT: 'Barang masuk',
  SALE: 'Terjual',
  SALE_REVERSAL: 'Pembatalan jual',
  DAMAGE: 'Barang pecah/rusak',
  ADJUSTMENT_IN: 'Penyesuaian masuk',
  ADJUSTMENT_OUT: 'Penyesuaian keluar',
  RETURN_IN: 'Retur masuk',
  RETURN_OUT: 'Retur keluar',
}

export function getStockLabel(status: 'OUT_OF_STOCK' | 'LOW' | 'OK') {
  return status === 'OUT_OF_STOCK'
    ? 'Habis'
    : status === 'LOW'
      ? 'Stok tipis'
      : 'Tersedia'
}

export function getStockTone(status: 'OUT_OF_STOCK' | 'LOW' | 'OK') {
  return status === 'OUT_OF_STOCK' ? 'danger' : status === 'LOW' ? 'warning' : 'success'
}
