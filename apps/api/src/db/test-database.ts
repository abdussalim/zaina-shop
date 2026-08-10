import { PGlite } from '@electric-sql/pglite'

import type { Database, DatabaseClient, TransactionOptions } from './database.js'

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
    async transaction<T>(
      work: (transaction: DatabaseClient) => Promise<T>,
      options: TransactionOptions = {},
    ) {
      return pglite.transaction(async (transaction) => {
        const client = createClient(transaction)
        if (options.isolationLevel) {
          await client.exec(
            `SET TRANSACTION ISOLATION LEVEL ${options.isolationLevel}`,
          )
        }
        return work(client)
      })
    },
    async close() {
      await pglite.close()
    },
  }
}
