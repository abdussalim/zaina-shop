import { Router, type Response } from 'express'
import { z } from 'zod'

import type { Database } from '../../db/database.js'
import { sendData } from '../../http/respond.js'
import { requireSession } from '../auth/auth.routes.js'
import { findStoreTimezone } from '../settings/settings.repository.js'
import { toCsv } from './csv.js'
import {
  getDashboard,
  getInventoryReport,
  getSalesReport,
  type DateFilters,
} from './reports.repository.js'

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export function createReportsRouter(database: Database, timezone: string): Router {
  const router = Router()
  router.use(requireSession)

  router.get('/dashboard', async (_request, response) => {
    const currentTimezone = await findStoreTimezone(database, timezone)
    return sendData(response, await getDashboard(database, currentTimezone))
  })

  router.get('/reports/sales', async (request, response) => {
    const filters = parseDateFilters(request.query)
    const currentTimezone = await findStoreTimezone(database, timezone)
    const report = await getSalesReport(database, filters, currentTimezone)
    if (request.query.format === 'csv') return sendSalesCsv(response, report)
    return sendData(response, report)
  })

  router.get('/reports/inventory', async (request, response) => {
    const report = await getInventoryReport(database)
    if (request.query.format === 'csv') return sendInventoryCsv(response, report)
    return sendData(response, report)
  })

  return router
}

function parseDateFilters(query: Record<string, unknown>): DateFilters {
  const from = dateSchema.optional().parse(query.from)
  const to = dateSchema.optional().parse(query.to)
  return {
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  }
}

function sendSalesCsv(
  response: Response,
  report: Awaited<ReturnType<typeof getSalesReport>>,
) {
  const csv = toCsv(
    ['Nomor Penjualan', 'Tanggal', 'Subtotal', 'Diskon', 'Total'],
    report.transactions.map((sale) => [
      sale.saleNumber,
      String(sale.soldAt),
      sale.subtotal,
      sale.discount,
      sale.total,
    ]),
  )
  return sendCsv(response, 'laporan-penjualan.csv', csv)
}

function sendInventoryCsv(
  response: Response,
  report: Awaited<ReturnType<typeof getInventoryReport>>,
) {
  const csv = toCsv(
    [
      'SKU',
      'Nama Barang',
      'Kategori',
      'Lokasi',
      'Stok',
      'Satuan',
      'Harga Modal',
      'Nilai Persediaan',
      'Status',
    ],
    report.products.map((product) => [
      product.sku,
      product.name,
      product.categoryName,
      product.location,
      product.balanceBase,
      product.baseUnit,
      product.costPrice,
      product.inventoryValue,
      product.stockStatus,
    ]),
  )
  return sendCsv(response, 'laporan-persediaan.csv', csv)
}

function sendCsv(response: Response, fileName: string, csv: string) {
  response.setHeader('Content-Type', 'text/csv; charset=utf-8')
  response.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
  return response.status(200).send(csv)
}
