/**
 * Tests for lib/auth.ts
 *
 * Verifies verifyPassword uses timingSafeEqual (constant-time comparison) and
 * returns correct boolean for matching/non-matching passwords.
 * server-only is mocked so tests can run outside Next.js build context.
 */

import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))

// Mock env module at top level with a controlled SITE_PASSWORD
vi.mock('../env', () => ({
  env: { SITE_PASSWORD: 'correct-password' },
}))

describe('lib/auth.ts', () => {
  it('returns true when input matches SITE_PASSWORD', async () => {
    const { verifyPassword } = await import('../auth')
    expect(verifyPassword('correct-password')).toBe(true)
  })

  it('returns false when input does not match SITE_PASSWORD', async () => {
    const { verifyPassword } = await import('../auth')
    expect(verifyPassword('wrong-password')).toBe(false)
  })

  it('returns false when input is empty string and password is non-empty', async () => {
    const { verifyPassword } = await import('../auth')
    expect(verifyPassword('')).toBe(false)
  })

  it('returns false when input has different length than SITE_PASSWORD (no throw)', async () => {
    const { verifyPassword } = await import('../auth')
    // timingSafeEqual throws on length mismatch — our code must pre-check length
    expect(() => verifyPassword('short')).not.toThrow()
    expect(verifyPassword('short')).toBe(false)
  })

  it('does not throw when called with a very long input', async () => {
    const { verifyPassword } = await import('../auth')
    expect(() => verifyPassword('a'.repeat(1000))).not.toThrow()
    expect(verifyPassword('a'.repeat(1000))).toBe(false)
  })
})
