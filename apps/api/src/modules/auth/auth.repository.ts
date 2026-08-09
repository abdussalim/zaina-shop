import type { Database } from '../../db/database.js'
import type { UserRow } from '../../db/types.js'

export async function findActiveUserByUsername(
  database: Database,
  username: string,
): Promise<UserRow | undefined> {
  const result = await database.query<UserRow>(
    `SELECT id, username, display_name, password_hash, is_active, password_changed_at
     FROM users
     WHERE LOWER(username) = LOWER($1) AND is_active = TRUE`,
    [username],
  )
  return result.rows[0]
}
