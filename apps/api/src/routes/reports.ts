import { Hono } from 'hono'
import type { Env } from '../env.js'
import { parseDateFilters } from '../http/date-range.js'
import { sendData } from '../http/respond.js'
import { requireAuth } from '../middleware/auth.js'
import { createD1Database } from '../db/d1.js'
import { findStoreTimezone } from '../modules/settings/settings.repository.js'
import { toCsv } from '../modules/reports/csv.js'
import {
  getDashboard,
  getInventoryReport,
  getSalesReport,
} from '../modules/reports/reports.repository.js'

export const reportsRoutes = new Hono<Env>()

reportsRoutes.use('*', requireAuth)

reportsRoutes.get('/dashboard', async (c) => {
  const db = createD1Database(c.env.DB)
  const tz = await findStoreTimezone(db, 'Asia/Jakarta')
  const dashboard = await getDashboard(db, tz)
  return sendData(c, dashboard)
})

reportsRoutes.get('/reports/sales', async (c) => {
  const db = createD1Database(c.env.DB)
  const queryParams = c.req.query()
  const filters = parseDateFilters(queryParams)
  const tz = await findStoreTimezone(db, 'Asia/Jakarta')
  const report = await getSalesReport(db, filters, tz)

  if (queryParams.format === 'csv') {
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
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="laporan-penjualan.csv"',
      },
    })
  }

  return sendData(c, report)
})

reportsRoutes.get('/reports/inventory', async (c) => {
  const db = createD1Database(c.env.DB)
  const queryParams = c.req.query()
  const report = await getInventoryReport(db)

  if (queryParams.format === 'csv') {
    const csv = toCsv(
      ['SKU', 'Nama Barang', 'Kategori', 'Stok', 'Satuan Dasar', 'Status'],
      report.products.map((p) => [
        p.sku,
        p.name,
        p.categoryName,
        p.balance,
        p.baseUnit,
        p.status,
      ]),
    )
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="laporan-stok.csv"',
      },
    })
  }

  return sendData(c, report)
})
