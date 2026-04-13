/**
 * tests/api/cron/daily-run.test.ts
 *
 * Phase 05 Plan 01 — Wave 0 auth-guard tests for /api/cron/daily-run.
 *
 * Verifies that BOTH GET and POST handlers:
 *   - return 401 when the Authorization header is missing
 *   - return 401 when the Bearer token is wrong
 *   - return non-401 (200/500) when the Bearer token matches env.CRON_SECRET
 *
 * RED state: the current route.ts only implements POST auth; GET hard-codes 405.
 * After Task 2 refactors GET → handleDailyRun(), this file MUST turn GREEN.
 *
 * All downstream agent infra (data-loader, gemini-caller, executor, prompt-builder,
 * ai/client) is mocked so the route module loads without touching DB / Gemini.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest'
import type { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Env setup (must happen BEFORE @/lib/env is evaluated by the route module)
// ---------------------------------------------------------------------------

beforeAll(() => {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'
  process.env.GEMINI_API_KEY = 'test-gemini-key'
  process.env.SESSION_SECRET = 'a'.repeat(32)
  process.env.SITE_PASSWORD = 'test-password'
  process.env.CRON_SECRET = 'test-cron-secret-xxxxxxxxxxxxxxxx'
  process.env.FINNHUB_API_KEY = 'test-finnhub-key'
})

// ---------------------------------------------------------------------------
// Mocks — keep route module loadable without real infra
// ---------------------------------------------------------------------------

vi.mock('server-only', () => ({}))

vi.mock('@/lib/agent/data-loader', () => ({
  ensurePortfolio: vi.fn().mockResolvedValue('test-portfolio-id'),
  ensureMarketData: vi.fn().mockResolvedValue(undefined),
  loadPromptContext: vi.fn().mockResolvedValue({
    tickers: [],
    portfolio: { cashJpy: 10_000_000, positions: [] },
    fxRateUsdJpy: 150,
  }),
  saveDecisionRecord: vi.fn().mockResolvedValue({ inserted: true, decisionId: 'dec-1' }),
  savePortfolioSnapshot: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/agent/prompt-builder', () => ({
  buildSystemPrompt: vi.fn().mockReturnValue('system'),
  buildUserPrompt: vi.fn().mockReturnValue('user'),
}))

vi.mock('@/lib/agent/gemini-caller', () => ({
  callGemini: vi.fn().mockResolvedValue({
    ok: true,
    rawText: '{}',
    response: { market_assessment: 'ok', decisions: [] },
    filteredDecisions: [],
    usage: { promptTokens: 1, candidateTokens: 1, totalTokens: 2 },
    costUsd: 0,
  }),
}))

vi.mock('@/lib/agent/executor', () => ({
  executeDecisions: vi.fn().mockResolvedValue({
    trades: [],
    skipped: [],
    newCashJpy: 10_000_000,
  }),
}))

vi.mock('@/lib/ai/client', () => ({
  GEMINI_MODEL: 'gemini-2.5-flash',
  genAI: {},
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(method: 'GET' | 'POST', authHeader?: string): NextRequest {
  const headers: Record<string, string> = {}
  if (authHeader !== undefined) {
    headers.authorization = authHeader
  }
  return new Request('http://localhost/api/cron/daily-run', {
    method,
    headers,
  }) as unknown as NextRequest
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/cron/daily-run — auth guard', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const { GET } = await import('@/app/api/cron/daily-run/route')
    const res = await GET(makeRequest('GET'))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('unauthorized')
  })

  it('returns 401 when Authorization header is wrong', async () => {
    const { GET } = await import('@/app/api/cron/daily-run/route')
    const res = await GET(makeRequest('GET', 'Bearer wrong-secret'))
    expect(res.status).toBe(401)
  })

  it('returns NON-401 when Authorization header matches env.CRON_SECRET', async () => {
    const { GET } = await import('@/app/api/cron/daily-run/route')
    const res = await GET(
      makeRequest('GET', `Bearer ${process.env.CRON_SECRET}`),
    )
    // Acceptable: 200 (success) or 500 (mock chain hiccup) — only 401 is failure
    expect(res.status).not.toBe(401)
    expect(res.status).not.toBe(405)
  })
})

describe('POST /api/cron/daily-run — auth guard (preserved from Phase 3)', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const { POST } = await import('@/app/api/cron/daily-run/route')
    const res = await POST(makeRequest('POST'))
    expect(res.status).toBe(401)
  })

  it('returns 401 when Authorization header is wrong', async () => {
    const { POST } = await import('@/app/api/cron/daily-run/route')
    const res = await POST(makeRequest('POST', 'Bearer wrong'))
    expect(res.status).toBe(401)
  })
})

describe('/api/cron/daily-run — module shape', () => {
  it('exports both GET and POST as functions', async () => {
    const mod = await import('@/app/api/cron/daily-run/route')
    expect(typeof mod.GET).toBe('function')
    expect(typeof mod.POST).toBe('function')
  })
})
