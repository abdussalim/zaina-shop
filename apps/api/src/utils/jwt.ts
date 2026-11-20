/**
 * Web Crypto API utilities for HMAC-SHA256 JWT session tokens.
 */

export interface SessionUser {
  id: string
  username: string
  displayName: string
}

export interface SessionPayload {
  user: SessionUser
  passwordChangedAt: string
  exp: number // unix epoch seconds
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function base64UrlDecode(str: string): Uint8Array {
  str = str.replace(/-/g, '+').replace(/_/g, '/')
  while (str.length % 4) {
    str += '='
  }
  const binary = atob(str)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

async function getCryptoKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

export async function signSessionToken(
  payload: Omit<SessionPayload, 'exp'> & { expiresInSeconds?: number },
  secret: string,
): Promise<string> {
  const encoder = new TextEncoder()
  const key = await getCryptoKey(secret)

  const expiresIn = payload.expiresInSeconds ?? 7 * 24 * 60 * 60 // 7 days
  const fullPayload: SessionPayload = {
    user: payload.user,
    passwordChangedAt: payload.passwordChangedAt,
    exp: Math.floor(Date.now() / 1000) + expiresIn,
  }

  const headerJson = JSON.stringify({ alg: 'HS256', typ: 'JWT' })
  const payloadJson = JSON.stringify(fullPayload)

  const headerB64 = base64UrlEncode(encoder.encode(headerJson))
  const payloadB64 = base64UrlEncode(encoder.encode(payloadJson))
  const unsignedToken = `${headerB64}.${payloadB64}`

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(unsignedToken),
  )
  const signatureB64 = base64UrlEncode(new Uint8Array(signature))

  return `${unsignedToken}.${signatureB64}`
}

export async function verifySessionToken(
  token: string,
  secret: string,
): Promise<SessionPayload | null> {
  const parts = token.split('.')
  if (parts.length !== 3) {
    return null
  }

  const [headerB64, payloadB64, signatureB64] = parts
  const unsignedToken = `${headerB64}.${payloadB64}`

  const encoder = new TextEncoder()
  const key = await getCryptoKey(secret)

  try {
    const signatureBytes = base64UrlDecode(signatureB64)
    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBytes as ArrayBufferView,
      encoder.encode(unsignedToken),
    )

    if (!isValid) {
      return null
    }

    const payloadBytes = base64UrlDecode(payloadB64)
    const decoder = new TextDecoder()
    const payload = JSON.parse(decoder.decode(payloadBytes)) as SessionPayload

    const now = Math.floor(Date.now() / 1000)
    if (payload.exp && payload.exp < now) {
      return null // Expired
    }

    return payload
  } catch {
    return null
  }
}
