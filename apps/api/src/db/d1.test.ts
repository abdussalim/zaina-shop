import { describe, expect, it } from 'vitest'
import { convertPostgresSqlToD1 } from './d1.js'

describe('convertPostgresSqlToD1', () => {
  it('converts parameter placeholders', () => {
    const input = 'SELECT * FROM users WHERE id = $1 AND username = $2'
    const output = convertPostgresSqlToD1(input)
    expect(output).toBe('SELECT * FROM users WHERE id = ?1 AND username = ?2')
  })

  it('removes FOR UPDATE and FOR UPDATE OF', () => {
    const input1 = 'SELECT * FROM sales WHERE id = $1 FOR UPDATE'
    expect(convertPostgresSqlToD1(input1)).toBe(
      'SELECT * FROM sales WHERE id = ?1',
    )

    const input2 = 'SELECT * FROM products p JOIN balances b FOR UPDATE OF p, b'
    expect(convertPostgresSqlToD1(input2).trim()).toBe(
      'SELECT * FROM products p JOIN balances b',
    )
  })

  it('converts Postgres timestamp and date conversions to SQLite date functions', () => {
    const input1 =
      'WHERE (sold_at AT TIME ZONE $1)::date = (CURRENT_TIMESTAMP AT TIME ZONE $1)::date'
    const output1 = convertPostgresSqlToD1(input1)
    expect(output1).toContain('date(sold_at)')
    expect(output1).toContain("date('now')")

    const input2 = 'WHERE (s.sold_at AT TIME ZONE $1)::date >= $2::date'
    const output2 = convertPostgresSqlToD1(input2)
    expect(output2).toContain('date(s.sold_at)')
    expect(output2).toContain('?2')
  })

  it('converts boolean literals', () => {
    const input = 'WHERE is_active = TRUE AND is_default = FALSE'
    expect(convertPostgresSqlToD1(input)).toBe(
      'WHERE is_active = 1 AND is_default = 0',
    )
  })
})
