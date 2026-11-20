import type { D1Database } from '@cloudflare/workers-types'

export interface DatabaseResult<Row> {
  rows: Row[]
  rowCount: number
}

export interface DatabaseClient {
  query<Row = Record<string, unknown>>(
    sql: string,
    values?: readonly unknown[],
  ): Promise<DatabaseResult<Row>>
  exec(sql: string): Promise<void>
}

export interface Database extends DatabaseClient {
  transaction<T>(
    work: (client: DatabaseClient) => Promise<T>,
  ): Promise<T>
  d1: D1Database
}

export function convertPostgresSqlToD1(sql: string): string {
  return sql
    // Remove FOR UPDATE clauses
    .replace(/\s+FOR UPDATE(\s+OF\s+[\w,\s]+)?/gi, '')
    // Convert (CURRENT_TIMESTAMP AT TIME ZONE ...)::date -> date('now')
    .replace(/\(CURRENT_TIMESTAMP\s+AT\s+TIME\s+ZONE\s+[^\)]+\)::date/gi, "date('now')")
    // Convert (col AT TIME ZONE ...)::date -> date(col)
    .replace(/\(([\w\.]+)\s+AT\s+TIME\s+ZONE\s+[^\)]+\)::date/gi, 'date($1)')
    // Strip ::date, ::uuid, ::text
    .replace(/::(date|uuid|text|jsonb?)/gi, '')
    // Convert boolean literals
    .replace(/\bTRUE\b/g, '1')
    .replace(/\bFALSE\b/g, '0')
    // Convert $1, $2 to ?1, ?2
    .replace(/\$(\d+)/g, '?$1')
}

export function createD1Database(d1: D1Database): Database {
  const client: DatabaseClient = {
    async query<Row = Record<string, unknown>>(
      sql: string,
      values: readonly unknown[] = [],
    ): Promise<DatabaseResult<Row>> {
      const convertedSql = convertPostgresSqlToD1(sql)
      const stmt = d1.prepare(convertedSql).bind(...values)
      const result = await stmt.all()

      const rows = (result.results ?? []) as Row[]
      const rowCount = result.meta?.changes ?? rows.length

      return {
        rows,
        rowCount,
      }
    },
    async exec(sql: string): Promise<void> {
      await d1.exec(sql)
    },
  }

  return {
    ...client,
    d1,
    async transaction<T>(work: (client: DatabaseClient) => Promise<T>): Promise<T> {
      return work(client)
    },
  }
}
