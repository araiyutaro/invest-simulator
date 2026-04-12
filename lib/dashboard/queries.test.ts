/**
 * Tests for lib/dashboard/queries.ts (parseTimelineFromDecision only).
 *
 * DB-dependent query functions are covered by integration tests (future);
 * here we only exercise the pure transcript-parsing helper that feeds the
 * timeline view.
 */

import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))

// The module imports `@/db` which transitively loads server-only Drizzle
// code. Mock it so the test environment doesn't need a DATABASE_URL.
vi.mock('@/db', () => ({ db: {} }))

import { parseTimelineFromDecision } from '@/lib/dashboard/queries'

describe('parseTimelineFromDecision', () => {
  it('extracts BUY/SELL trades and skips HOLD (D-12)', () => {
    const transcript = {
      market_assessment: '市場は底堅い推移',
      decisions: [
        {
          ticker: 'AAPL',
          action: 'BUY',
          quantity: 10,
          confidence: 'high',
          reasoning: '決算が強い',
        },
        {
          ticker: 'MSFT',
          action: 'HOLD',
          quantity: 0,
          confidence: 'medium',
          reasoning: '様子見',
        },
        {
          ticker: 'NVDA',
          action: 'SELL',
          quantity: 5,
          confidence: 'low',
          reasoning: '過熱感',
        },
      ],
    }

    const result = parseTimelineFromDecision(transcript)

    expect(result.marketAssessment).toBe('市場は底堅い推移')
    expect(result.trades).toHaveLength(2)
    expect(result.trades.map((t) => t.ticker)).toEqual(['AAPL', 'NVDA'])
    expect(result.trades[0].action).toBe('BUY')
    expect(result.trades[0].confidence).toBe('high')
    expect(result.trades[0].reasoning).toBe('決算が強い')
    expect(result.trades[1].action).toBe('SELL')
    expect(result.trades[1].confidence).toBe('low')
  })

  it('returns empty trades when all decisions are HOLD (no trading day)', () => {
    const transcript = {
      market_assessment: '観望日',
      decisions: [
        {
          ticker: 'AAPL',
          action: 'HOLD',
          quantity: 0,
          confidence: 'medium',
          reasoning: '動きなし',
        },
      ],
    }

    const result = parseTimelineFromDecision(transcript)
    expect(result.marketAssessment).toBe('観望日')
    expect(result.trades).toEqual([])
  })

  it('safely falls back when transcript.decisions is not an array', () => {
    const result = parseTimelineFromDecision({
      market_assessment: 'broken',
      decisions: 'not-an-array',
    })
    expect(result.marketAssessment).toBe('broken')
    expect(result.trades).toEqual([])
  })

  it('safely falls back when transcript is null/invalid', () => {
    expect(parseTimelineFromDecision(null)).toEqual({
      marketAssessment: '',
      trades: [],
    })
    expect(parseTimelineFromDecision(undefined)).toEqual({
      marketAssessment: '',
      trades: [],
    })
    expect(parseTimelineFromDecision(42)).toEqual({
      marketAssessment: '',
      trades: [],
    })
  })
})
