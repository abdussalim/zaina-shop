import type { Database } from '../../db/database.js'
import type { StoreSettingsInput } from '@zaina/shared'

interface StoreSettingsRow {
  store_name: string
  address: string | null
  phone: string | null
  timezone: string
  default_minimum_stock: string | number
}

export async function findStoreSettings(database: Database) {
  const result = await database.query<StoreSettingsRow>(
    `SELECT store_name, address, phone, timezone, default_minimum_stock
     FROM store_settings WHERE id = 1`,
  )
  const row = result.rows[0]
  return row ? mapStoreSettings(row) : undefined
}

export async function updateStoreSettings(
  database: Database,
  input: StoreSettingsInput,
) {
  const result = await database.query<StoreSettingsRow>(
    `UPDATE store_settings SET store_name = $1, address = $2, phone = $3,
       timezone = $4, default_minimum_stock = $5,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = 1
     RETURNING store_name, address, phone, timezone, default_minimum_stock`,
    [
      input.storeName,
      input.address ?? null,
      input.phone ?? null,
      input.timezone,
      input.defaultMinimumStock,
    ],
  )
  return mapStoreSettings(result.rows[0]!)
}

export async function findPasswordHash(database: Database, userId: string) {
  const result = await database.query<{ password_hash: string }>(
    'SELECT password_hash FROM users WHERE id = $1 AND is_active = TRUE',
    [userId],
  )
  return result.rows[0]?.password_hash
}

export async function updatePasswordHash(
  database: Database,
  userId: string,
  passwordHash: string,
): Promise<void> {
  await database.query(
    `UPDATE users SET password_hash = $2,
       password_changed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [userId, passwordHash],
  )
}

function mapStoreSettings(row: StoreSettingsRow) {
  return {
    storeName: row.store_name,
    address: row.address,
    phone: row.phone,
    timezone: row.timezone,
    defaultMinimumStock: Number(row.default_minimum_stock),
  }
}
