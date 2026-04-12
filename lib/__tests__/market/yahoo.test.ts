import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock server-only to avoid error in test environment
vi.mock('server-only', () => ({}))

// We need to dynamically import after mocking
const { fetchOhlcvYahoo, fetchFxUsdJpy, _yahooClient } = await import(
  '@/lib/market/yahoo'
)

import { WhitelistViolationError, YahooError } from '@/lib/market/errors'
import fixtureAapl from '@/lib/__tests__/fixtures/market/yahoo-chart-aapl.json'
import fixtureToyota from '@/lib/__tests__/fixtures/market/yahoo-chart-7203-T.json'

describe('fetchOhlcvYahoo (DATA-01, DATA-02)', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns OhlcvRow[] for AAPL from fixture', async () => {
    vi.spyOn(_yahooClient as any, 'chart').mockResolvedValue(fixtureAapl)
    const rows = await fetchOhlcvYahoo('AAPL', '2020-08-20', '2020-09-10')
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0].source).toBe('yahoo')
    expect(rows[0].currency).toBe('USD')
    expect(rows[0].assetClass).toBe('equity')
    expect(rows[0].priceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('returns OhlcvRow[] for 7203.T from fixture', async () => {
    vi.spyOn(_yahooClient as any, 'chart').mockResolvedValue(fixtureToyota)
    const rows = await fetchOhlcvYahoo('7203.T', '2026-01-01', '2026-04-10')
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0].currency).toBe('JPY')
  })

  it('maps rawClose = quote.close and close = quote.adjclose per D-08 Option A', async () => {
    vi.spyOn(_yahooClient as any, 'chart').mockResolvedValue(fixtureAapl)
    const rows = await fetchOhlcvYahoo('AAPL', '2020-08-20', '2020-09-10')
    // AAPL fixture row 0: close=115.5625, adjclose=112.19586181640625
    // They differ, so rawClose != close
    const row = rows[0]
    expect(row.rawClose).toBe(String(fixtureAapl.quotes[0].close))
    expect(row.close).toBe(String(fixtureAapl.quotes[0].adjclose))
    expect(row.rawClose).not.toBe(row.close)
  })

  it('throws WhitelistViolationError BEFORE calling yahoo', async () => {
    const spy = vi
      .spyOn(_yahooClient as any, 'chart')
      .mockResolvedValue({ quotes: [] })
    await expect(
      fetchOhlcvYahoo('XYZ', '2026-01-01', '2026-01-10')
    ).rejects.toBeInstanceOf(WhitelistViolationError)
    expect(spy).not.toHaveBeenCalled()
  })

  it('throws YahooError on empty response', async () => {
    vi.spyOn(_yahooClient as any, 'chart').mockResolvedValue({ quotes: [] })
    await expect(
      fetchOhlcvYahoo('AAPL', '2026-01-01', '2026-01-10')
    ).rejects.toThrow(YahooError)
  })

  it('wraps underlying network error in YahooError', async () => {
    vi.spyOn(_yahooClient as any, 'chart').mockRejectedValue(
      new Error('ENOTFOUND')
    )
    await expect(
      fetchOhlcvYahoo('AAPL', '2026-01-01', '2026-01-10')
    ).rejects.toThrow(YahooError)
  })
})

describe('fetchFxUsdJpy (D-10, D-25)', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns rows with symbol=JPYUSD assetClass=fx', async () => {
    vi.spyOn(_yahooClient as any, 'chart').mockResolvedValue({
      quotes: [
        {
          date: '2026-04-10T00:00:00.000Z',
          open: 150,
          high: 151,
          low: 149,
          close: 150.5,
          volume: 0,
        },
      ],
    })
    const rows = await fetchFxUsdJpy('2026-04-09', '2026-04-10')
    expect(rows[0].symbol).toBe('JPYUSD')
    expect(rows[0].assetClass).toBe('fx')
    expect(rows[0].currency).toBe('USD')
    expect(rows[0].close).toBe('150.5')
    expect(rows[0].rawClose).toBeNull()
  })
})
