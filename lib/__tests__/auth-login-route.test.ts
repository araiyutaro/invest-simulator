/**
 * Tests for app/api/auth/login/route.ts
 *
 * These tests mock iron-session and next/headers to verify:
 * - 401 + "パスワードが違います" on wrong password
 * - 200 + session.save() on correct password
 * - Handles malformed JSON gracefully
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('../env', () => ({
  env: {
    SESSION_SECRET: 'a'.repeat(32),
    SITE_PASSWORD: 'correct-password',
    DATABASE_URL: 'postgresql://test',
    ANTHROPIC_API_KEY: 'sk-ant-test',
    CRON_SECRET: 'cron-secret',
  },
}))

// Mock iron-session
const mockSave = vi.fn()
const mockSession = { isAuthenticated: false, save: mockSave }
vi.mock('iron-session', () => ({
  getIronSession: vi.fn().mockResolvedValue(mockSession),
}))

// Mock next/headers
const mockCookiesValue = { get: vi.fn(), set: vi.fn() }
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue(mockCookiesValue),
}))

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSave.mockClear()
    mockSession.isAuthenticated = false
  })

  it('returns 401 with "パスワードが違います" when password is wrong', async () => {
    const { POST } = await import('../../app/api/auth/login/route')
    const request = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'wrong-password' }),
    })
    const response = await POST(request)
    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.error).toBe('パスワードが違います')
  })

  it('returns 200 and saves session when password is correct', async () => {
    const { POST } = await import('../../app/api/auth/login/route')
    const request = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'correct-password' }),
    })
    const response = await POST(request)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.success).toBe(true)
  })

  it('returns 400 when request body is not valid JSON', async () => {
    const { POST } = await import('../../app/api/auth/login/route')
    const request = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    })
    const response = await POST(request)
    expect(response.status).toBe(400)
  })

  it('returns 401 when password field is missing', async () => {
    const { POST } = await import('../../app/api/auth/login/route')
    const request = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const response = await POST(request)
    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.error).toBe('パスワードが違います')
  })
})
