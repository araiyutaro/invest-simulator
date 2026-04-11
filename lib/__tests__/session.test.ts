/**
 * Tests for lib/session.ts
 *
 * Verifies iron-session v8 sessionOptions configuration and SessionData type contract.
 * server-only is mocked so tests can run outside Next.js build context.
 */

import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))

// env is mocked to avoid real env requirement in tests
vi.mock('../env', () => ({
  env: {
    SESSION_SECRET: 'a'.repeat(32),
    SITE_PASSWORD: 'test-password',
    DATABASE_URL: 'postgresql://test',
    ANTHROPIC_API_KEY: 'sk-ant-test',
    CRON_SECRET: 'cron-secret',
  },
}))

describe('lib/session.ts', () => {
  it('exports sessionOptions with correct cookieName', async () => {
    const { sessionOptions } = await import('../session')
    expect(sessionOptions.cookieName).toBe('invest-sim-session')
  })

  it('sessionOptions.password is set from env.SESSION_SECRET', async () => {
    const { sessionOptions } = await import('../session')
    expect(sessionOptions.password).toBe('a'.repeat(32))
  })

  it('sessionOptions.cookieOptions.httpOnly is true', async () => {
    const { sessionOptions } = await import('../session')
    expect(sessionOptions.cookieOptions.httpOnly).toBe(true)
  })

  it('sessionOptions.cookieOptions.maxAge is 60*60*24*30 (30 days)', async () => {
    const { sessionOptions } = await import('../session')
    expect(sessionOptions.cookieOptions.maxAge).toBe(60 * 60 * 24 * 30)
  })

  it('sessionOptions.cookieOptions.sameSite is "lax"', async () => {
    const { sessionOptions } = await import('../session')
    expect(sessionOptions.cookieOptions.sameSite).toBe('lax')
  })

  it('sessionOptions.cookieOptions.path is "/"', async () => {
    const { sessionOptions } = await import('../session')
    expect(sessionOptions.cookieOptions.path).toBe('/')
  })

  it('defaultSession.isAuthenticated is false', async () => {
    const { defaultSession } = await import('../session')
    expect(defaultSession.isAuthenticated).toBe(false)
  })

  it('exports SessionData type that includes isAuthenticated boolean', async () => {
    const { defaultSession } = await import('../session')
    // Runtime check: defaultSession satisfies the type
    expect(typeof defaultSession.isAuthenticated).toBe('boolean')
  })
})
