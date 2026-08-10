import argon2 from 'argon2'
import type { PasswordChangeInput, StoreSettingsInput } from '@zaina/shared'

import type { Database } from '../../db/database.js'
import { AppError } from '../../http/errors.js'
import {
  findPasswordHash,
  findStoreSettings,
  updatePasswordHash,
  updateStoreSettings,
} from './settings.repository.js'

export function createSettingsService(database: Database) {
  return {
    async getStore() {
      const settings = await findStoreSettings(database)
      if (!settings) {
        throw new AppError(404, 'STORE_SETTINGS_NOT_FOUND', 'Pengaturan toko tidak ditemukan')
      }
      return settings
    },
    updateStore(input: StoreSettingsInput) {
      return updateStoreSettings(database, input)
    },
    async changePassword(userId: string, input: PasswordChangeInput) {
      const passwordHash = await findPasswordHash(database, userId)
      const matches = passwordHash
        ? await argon2.verify(passwordHash, input.currentPassword)
        : false
      if (!matches) {
        throw new AppError(
          401,
          'INVALID_CURRENT_PASSWORD',
          'Kata sandi saat ini tidak sesuai',
        )
      }
      const newHash = await argon2.hash(input.newPassword, { type: argon2.argon2id })
      await updatePasswordHash(database, userId, newHash)
    },
  }
}
