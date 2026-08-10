import { Pool, type PoolClient, type QueryResultRow } from 'pg'

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

export interface TransactionOptions {
  isolationLevel?: 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE'
}

export interface Database extends DatabaseClient {
  transaction<T>(
    work: (client: DatabaseClient) => Promise<T>,
    options?: TransactionOptions,
  ): Promise<T>
  close(): Promise<void>
}

type PgQueryable = Pick<Pool | PoolClient, 'query'>

function createClient(queryable: PgQueryable): DatabaseClient {
  return {
    async query<Row>(sql: string, values: readonly unknown[] = []) {
      const result = await queryable.query<Row & QueryResultRow>(sql, [...values])
      return { rows: result.rows, rowCount: result.rowCount ?? 0 }
    },
    async exec(sql: string) {
      await queryable.query(sql)
    },
  }
}

export function createPostgresDatabase(connectionString: string): Database {
  const pool = new Pool({ connectionString })
  const client = createClient(pool)

  return {
    ...client,
    async transaction<T>(
      work: (transaction: DatabaseClient) => Promise<T>,
      options: TransactionOptions = {},
    ) {
      const connection = await pool.connect()
      try {
        await connection.query('BEGIN')
        if (options.isolationLevel) {
          await connection.query(
            `SET TRANSACTION ISOLATION LEVEL ${options.isolationLevel}`,
          )
        }
        const result = await work(createClient(connection))
        await connection.query('COMMIT')
        return result
      } catch (error) {
        await connection.query('ROLLBACK')
        throw error
      } finally {
        connection.release()
      }
    },
    async close() {
      await pool.end()
    },
  }
}
