import { toBaseQuantity, type MovementType, type StockMovementInput } from '@zaina/shared'

import type { Database } from '../../db/database.js'
import { AppError } from '../../http/errors.js'
import {
  findMovementByIdempotencyKey,
  getInventorySummary,
  insertMovement,
  listMovements,
  lockStockUnit,
  updateBalance,
  updateBaseCost,
  type LedgerMovementType,
} from './inventory.repository.js'

const outgoingTypes = new Set<LedgerMovementType>([
  'SALE',
  'DAMAGE',
  'ADJUSTMENT_OUT',
  'RETURN_OUT',
])

export function calculateMovementDelta(
  type: LedgerMovementType,
  quantity: number,
  factor: number,
): number {
  const quantityBase = toBaseQuantity(quantity, factor)
  return outgoingTypes.has(type) ? -quantityBase : quantityBase
}

export function createInventoryService(database: Database) {
  return {
    async recordMovement(input: StockMovementInput, actorId: string) {
      const previous = await findMovementByIdempotencyKey(
        database,
        input.idempotencyKey,
      )
      if (previous) return { movement: previous, created: false }

      try {
        const movement = await database.transaction(async (transaction) => {
          const stock = await lockStockUnit(
            transaction,
            input.productId,
            input.unitId,
          )
          if (!stock) {
            throw new AppError(
              404,
              'PRODUCT_UNIT_NOT_FOUND',
              'Barang atau satuan tidak ditemukan',
            )
          }

          const replay = await findMovementByIdempotencyKey(
            transaction,
            input.idempotencyKey,
          )
          if (replay) return replay

          const quantityBase = calculateMovementDelta(
            input.type,
            input.quantity,
            stock.factor,
          )
          const balanceAfter = toThreeDecimals(stock.balance + quantityBase)
          if (balanceAfter < 0) {
            throw new AppError(
              409,
              'INSUFFICIENT_STOCK',
              `Stok ${stock.productName} tidak mencukupi`,
            )
          }

          await updateBalance(transaction, stock.productId, balanceAfter)
          if (input.unitCost !== undefined && isIncoming(input.type)) {
            const baseCost = Math.round(input.unitCost / stock.factor)
            await updateBaseCost(transaction, stock.productId, baseCost)
          }
          return insertMovement(transaction, {
            input,
            actorId,
            factor: stock.factor,
            quantityBase,
            balanceAfter,
          })
        })
        return { movement, created: true }
      } catch (error) {
        if (isUniqueViolation(error)) {
          const replay = await findMovementByIdempotencyKey(
            database,
            input.idempotencyKey,
          )
          if (replay) return { movement: replay, created: false }
        }
        throw error
      }
    },
    listMovements(filters: {
      productId?: string
      type?: LedgerMovementType
      limit: number
    }) {
      return listMovements(database, filters)
    },
    getSummary() {
      return getInventorySummary(database)
    },
  }
}

function isIncoming(type: MovementType): boolean {
  return type === 'OPENING' || type === 'RECEIPT' || type === 'ADJUSTMENT_IN' || type === 'RETURN_IN'
}

function toThreeDecimals(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000) / 1_000
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string }).code === '23505'
}
