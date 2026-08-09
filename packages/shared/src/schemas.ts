import { z } from 'zod'

const moneySchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
const quantitySchema = z
  .number()
  .positive()
  .refine((value) => Number.isInteger(value * 1_000), {
    message: 'Jumlah maksimal memiliki tiga angka desimal',
  })

const optionalText = (maximum: number) =>
  z.preprocess(
    (value) =>
      typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().trim().max(maximum).optional(),
  )

export const productUnitInputSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(40),
  factor: quantitySchema,
  salePrice: moneySchema,
  isDefault: z.boolean(),
})

export const productInputSchema = z
  .object({
    sku: z.string().trim().min(1).max(60),
    barcode: optionalText(100),
    name: z.string().trim().min(2).max(160),
    categoryId: z.uuid(),
    location: optionalText(100),
    baseUnit: z.string().trim().min(1).max(40),
    costPrice: moneySchema,
    salePrice: moneySchema,
    minimumStock: z.number().min(0),
    imageUrl: optionalText(500),
    units: z.array(productUnitInputSchema).min(1).max(20),
  })
  .superRefine((product, context) => {
    const normalizedBaseUnit = product.baseUnit.toLocaleLowerCase('id-ID')
    const matchingBaseUnits = product.units.filter(
      (unit) =>
        unit.factor === 1 &&
        unit.name.toLocaleLowerCase('id-ID') === normalizedBaseUnit,
    )

    if (matchingBaseUnits.length !== 1) {
      context.addIssue({
        code: 'custom',
        path: ['units'],
        message: 'Harus ada tepat satu satuan dasar dengan faktor 1',
      })
    }

    if (product.units.filter((unit) => unit.isDefault).length !== 1) {
      context.addIssue({
        code: 'custom',
        path: ['units'],
        message: 'Harus ada tepat satu satuan penjualan default',
      })
    }

    const names = product.units.map((unit) =>
      unit.name.toLocaleLowerCase('id-ID'),
    )
    if (new Set(names).size !== names.length) {
      context.addIssue({
        code: 'custom',
        path: ['units'],
        message: 'Nama satuan tidak boleh duplikat',
      })
    }
  })

export const movementTypeSchema = z.enum([
  'OPENING',
  'RECEIPT',
  'DAMAGE',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
  'RETURN_IN',
  'RETURN_OUT',
])

export const stockMovementInputSchema = z
  .object({
    idempotencyKey: z.uuid(),
    type: movementTypeSchema,
    productId: z.uuid(),
    unitId: z.uuid(),
    quantity: quantitySchema,
    unitCost: moneySchema.optional(),
    note: optionalText(500),
    referenceId: optionalText(100),
  })
  .superRefine((movement, context) => {
    const reasonRequired = movement.type !== 'OPENING' && movement.type !== 'RECEIPT'
    if (reasonRequired && !movement.note) {
      context.addIssue({
        code: 'custom',
        path: ['note'],
        message: 'Alasan wajib diisi untuk jenis mutasi ini',
      })
    }
  })

export const saleItemInputSchema = z.object({
  productId: z.uuid(),
  unitId: z.uuid(),
  quantity: quantitySchema,
})

export const saleInputSchema = z
  .object({
    idempotencyKey: z.uuid(),
    discount: moneySchema.default(0),
    amountPaid: moneySchema,
    note: optionalText(500),
    items: z.array(saleItemInputSchema).min(1).max(100),
  })
  .superRefine((sale, context) => {
    const productIds = sale.items.map((item) => item.productId)
    if (new Set(productIds).size !== productIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['items'],
        message: 'Satu barang hanya boleh muncul satu kali dalam keranjang',
      })
    }
  })

export const loginInputSchema = z.object({
  username: z.string().trim().min(1).max(80),
  password: z.string().min(8).max(200),
})

export const categoryInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
})

export type ProductInput = z.infer<typeof productInputSchema>
export type ProductUnitInput = z.infer<typeof productUnitInputSchema>
export type StockMovementInput = z.infer<typeof stockMovementInputSchema>
export type SaleInput = z.infer<typeof saleInputSchema>
export type LoginInput = z.infer<typeof loginInputSchema>
export type CategoryInput = z.infer<typeof categoryInputSchema>
export type MovementType = z.infer<typeof movementTypeSchema>
