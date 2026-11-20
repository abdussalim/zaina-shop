import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from './crypto.js'
import { signSessionToken, verifySessionToken } from './jwt.js'

describe('Web Crypto Password Hashing', () => {
  it('hashes and successfully verifies a password', async () => {
    const password = 'mySecretPassword123'
    const hash = await hashPassword(password)

    expect(hash.startsWith('pbkdf2:100000:')).toBe(true)

    const isValid = await verifyPassword(password, hash)
    expect(isValid).toBe(true)

    const isInvalid = await verifyPassword('wrongPassword', hash)
    expect(isInvalid).toBe(false)
  })

  it('generates different hashes for the same password due to random salt', async () => {
    const password = 'identicalPassword'
    const hash1 = await hashPassword(password)
    const hash2 = await hashPassword(password)

    expect(hash1).not.toBe(hash2)
    expect(await verifyPassword(password, hash1)).toBe(true)
    expect(await verifyPassword(password, hash2)).toBe(true)
  })
})

describe('Web Crypto HMAC-SHA256 JWT', () => {
  const secret = 'super-secret-key-32-chars-long-xxx'

  it('signs and verifies a session token', async () => {
    const payload = {
      user: {
        id: '123e4567-e89b-12d3-a456-426614174000',
        username: 'toko',
        displayName: 'Pengelola Toko',
      },
      passwordChangedAt: '2026-11-20T00:00:00.000Z',
    }

    const token = await signSessionToken(payload, secret)
    expect(typeof token).toBe('string')
    expect(token.split('.')).toHaveLength(3)

    const verified = await verifySessionToken(token, secret)
    expect(verified).not.toBeNull()
    expect(verified?.user.username).toBe('toko')
    expect(verified?.passwordChangedAt).toBe(payload.passwordChangedAt)
  })

  it('rejects an invalid token or wrong secret', async () => {
    const token = await signSessionToken(
      {
        user: { id: 'u1', username: 'test', displayName: 'Test' },
        passwordChangedAt: '2026-11-20T00:00:00.000Z',
      },
      secret,
    )

    const wrongVerified = await verifySessionToken(token, 'wrong-secret-key')
    expect(wrongVerified).toBeNull()

    const corruptedToken = token.slice(0, -4) + 'abcd'
    expect(await verifySessionToken(corruptedToken, secret)).toBeNull()
  })
})
