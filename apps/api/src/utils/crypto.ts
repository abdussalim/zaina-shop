/**
 * Web Crypto API utilities for edge-compatible password hashing using PBKDF2.
 */

const DEFAULT_ITERATIONS = 100_000
const KEY_LENGTH_BYTES = 32 // 256 bits

function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function hexToBuffer(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
  }
  return bytes
}

export async function hashPassword(
  password: string,
  saltHex?: string,
  iterations: number = DEFAULT_ITERATIONS,
): Promise<string> {
  const encoder = new TextEncoder()
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  )

  const saltBytes = saltHex
    ? hexToBuffer(saltHex)
    : crypto.getRandomValues(new Uint8Array(16))
  const actualSaltHex = saltHex || bufferToHex(saltBytes.buffer as ArrayBuffer)

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes as ArrayBufferView,
      iterations,
      hash: 'SHA-256',
    },
    passwordKey,
    KEY_LENGTH_BYTES * 8,
  )

  const hashHex = bufferToHex(derivedBits)
  return `pbkdf2:${iterations}:${actualSaltHex}:${hashHex}`
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split(':')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') {
    return false
  }

  const iterations = parseInt(parts[1], 10)
  const saltHex = parts[2]
  const expectedHashHex = parts[3]

  if (isNaN(iterations) || !saltHex || !expectedHashHex) {
    return false
  }

  const computed = await hashPassword(password, saltHex, iterations)
  const computedHashHex = computed.split(':')[3]

  if (computedHashHex.length !== expectedHashHex.length) {
    return false
  }

  // Constant-time comparison
  let result = 0
  for (let i = 0; i < computedHashHex.length; i++) {
    result |= computedHashHex.charCodeAt(i) ^ expectedHashHex.charCodeAt(i)
  }
  return result === 0
}
