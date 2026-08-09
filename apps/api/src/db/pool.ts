import type { AppConfig } from '../config.js'
import { createPostgresDatabase } from './database.js'

export function createDatabase(config: Pick<AppConfig, 'databaseUrl'>) {
  return createPostgresDatabase(config.databaseUrl)
}
