import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock server-only to avoid error in test environment
vi.mock('server-only', () => ({}))

// Mock env to avoid validation errors from transitive imports
vi.mock('@/lib/env', () => ({
  env: { FINNHUB_API_KEY: 'test-key' },
}))

// Mock DB to avoid connection errors from transitive persist imports
vi.mock('@/db', () => ({
  db: {},
}))

// Mock all downstream modules
vi.mock('@/lib/market/yahoo')
vi.mock('@/lib/market/finnhub')
vi.mock('@/lib/market/stooq')
vi.mock('@/lib/market/persist')
vi.mock('@/lib/market/calendar')

const { fetchMarketData } = await import('@/lib/market/orchestrator')
const yahoo = await import('@/lib/market/yahoo')
const stooq = await import('@/lib/market/stooq')
const finnhub = await import('@/lib/market/finnhub')
const persist = await import('@/lib/market/persist')
const calendar = await import('@/lib/market/calendar')

function makeOhlcv(symbol: string, dates: readonly string[]) {
  return dates.map((d) => ({
    symbol,
    priceDate: d,
    open: '100',
    high: '110',
    low: '90',
    close: '105',
    rawClose: '104',
    volume: '1000000',
    currency: symbol.endsWith('.T') ? ('JPY' as const) : ('USD' as const),
    source: 'yahoo' as const,
    marketClosed: false,
    assetClass: 'equity' as const,
  }))
}

describe('fetchMarketData orchestrator (DATA-01..05)', () => {
  beforeEach(() => {
    vi.resetAllMocks()

    // Default calendar mock — not a holiday, returns a single date for incremental
    vi.mocked(calendar.isMarketClosed).mockReturnValue(false)
    vi.mocked(calendar.resolveTargetDate).mockReturnValue(['2026-04-10'])

    // Default persist mocks — resolve without hitting DB
    vi.mocked(persist.upsertPriceSnapshots).mockResolvedValue(0)
    vi.mocked(persist.upsertNewsSnapshots).mockResolvedValue(0)
    vi.mocked(persist.upsertFundamentalsSnapshots).mockResolvedValue(0)
    vi.mocked(persist.writeMarketClosedRow).mockResolvedValue(0)

    // Default finnhub mocks
    vi.mocked(finnhub.fetchCompanyNews).mockResolvedValue([])
    vi.mocked(finnhub.fetchBasicFinancials).mockResolvedValue({
      symbol: 'X',
      peRatio: null,
      eps: null,
      marketCap: null,
      week52High: null,
      week52Low: null,
      raw: {},
    })

    // Default FX mock
    vi.mocked(yahoo.fetchFxUsdJpy).mockResolvedValue(
      makeOhlcv('JPYUSD', ['2026-04-10']),
    )
  })

  it('happy path: all 10 tickers + FX succeed in incremental mode', async () => {
    vi.mocked(yahoo.fetchOhlcvYahoo).mockImplementation(
      async (s: string) => makeOhlcv(s, ['2026-04-10']),
    )

    // Friday 2026-04-10 after US close (22:00 UTC = 18:00 ET, past 16:30)
    const res = await fetchMarketData({
      mode: 'incremental',
      now: new Date('2026-04-10T22:00:00Z'),
    })

    // 10 tickers + JPYUSD = 11 ok entries
    expect(res.ok).toHaveLength(11)
    expect(res.failed).toHaveLength(0)
    expect(res.durationMs).toBeGreaterThanOrEqual(0)

    // Finnhub should be called for US tickers only (6 US: AAPL, MSFT, NVDA, GOOGL, AMZN, SPY)
    expect(finnhub.fetchCompanyNews).toHaveBeenCalledTimes(6)
    expect(finnhub.fetchBasicFinancials).toHaveBeenCalledTimes(6)

    // Stooq should NOT be called (no fallback needed)
    expect(stooq.fetchOhlcvStooq).not.toHaveBeenCalled()
  })

  it('JP yahoo throws -> Stooq fallback fires (D-13.1)', async () => {
    vi.mocked(yahoo.fetchOhlcvYahoo).mockImplementation(async (s: string) => {
      if (s.endsWith('.T')) throw new Error('yahoo down')
      return makeOhlcv(s, ['2026-04-10'])
    })
    vi.mocked(stooq.fetchOhlcvStooq).mockImplementation(
      async (s: string) => makeOhlcv(s, ['2026-04-10']),
    )

    const res = await fetchMarketData({
      mode: 'incremental',
      now: new Date('2026-04-10T22:00:00Z'),
    })

    expect(stooq.fetchOhlcvStooq).toHaveBeenCalled()
    // All JP tickers should still succeed via fallback
    expect(res.ok).toContain('7203.T')
    expect(res.ok).toContain('6758.T')
    expect(res.ok).toContain('9984.T')
    expect(res.ok).toContain('7974.T')
    expect(res.failed).toHaveLength(0)
  })

  it('JP yahoo returns empty -> Stooq fallback fires (D-13.2)', async () => {
    vi.mocked(yahoo.fetchOhlcvYahoo).mockImplementation(async (s: string) => {
      if (s.endsWith('.T')) return []
      return makeOhlcv(s, ['2026-04-10'])
    })
    vi.mocked(stooq.fetchOhlcvStooq).mockImplementation(
      async (s: string) => makeOhlcv(s, ['2026-04-10']),
    )

    const res = await fetchMarketData({
      mode: 'incremental',
      now: new Date('2026-04-10T22:00:00Z'),
    })

    expect(stooq.fetchOhlcvStooq).toHaveBeenCalled()
    expect(res.ok).toContain('7203.T')
  })

  it('JP yahoo returns stale data -> Stooq fallback fires (D-13.3)', async () => {
    vi.mocked(yahoo.fetchOhlcvYahoo).mockImplementation(async (s: string) => {
      if (s.endsWith('.T')) {
        // Return data much older than the expected target date
        return makeOhlcv(s, ['2026-04-01'])
      }
      return makeOhlcv(s, ['2026-04-10'])
    })
    vi.mocked(stooq.fetchOhlcvStooq).mockImplementation(
      async (s: string) => makeOhlcv(s, ['2026-04-10']),
    )

    const res = await fetchMarketData({
      mode: 'incremental',
      now: new Date('2026-04-10T22:00:00Z'),
    })

    expect(stooq.fetchOhlcvStooq).toHaveBeenCalled()
    expect(res.ok).toContain('7203.T')
  })

  it('JP both yahoo + Stooq fail -> failure recorded, others continue (D-15)', async () => {
    vi.mocked(yahoo.fetchOhlcvYahoo).mockImplementation(async (s: string) => {
      if (s.endsWith('.T')) throw new Error('yahoo down')
      return makeOhlcv(s, ['2026-04-10'])
    })
    vi.mocked(stooq.fetchOhlcvStooq).mockRejectedValue(
      new Error('stooq down'),
    )

    const res = await fetchMarketData({
      mode: 'incremental',
      now: new Date('2026-04-10T22:00:00Z'),
    })

    // All 4 JP tickers should be in failed
    const failedSymbols = res.failed.map((f) => f.symbol)
    expect(failedSymbols).toContain('7203.T')
    expect(failedSymbols).toContain('6758.T')
    expect(failedSymbols).toContain('9984.T')
    expect(failedSymbols).toContain('7974.T')

    // US tickers should still succeed
    expect(res.ok).toContain('AAPL')
    expect(res.ok).toContain('MSFT')
    expect(res.ok.length).toBeGreaterThan(0)
  })

  it('onlySymbols filters to subset', async () => {
    vi.mocked(yahoo.fetchOhlcvYahoo).mockImplementation(
      async (s: string) => makeOhlcv(s, ['2026-04-10']),
    )

    const res = await fetchMarketData({
      mode: 'incremental',
      onlySymbols: ['AAPL'],
      now: new Date('2026-04-10T22:00:00Z'),
    })

    // Only AAPL ticker + JPYUSD FX
    expect(yahoo.fetchOhlcvYahoo).toHaveBeenCalledTimes(1)
    expect(yahoo.fetchOhlcvYahoo).toHaveBeenCalledWith(
      'AAPL',
      expect.any(String),
      expect.any(String),
    )
    expect(res.ok).toContain('AAPL')
  })

  it('non-whitelist symbol via onlySymbols yields zero fetches', async () => {
    vi.mocked(yahoo.fetchOhlcvYahoo).mockImplementation(
      async (s: string) => makeOhlcv(s, ['2026-04-10']),
    )

    const res = await fetchMarketData({
      mode: 'incremental',
      onlySymbols: ['XYZ_NOT_REAL'],
      now: new Date('2026-04-10T22:00:00Z'),
    })

    // XYZ is not in TICKERS, so filter drops it entirely
    expect(yahoo.fetchOhlcvYahoo).not.toHaveBeenCalled()
    expect(res.ok).toHaveLength(1) // only JPYUSD FX
  })

  it('backfill mode fetches multiple days', async () => {
    vi.mocked(calendar.resolveTargetDate).mockReturnValue([
      '2026-04-08',
      '2026-04-09',
      '2026-04-10',
    ])
    vi.mocked(yahoo.fetchOhlcvYahoo).mockImplementation(
      async (s: string) =>
        makeOhlcv(s, ['2026-04-08', '2026-04-09', '2026-04-10']),
    )

    const res = await fetchMarketData({
      mode: 'backfill',
      daysBack: 3,
      now: new Date('2026-04-10T22:00:00Z'),
    })

    expect(res.ok.length).toBeGreaterThanOrEqual(10)
    expect(res.failed).toHaveLength(0)
  })

  it('US holiday writes market_closed rows, JP still fetches (D-18)', async () => {
    // 2026-01-19 is MLK Day (US holiday, but JP is open)
    vi.mocked(calendar.isMarketClosed).mockImplementation(
      (market: string, _date: string) => market === 'US',
    )
    vi.mocked(yahoo.fetchOhlcvYahoo).mockImplementation(
      async (s: string) => makeOhlcv(s, ['2026-01-19']),
    )

    const res = await fetchMarketData({
      mode: 'incremental',
      now: new Date('2026-01-19T22:00:00Z'),
    })

    // US tickers should be in marketClosed
    expect(res.marketClosed).toContain('AAPL')
    expect(res.marketClosed).toContain('MSFT')
    expect(res.marketClosed).toContain('SPY')
    expect(res.marketClosed).toHaveLength(6) // 6 US tickers

    // writeMarketClosedRow should be called once for US market (batched)
    expect(persist.writeMarketClosedRow).toHaveBeenCalledTimes(1)
    expect(persist.writeMarketClosedRow).toHaveBeenCalledWith(
      'US',
      '2026-01-19',
      expect.arrayContaining(['AAPL', 'MSFT']),
    )

    // JP tickers should still succeed
    expect(res.ok).toContain('7203.T')
    expect(res.ok).toContain('6758.T')

    // Finnhub should NOT be called (US is closed)
    expect(finnhub.fetchCompanyNews).not.toHaveBeenCalled()
  })

  it('news/fundamentals failure does NOT fail the ticker', async () => {
    vi.mocked(yahoo.fetchOhlcvYahoo).mockImplementation(
      async (s: string) => makeOhlcv(s, ['2026-04-10']),
    )
    vi.mocked(finnhub.fetchCompanyNews).mockRejectedValue(
      new Error('finnhub down'),
    )
    vi.mocked(finnhub.fetchBasicFinancials).mockRejectedValue(
      new Error('finnhub down'),
    )

    const res = await fetchMarketData({
      mode: 'incremental',
      now: new Date('2026-04-10T22:00:00Z'),
    })

    // All tickers should still be ok — news/fundamentals failures are soft
    expect(res.ok).toContain('AAPL')
    expect(res.ok.length).toBeGreaterThanOrEqual(10)
    expect(res.failed).toHaveLength(0)
  })
})
