import { loadConfig } from '../config.js'
import { runMigrations } from './migrate.js'
import { createDatabase } from './pool.js'

const config = loadConfig(process.env)
const database = createDatabase(config)

try {
  await runMigrations(database)
  console.info('Migrasi database selesai.')
} finally {
  await database.close()
}
