import { z } from 'zod'

export interface DateFilters {
  from?: string
  to?: string
}

const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal harus memakai format YYYY-MM-DD')
  .refine(isCalendarDate, 'Tanggal kalender tidak valid')

const dateRangeSchema = z
  .object({
    from: calendarDateSchema.optional(),
    to: calendarDateSchema.optional(),
  })
  .refine((range) => !range.from || !range.to || range.from <= range.to, {
    path: ['to'],
    message: 'Tanggal akhir tidak boleh sebelum tanggal awal',
  })

export function parseDateFilters(query: Record<string, unknown>): DateFilters {
  const parsed = dateRangeSchema.parse(query)
  return {
    ...(parsed.from ? { from: parsed.from } : {}),
    ...(parsed.to ? { to: parsed.to } : {}),
  }
}

function isCalendarDate(value: string): boolean {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year!, month! - 1, day!))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month! - 1 &&
    date.getUTCDate() === day
  )
}
