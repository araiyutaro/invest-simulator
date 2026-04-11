/**
 * Tests for lib/env.ts
 *
 * server-only is mocked so tests can run outside Next.js build context.
 * Each test restores process.env after mutation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock server-only so the module can be imported in test environment
vi.mock('server-only', () => ({}))

const VALID_ENV = {
  DATABASE_URL: 'postgresql://user:pass@host/db',
  GEMINI_API_KEY: 'gemini-test-key-value',
  SESSION_SECRET: 'a'.repeat(32), // exactly 32 chars — minimum allowed
  SITE_PASSWORD: 'hunter2',
  CRON_SECRET: 'cron-secret-value',
}

describe('lib/env.ts', () => {
  let savedEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    savedEnv = { ...process.env }
    // Clear all env keys under test
    for (const key of Object.keys(VALID_ENV)) {
      delete process.env[key]
    }
    // Reset module registry so each test re-evaluates module-level code
    vi.resetModules()
  })

  afterEach(() => {
    // Restore original env
    for (const key of Object.keys(VALID_ENV)) {
      delete process.env[key]
    }
    Object.assign(process.env, savedEnv)
    vi.resetModules()
  })

  it('exports env object with all 5 keys when env vars are valid', async () => {
    Object.assign(process.env, VALID_ENV)
    const { env } = await import('../env')
    expect(env.DATABASE_URL).toBe(VALID_ENV.DATABASE_URL)
    expect(env.GEMINI_API_KEY).toBe(VALID_ENV.GEMINI_API_KEY)
    expect(env.SESSION_SECRET).toBe(VALID_ENV.SESSION_SECRET)
    expect(env.SITE_PASSWORD).toBe(VALID_ENV.SITE_PASSWORD)
    expect(env.CRON_SECRET).toBe(VALID_ENV.CRON_SECRET)
  })

  it('throws when DATABASE_URL is missing', async () => {
    Object.assign(process.env, { ...VALID_ENV, DATABASE_URL: undefined })
    delete process.env.DATABASE_URL
    await expect(import('../env')).rejects.toThrow(/DATABASE_URL/)
  })

  it('throws when GEMINI_API_KEY is missing', async () => {
    Object.assign(process.env, VALID_ENV)
    delete process.env.GEMINI_API_KEY
    await expect(import('../env')).rejects.toThrow(/GEMINI_API_KEY/)
  })

  it('throws when SESSION_SECRET is missing', async () => {
    Object.assign(process.env, VALID_ENV)
    delete process.env.SESSION_SECRET
    await expect(import('../env')).rejects.toThrow(/SESSION_SECRET/)
  })

  it('throws when SITE_PASSWORD is missing', async () => {
    Object.assign(process.env, VALID_ENV)
    delete process.env.SITE_PASSWORD
    await expect(import('../env')).rejects.toThrow(/SITE_PASSWORD/)
  })

  it('throws when CRON_SECRET is missing', async () => {
    Object.assign(process.env, VALID_ENV)
    delete process.env.CRON_SECRET
    await expect(import('../env')).rejects.toThrow(/CRON_SECRET/)
  })

  it('throws when SESSION_SECRET is shorter than 32 characters', async () => {
    Object.assign(process.env, { ...VALID_ENV, SESSION_SECRET: 'short' })
    await expect(import('../env')).rejects.toThrow(/SESSION_SECRET.*32|32.*SESSION_SECRET/i)
  })

  it('accepts SESSION_SECRET of exactly 32 characters', async () => {
    Object.assign(process.env, { ...VALID_ENV, SESSION_SECRET: 'a'.repeat(32) })
    const { env } = await import('../env')
    expect(env.SESSION_SECRET).toHaveLength(32)
  })

  it('accepts SESSION_SECRET longer than 32 characters', async () => {
    Object.assign(process.env, { ...VALID_ENV, SESSION_SECRET: 'a'.repeat(64) })
    const { env } = await import('../env')
    expect(env.SESSION_SECRET).toHaveLength(64)
  })

  it('error message references .env.example', async () => {
    Object.assign(process.env, VALID_ENV)
    delete process.env.DATABASE_URL
    await expect(import('../env')).rejects.toThrow(/.env.example/)
  })
})
