import argon2 from 'argon2'

import type { Database } from '../../db/database.js'
import { AppError } from '../../http/errors.js'
import {
  findActiveUserByUsername,
  findActiveUserPasswordChangedAt,
} from './auth.repository.js'

export interface PublicUser {
  id: string
  username: string
  displayName: string
}

export interface AuthService {
  authenticate(
    username: string,
    password: string,
  ): Promise<{ user: PublicUser; passwordChangedAt: string }>
  isSessionCurrent(userId: string, passwordChangedAt: string): Promise<boolean>
}

export function createAuthService(database: Database): AuthService {
  return {
    async authenticate(username: string, password: string) {
      const user = await findActiveUserByUsername(database, username)
      const passwordMatches = user
        ? await argon2.verify(user.password_hash, password)
        : false

      if (!user || !passwordMatches) {
        throw new AppError(
          401,
          'INVALID_CREDENTIALS',
          'Nama pengguna atau kata sandi salah',
        )
      }

      return {
        user: {
          id: user.id,
          username: user.username,
          displayName: user.display_name,
        },
        passwordChangedAt: new Date(user.password_changed_at).toISOString(),
      }
    },
    async isSessionCurrent(userId: string, passwordChangedAt: string) {
      const current = await findActiveUserPasswordChangedAt(database, userId)
      return (
        current !== undefined &&
        new Date(current).getTime() === new Date(passwordChangedAt).getTime()
      )
    },
  }
}
