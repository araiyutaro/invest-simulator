/**
 * Tests for POST /api/cron/fetch-market-data route handler.
 *
 * server-only is mocked so tests can run outside Next.js build context.
 * env and orchestrator are mocked to isolate the route handler logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock server-only so the module can be imported in test environment
vi.mock('server-only', () => ({}))

vi.mock('@/lib/market/orchestrator', () => ({
  fetchMarketData: vi.fn(),
}))

// Stub env before importing the route — env.ts throws on missing vars
vi.mock('@/lib/env', () => ({
  env: {
    CRON_SECRET: 'test-secret',
    FINNHUB_API_KEY: 'test-key',
    DATABASE_URL: 'postgres://x',
    GEMINI_API_KEY: 'x',
    SESSION_SECRET: 'x'.repeat(40),
    SITE_PASSWORD: 'x',
  },
}))

import { POST, GET } from '@/app/api/cron/fetch-market-data/route'
import * as orchestrator from '@/lib/market/orchestrator'

function mkReq(headers: Record<string, string>): any {
  return {
    headers: {
      get: (k: string) => headers[k.toLowerCase()] ?? null,
    },
  }
}

describe('POST /api/cron/fetch-market-data', () => {
  beforeEach(() => vi.resetAllMocks())

  it('returns 401 without authorization header', async () => {
    const res = await POST(mkReq({}))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('unauthorized')
  })

  it('returns 401 with wrong secret', async () => {
    const res = await POST(mkReq({ authorization: 'Bearer wrong' }))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('unauthorized')
  })

  it('returns 200 with correct secret and FailureSummary body', async () => {
    const mockSummary = {
      ok: ['AAPL'],
      failed: [],
      marketClosed: [],
      durationMs: 123,
    }
    vi.mocked(orchestrator.fetchMarketData).mockResolvedValue(mockSummary)

    const res = await POST(mkReq({ authorization: 'Bearer test-secret' }))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.ok).toEqual(['AAPL'])
    expect(body.failed).toEqual([])
    expect(body.marketClosed).toEqual([])
    expect(typeof body.durationMs).toBe('number')
  })

  it('calls fetchMarketData with incremental mode', async () => {
    vi.mocked(orchestrator.fetchMarketData).mockResolvedValue({
      ok: [],
      failed: [],
      marketClosed: [],
      durationMs: 0,
    })

    await POST(mkReq({ authorization: 'Bearer test-secret' }))

    expect(orchestrator.fetchMarketData).toHaveBeenCalledWith({
      mode: 'incremental',
    })
  })

  it('returns 500 when orchestrator throws', async () => {
    vi.mocked(orchestrator.fetchMarketData).mockRejectedValue(
      new Error('boom'),
    )

    const res = await POST(mkReq({ authorization: 'Bearer test-secret' }))
    expect(res.status).toBe(500)

    const body = await res.json()
    expect(body.error).toBe('internal')
    expect(body.message).toBe('boom')
  })
})

describe('GET /api/cron/fetch-market-data', () => {
  it('returns 405 method not allowed', async () => {
    const res = await GET()
    expect(res.status).toBe(405)
    const body = await res.json()
    expect(body.error).toBe('method_not_allowed')
  })
})
