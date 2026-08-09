import { PGlite } from '@electric-sql/pglite'

import type { Database, DatabaseClient } from './database.js'

type PGliteConnection = Pick<PGlite, 'exec' | 'query'>

function createClient(connection: PGliteConnection): DatabaseClient {
  return {
    async query<Row>(sql: string, values: readonly unknown[] = []) {
      const result = await connection.query<Row>(sql, [...values])
      return {
        rows: result.rows,
        rowCount:
          result.rows.length > 0 ? result.rows.length : (result.affectedRows ?? 0),
      }
    },
    async exec(sql: string) {
      await connection.exec(sql)
    },
  }
}

export async function createTestDatabase(): Promise<Database> {
  const pglite = await PGlite.create()
  const client = createClient(pglite)

  return {
    ...client,
    async transaction<T>(work: (transaction: DatabaseClient) => Promise<T>) {
      return pglite.transaction(async (transaction) =>
        work(createClient(transaction)),
      )
    },
    async close() {
      await pglite.close()
    },
  }
}
