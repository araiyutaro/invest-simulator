import 'server-only'
import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().url().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  SITE_PASSWORD: z.string().min(1),
  CRON_SECRET: z.string().min(1),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n')
  throw new Error(
    `[env] Missing or invalid environment variables:\n${issues}\n` +
      `See .env.example for the full list.`,
  )
}

export const env = parsed.data
export type Env = typeof env
