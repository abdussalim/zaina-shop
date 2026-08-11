import type { DiscountType } from './schemas.js'

export interface DiscountRule {
  discountType: DiscountType
  minimumDiscount: number
  maximumDiscount: number
}

export interface SaleCalculationItem {
  quantity: number
  unitPrice: number
  discountType: DiscountType
  discountValue: number
}

export interface SaleLineTotals {
  subtotal: number
  discountAmount: number
  total: number
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
): SaleTotals {
  return items.reduce<SaleTotals>(
    (sum, item) => {
      const line = calculateSaleLineTotals(item)
      return {
        subtotal: sum.subtotal + line.subtotal,
        discount: sum.discount + line.discountAmount,
        total: sum.total + line.total,
      }
    },
    { subtotal: 0, discount: 0, total: 0 },
  )
}

export function calculateSaleLineTotals(
  item: SaleCalculationItem,
): SaleLineTotals {
  const quantity = scaled(item.quantity)
  const subtotalValue = roundHalfUp(
    quantity * BigInt(item.unitPrice),
    DECIMAL_SCALE,
  )
  const discountValue =
    item.discountType === 'PERCENTAGE'
      ? roundHalfUp(
          subtotalValue * scaled(item.discountValue),
          100n * DECIMAL_SCALE,
        )
      : roundHalfUp(
          quantity * BigInt(item.discountValue),
          DECIMAL_SCALE,
        )

  if (discountValue > subtotalValue) {
    throw new Error('Diskon tidak boleh melebihi subtotal')
  }

  const subtotal = safeMoney(subtotalValue)
  const discountAmount = safeMoney(discountValue)
  return {
    subtotal,
    discountAmount,
    total: subtotal - discountAmount,
  }
}

export function getDiscountValidationMessage(
  rule: DiscountRule,
  discountValue: number,
): string | undefined {
  if (
    !Number.isFinite(discountValue) ||
    discountValue < 0 ||
    Number(discountValue.toFixed(3)) !== discountValue
  ) {
    return 'Nilai diskon tidak valid'
  }
  if (discountValue === 0) return undefined
  if (rule.discountType === 'FIXED' && !Number.isInteger(discountValue)) {
    return 'Diskon nominal harus berupa rupiah bulat'
  }
  if (
    discountValue < rule.minimumDiscount ||
    discountValue > rule.maximumDiscount
  ) {
    return `Gunakan 0 atau diskon ${discountRangeLabel(rule)}`
  }
  return undefined
}

const DECIMAL_SCALE = 1_000n

function scaled(value: number): bigint {
  const [whole = '0', fraction = ''] = value.toFixed(3).split('.')
  return BigInt(whole) * DECIMAL_SCALE + BigInt(fraction.padEnd(3, '0'))
}

function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator / 2n) / denominator
}

function safeMoney(value: bigint): number {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error('Hasil perhitungan uang berada di luar batas aman')
  }
  return number
}

function discountRangeLabel(rule: DiscountRule): string {
  if (rule.discountType === 'FIXED') {
    const format = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 })
    return `Rp${format.format(rule.minimumDiscount)}–Rp${format.format(rule.maximumDiscount)}`
  }
  const format = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 3 })
  return `${format.format(rule.minimumDiscount)}%–${format.format(rule.maximumDiscount)}%`
}
