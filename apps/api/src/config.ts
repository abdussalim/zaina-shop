export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production'
  port: number
  appOrigin: string
  databaseUrl: string
  sessionSecret: string
  adminUsername: string
  adminPassword: string
  storeName: string
  storeTimezone: string
  seedDemoData: boolean
  isProduction: boolean
}

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    APP_ORIGIN: z.url(),
    DATABASE_URL: z.string().min(1),
    SESSION_SECRET: z.string().min(32),
    ADMIN_USERNAME: z.string().trim().min(1).max(80),
    ADMIN_PASSWORD: z.string().min(12).max(200),
    STORE_NAME: z.string().trim().min(2).max(160),
    STORE_TIMEZONE: z
      .enum(['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'])
      .default('Asia/Jakarta'),
    SEED_DEMO_DATA: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
  })
  .superRefine((environment, context) => {
    if (
      environment.NODE_ENV === 'production' &&
      new URL(environment.APP_ORIGIN).protocol !== 'https:'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['APP_ORIGIN'],
        message: 'APP_ORIGIN produksi harus memakai HTTPS',
      })
    }
  })

export function loadConfig(environment: NodeJS.ProcessEnv): AppConfig {
  const result = environmentSchema.safeParse(environment)
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join('.')).join(', ')
    throw new Error(`Konfigurasi environment tidak valid: ${fields}`)
  }

  const value = result.data
  return {
    nodeEnv: value.NODE_ENV,
    port: value.PORT,
    appOrigin: value.APP_ORIGIN.replace(/\/$/, ''),
    databaseUrl: value.DATABASE_URL,
    sessionSecret: value.SESSION_SECRET,
    adminUsername: value.ADMIN_USERNAME,
    adminPassword: value.ADMIN_PASSWORD,
    storeName: value.STORE_NAME,
    storeTimezone: value.STORE_TIMEZONE,
    seedDemoData: value.SEED_DEMO_DATA,
    isProduction: value.NODE_ENV === 'production',
  }
}
import { z } from 'zod'
