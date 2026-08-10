import { randomUUID } from 'node:crypto'

import { calculateSaleTotals, toBaseQuantity, type SaleInput } from '@zaina/shared'

import type { Database } from '../../db/database.js'
import { AppError } from '../../http/errors.js'
import { findStoreTimezone } from '../settings/settings.repository.js'
import { findSale, findSaleByIdempotencyKey, listSales } from './sales.queries.js'
import {
  findCancellationLines,
  findSellingUnits,
  insertSaleHeader,
  insertSaleLine,
  insertSaleMovement,
  lockSale,
  lockStockProducts,
  markSaleCancelled,
  setStockBalance,
  type SaleLineSnapshot,
  type UnitSnapshot,
} from './sales.repository.js'

interface CatalogSnapshot extends UnitSnapshot {
  productName: string
  costPrice: number
}

export function prepareSaleLine(
  input: SaleInput['items'][number],
  catalog: CatalogSnapshot,
): SaleLineSnapshot {
  const quantityBase = toBaseQuantity(input.quantity, catalog.factor)
  return {
    ...catalog,
    quantityInput: input.quantity,
    quantityBase,
    subtotal: Math.round(input.quantity * catalog.salePrice),
    costTotal: Math.round(quantityBase * catalog.costPrice),
  }
}

export function createSalesService(database: Database, timezone: string) {
  return {
    async completeSale(input: SaleInput, actorId: string) {
      const replay = await findSaleByIdempotencyKey(database, input.idempotencyKey)
      if (replay) return { sale: replay, created: false }

      try {
        const saleId = await database.transaction(async (transaction) => {
          const productIds = [...new Set(input.items.map((item) => item.productId))].sort()
          const stocks = await lockStockProducts(transaction, productIds)
          const units = await findSellingUnits(
            transaction,
            input.items.map((item) => item.unitId),
          )
          const lines = prepareLines(input, stocks, units)
          const totals = saleTotals(lines, input.discount)
          if (input.amountPaid < totals.total) {
            throw new AppError(
              422,
              'INSUFFICIENT_PAYMENT',
              'Jumlah pembayaran kurang dari total penjualan',
            )
          }

          const id = randomUUID()
          const currentTimezone = await findStoreTimezone(transaction, timezone)
          await insertSaleHeader(transaction, {
            id,
            saleNumber: createSaleNumber(new Date(), currentTimezone),
            idempotencyKey: input.idempotencyKey,
            ...totals,
            amountPaid: input.amountPaid,
            changeAmount: input.amountPaid - totals.total,
            ...(input.note ? { note: input.note } : {}),
            actorId,
          })

          const stockByProduct = new Map(stocks.map((stock) => [stock.productId, stock]))
          for (const line of lines) {
            const stock = stockByProduct.get(line.productId)!
            const balanceAfter = toThreeDecimals(stock.balance - line.quantityBase)
            if (balanceAfter < 0) {
              throw new AppError(
                409,
                'INSUFFICIENT_STOCK',
                `Stok ${line.productName} tidak mencukupi`,
              )
            }
            await setStockBalance(transaction, line.productId, balanceAfter)
            await insertSaleLine(transaction, id, line)
            await insertSaleMovement(transaction, {
              saleId: id,
              line,
              quantityBase: -line.quantityBase,
              balanceAfter,
              type: 'SALE',
              actorId,
            })
          }
          return id
        })
        return { sale: (await findSale(database, saleId))!, created: true }
      } catch (error) {
        if (isUniqueViolation(error)) {
          const replay = await findSaleByIdempotencyKey(database, input.idempotencyKey)
          if (replay) return { sale: replay, created: false }
        }
        throw error
      }
    },
    list(filters: Parameters<typeof listSales>[1]) {
      return listSales(database, filters)
    },
    async get(saleId: string) {
      const sale = await findSale(database, saleId)
      if (!sale) throw new AppError(404, 'SALE_NOT_FOUND', 'Penjualan tidak ditemukan')
      return sale
    },
    async cancel(saleId: string, reason: string, actorId: string) {
      await database.transaction(async (transaction) => {
        const sale = await lockSale(transaction, saleId)
        if (!sale) throw new AppError(404, 'SALE_NOT_FOUND', 'Penjualan tidak ditemukan')
        if (sale.status === 'CANCELLED') {
          throw new AppError(409, 'SALE_ALREADY_CANCELLED', 'Penjualan sudah dibatalkan')
        }

        const lines = await findCancellationLines(transaction, saleId)
        const productIds = [...new Set(lines.map((line) => line.productId))].sort()
        const stocks = await lockStockProducts(transaction, productIds, {
          includeInactive: true,
        })
        const stockByProduct = new Map(stocks.map((stock) => [stock.productId, stock]))
        for (const line of lines) {
          const stock = stockByProduct.get(line.productId)!
          const balanceAfter = toThreeDecimals(stock.balance + line.quantityBase)
          stock.balance = balanceAfter
          await setStockBalance(transaction, line.productId, balanceAfter)
          await insertSaleMovement(transaction, {
            saleId,
            line,
            quantityBase: line.quantityBase,
            balanceAfter,
            type: 'SALE_REVERSAL',
            note: reason,
            actorId,
          })
        }
        await markSaleCancelled(transaction, saleId, reason, actorId)
      })
      return (await findSale(database, saleId))!
    },
  }
}

function prepareLines(
  input: SaleInput,
  stocks: Awaited<ReturnType<typeof lockStockProducts>>,
  units: UnitSnapshot[],
): SaleLineSnapshot[] {
  const stockByProduct = new Map(stocks.map((stock) => [stock.productId, stock]))
  const unitById = new Map(units.map((unit) => [unit.unitId, unit]))
  return input.items.map((item) => {
    const stock = stockByProduct.get(item.productId)
    const unit = unitById.get(item.unitId)
    if (!stock || !unit || unit.productId !== item.productId) {
      throw new AppError(
        404,
        'PRODUCT_UNIT_NOT_FOUND',
        'Barang atau satuan penjualan tidak ditemukan',
      )
    }
    return prepareSaleLine(item, {
      ...unit,
      productName: stock.productName,
      costPrice: stock.costPrice,
    })
  })
}

function saleTotals(lines: readonly SaleLineSnapshot[], discount: number) {
  try {
    return calculateSaleTotals(
      lines.map((line) => ({
        quantity: line.quantityInput,
        unitPrice: line.salePrice,
      })),
      discount,
    )
  } catch (error) {
    if (error instanceof Error && error.message.includes('Diskon')) {
      throw new AppError(422, 'INVALID_DISCOUNT', error.message)
    }
    throw error
  }
}

function createSaleNumber(date: Date, timezone: string): string {
  const localDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(date)
    .replaceAll('-', '')
  return `PJ-${localDate}-${randomUUID().slice(0, 8).toUpperCase()}`
}

function toThreeDecimals(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000) / 1_000
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string }).code === '23505'
}
