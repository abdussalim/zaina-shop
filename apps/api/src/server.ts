import connectPgSimple from 'connect-pg-simple'
import session from 'express-session'

import { createApp } from './app.js'
import { loadConfig } from './config.js'
import { runMigrations } from './db/migrate.js'
import { createDatabase } from './db/pool.js'
import { seedDatabase } from './db/seed.js'

const config = loadConfig(process.env)
const database = createDatabase(config)
const PgSessionStore = connectPgSimple(session)
const sessionStore = new PgSessionStore({
  conString: config.databaseUrl,
  tableName: 'session',
  createTableIfMissing: false,
})

await runMigrations(database)
await seedDatabase(database, {
  adminUsername: config.adminUsername,
  adminPassword: config.adminPassword,
  storeName: config.storeName,
  storeTimezone: config.storeTimezone,
  seedDemoData: config.seedDemoData,
})

const app = createApp({ config, database, sessionStore })
const server = app.listen(config.port, '0.0.0.0', () => {
  console.info(`Toko Zaina API berjalan pada port ${config.port}`)
})

async function shutdown(signal: string) {
  console.info(`Menerima ${signal}, menghentikan server...`)
  server.close(async () => {
    await database.close()
    process.exit(0)
  })
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
