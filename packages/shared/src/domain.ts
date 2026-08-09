export interface SaleCalculationItem {
  quantity: number
  unitPrice: number
}

export interface SaleTotals {
  subtotal: number
  discount: number
  total: number
}

export function toBaseQuantity(quantity: number, factor: number): number {
  if (!Number.isFinite(factor) || factor <= 0) {
    throw new Error('Faktor konversi harus berupa angka positif')
  }

  return Math.round((quantity * factor + Number.EPSILON) * 1_000) / 1_000
}

export function calculateSaleTotals(
  items: readonly SaleCalculationItem[],
  discount: number,
): SaleTotals {
  const subtotal = items.reduce(
    (sum, item) => sum + Math.round(item.quantity * item.unitPrice),
    0,
  )

  if (discount > subtotal) {
    throw new Error('Diskon tidak boleh melebihi subtotal')
  }

  return { subtotal, discount, total: subtotal - discount }
}
