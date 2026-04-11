import 'server-only'
// SEC-03 (T-01-01): this module MUST never be imported from client bundles.
// `server-only` makes Next.js fail the build if a Client Component reaches it.

import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'

import * as schema from './schema'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Configure it in .env.local (D-20).')
}

const sql = neon(process.env.DATABASE_URL)

export const db = drizzle({ client: sql, schema })
export { schema }
