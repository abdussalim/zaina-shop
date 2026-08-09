import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import type { Database } from './database.js'

const defaultMigrationDirectory = fileURLToPath(
  new URL('./migrations', import.meta.url),
)

export async function runMigrations(
  database: Database,
  migrationDirectory = defaultMigrationDirectory,
): Promise<void> {
  await database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  const migrationFiles = (await readdir(migrationDirectory))
    .filter((fileName) => /^\d+.*\.sql$/.test(fileName))
    .filter((fileName) => !fileName.endsWith('.down.sql'))
    .sort()

  for (const fileName of migrationFiles) {
    const applied = await database.query(
      'SELECT 1 FROM schema_migrations WHERE version = $1',
      [fileName],
    )
    if (applied.rowCount) continue

    const sql = await readFile(`${migrationDirectory}/${fileName}`, 'utf8')
    await database.transaction(async (transaction) => {
      await transaction.exec(sql)
      await transaction.query(
        'INSERT INTO schema_migrations (version) VALUES ($1)',
        [fileName],
      )
    })
  }
}
