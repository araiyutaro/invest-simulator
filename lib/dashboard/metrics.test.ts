/**
 * Tests for lib/dashboard/metrics.ts
 *
 * server-only is mocked so tests can run outside Next.js build context.
 */

import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  normalizeToPercent,
  calculateMetrics,
  calculateWinRate,
  calculateSpyDiff,
} from '@/lib/dashboard/metrics'

// ---------------------------------------------------------------------------
// normalizeToPercent
// ---------------------------------------------------------------------------

describe('normalizeToPercent', () => {
  it('returns empty array when input is empty', () => {
    expect(normalizeToPercent([])).toEqual([])
  })

  it('normalizes a series to percent-change from day 0', () => {
    const result = normalizeToPercent([
      { date: '2025-01-01', value: 100 },
      { date: '2025-01-02', value: 110 },
    ])
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ time: '2025-01-01', value: 0 })
    expect(result[1].time).toBe('2025-01-02')
    expect(result[1].value).toBeCloseTo(10, 6)
  })

  it('returns all-zero series when base value is 0', () => {
    const result = normalizeToPercent([
      { date: '2025-01-01', value: 0 },
      { date: '2025-01-02', value: 50 },
      { date: '2025-01-03', value: 100 },
    ])
    expect(result).toEqual([
      { time: '2025-01-01', value: 0 },
      { time: '2025-01-02', value: 0 },
      { time: '2025-01-03', value: 0 },
    ])
  })
})

// ---------------------------------------------------------------------------
// calculateMetrics
// ---------------------------------------------------------------------------

describe('calculateMetrics', () => {
  it('returns null when fewer than 2 snapshots', () => {
    const metrics = calculateMetrics({
      snapshots: [{ totalValueJpy: '10000000', snapshotDate: '2025-01-01' }],
      spySnapshots: [],
      trades: [],
      positionAvgCosts: {},
    })
    expect(metrics).toBeNull()
  })

  it('calculates totalReturn and maxDrawdown for a simple series', () => {
    const metrics = calculateMetrics({
      snapshots: [
        { totalValueJpy: '100', snapshotDate: '2025-01-01' },
        { totalValueJpy: '110', snapshotDate: '2025-01-02' },
        { totalValueJpy: '105', snapshotDate: '2025-01-03' },
        { totalValueJpy: '120', snapshotDate: '2025-01-04' },
      ],
      spySnapshots: [],
      trades: [],
      positionAvgCosts: {},
    })
    expect(metrics).not.toBeNull()
    expect(metrics!.totalReturn).toBeCloseTo(20, 6)
    // Peak 110 -> trough 105 => drawdown ≈ 4.5454...%
    expect(metrics!.maxDrawdown).toBeCloseTo(4.5454545, 4)
    expect(metrics!.tradeCount).toBe(0)
    expect(metrics!.winRate).toBeNull()
  })

  it('returns sharpe=0 when the daily return series has zero stddev', () => {
    const metrics = calculateMetrics({
      snapshots: [
        { totalValueJpy: '100', snapshotDate: '2025-01-01' },
        { totalValueJpy: '100', snapshotDate: '2025-01-02' },
        { totalValueJpy: '100', snapshotDate: '2025-01-03' },
      ],
      spySnapshots: [],
      trades: [],
      positionAvgCosts: {},
    })
    expect(metrics).not.toBeNull()
    expect(metrics!.sharpe).toBe(0)
    expect(metrics!.totalReturn).toBe(0)
    expect(metrics!.maxDrawdown).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// calculateWinRate
// ---------------------------------------------------------------------------

describe('calculateWinRate', () => {
  it('returns 100 when the only SELL trade is profitable', () => {
    const winRate = calculateWinRate(
      [
        {
          action: 'SELL',
          executedPrice: '150',
          quantity: 10,
          symbol: 'AAPL',
        },
      ],
      { AAPL: 100 }
    )
    expect(winRate).toBe(100)
  })

  it('returns 0 when the only SELL trade is a loss', () => {
    const winRate = calculateWinRate(
      [
        {
          action: 'SELL',
          executedPrice: '80',
          quantity: 5,
          symbol: 'MSFT',
        },
      ],
      { MSFT: 100 }
    )
    expect(winRate).toBe(0)
  })

  it('returns null when there are no SELL trades', () => {
    const winRate = calculateWinRate(
      [
        {
          action: 'BUY',
          executedPrice: '100',
          quantity: 10,
          symbol: 'AAPL',
        },
      ],
      { AAPL: 100 }
    )
    expect(winRate).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// calculateSpyDiff
// ---------------------------------------------------------------------------

describe('calculateSpyDiff', () => {
  it('returns portfolioReturn - spyReturn', () => {
    expect(calculateSpyDiff(10, 8)).toBeCloseTo(2, 6)
    expect(calculateSpyDiff(-5, 3)).toBeCloseTo(-8, 6)
  })
})
