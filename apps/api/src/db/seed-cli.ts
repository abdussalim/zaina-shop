import { loadConfig } from '../config.js'
import { createDatabase } from './pool.js'
import { seedDatabase } from './seed.js'

const config = loadConfig(process.env)
const database = createDatabase(config)

try {
  await seedDatabase(database, {
    adminUsername: config.adminUsername,
    adminPassword: config.adminPassword,
    storeName: config.storeName,
    storeTimezone: config.storeTimezone,
    seedDemoData: config.seedDemoData,
  })
  console.info('Data awal database selesai dibuat.')
} finally {
  await database.close()
}
