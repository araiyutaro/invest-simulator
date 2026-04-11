import { defineConfig } from 'drizzle-kit'

// Pitfall 3: use the DIRECT (non-pooled) Neon URL for migrations.
// Fallback to DATABASE_URL for local push where only one URL is configured.
const migrationUrl = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL

if (!migrationUrl) {
  throw new Error(
    'DATABASE_URL_DIRECT (preferred) or DATABASE_URL must be set for drizzle-kit.'
  )
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './db/schema.ts',
  out: './drizzle/migrations',
  dbCredentials: { url: migrationUrl },
  strict: true,
  verbose: true,
})
