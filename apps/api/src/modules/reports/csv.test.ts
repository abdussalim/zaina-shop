import { describe, expect, it } from 'vitest'

import { toCsv } from './csv.js'

describe('toCsv', () => {
  it('quotes commas, doubles quotes, and blocks spreadsheet formulas', () => {
    const csv = toCsv(
      ['Nama', 'Catatan'],
      [["=SUM(A1:A2)", 'Gelas, ukuran "besar"']],
    )

    expect(csv).toContain("'=SUM(A1:A2)")
    expect(csv).toContain('"Gelas, ukuran ""besar"""')
    expect(csv).toMatch(/\r\n$/)
  })
})
