import { describe, expect, it } from 'vitest'

import { loadConfig } from './config.js'

const validEnvironment = {
  NODE_ENV: 'test',
  PORT: '3000',
  APP_ORIGIN: 'http://localhost:8080',
  DATABASE_URL: 'postgresql://zaina:secret@localhost:5432/zaina',
  SESSION_SECRET: '12345678901234567890123456789012',
  ADMIN_USERNAME: 'toko',
  ADMIN_PASSWORD: 'rahasia-yang-kuat',
  STORE_NAME: 'Toko Zaina',
  STORE_TIMEZONE: 'Asia/Jakarta',
  SEED_DEMO_DATA: 'true',
}

describe('loadConfig', () => {
  it('normalizes environment variables into typed configuration', () => {
    const config = loadConfig(validEnvironment)

    expect(config.port).toBe(3000)
    expect(config.seedDemoData).toBe(true)
    expect(config.isProduction).toBe(false)
  })

  it('rejects a weak session secret', () => {
    expect(() =>
      loadConfig({ ...validEnvironment, SESSION_SECRET: 'too-short' }),
    ).toThrow('Konfigurasi environment tidak valid')
  })

  it('requires an HTTPS public origin in production', () => {
    expect(() =>
      loadConfig({ ...validEnvironment, NODE_ENV: 'production' }),
    ).toThrow('Konfigurasi environment tidak valid')
  })

  it('rejects unsupported store timezones', () => {
    expect(() =>
      loadConfig({ ...validEnvironment, STORE_TIMEZONE: 'Etc/Unknown' }),
    ).toThrow('Konfigurasi environment tidak valid')
  })
})
