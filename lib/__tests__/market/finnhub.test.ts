import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock server-only so the module can be imported in test environment
vi.mock('server-only', () => ({}))

// Mock env module to provide FINNHUB_API_KEY
vi.mock('@/lib/env', () => ({
  env: { FINNHUB_API_KEY: 'test-api-key' },
}))

import { fetchCompanyNews, fetchBasicFinancials } from '@/lib/market/finnhub'
import { FinnhubError, WhitelistViolationError } from '@/lib/market/errors'
import newsFixture from '@/lib/__tests__/fixtures/market/finnhub-news-aapl.json'
import bfFixture from '@/lib/__tests__/fixtures/market/finnhub-basicfinancials-aapl.json'

function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response
}

describe('finnhub client (DATA-01)', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetchCompanyNews returns parsed NewsItem[] from fixture', async () => {
    fetchMock.mockResolvedValue(mockResponse(newsFixture))
    const items = await fetchCompanyNews('AAPL', '2026-04-01', '2026-04-10')
    expect(items.length).toBeGreaterThan(0)
    expect(items[0].symbol).toBe('AAPL')
    expect(items[0].headline).toBeTruthy()
    expect(items[0].publishedAt).toBeInstanceOf(Date)
    expect(items[0].url).toBe('https://example.com')
    expect(items[0].sourceDomain).toBe('Fixture')
  })

  it('fetchBasicFinancials returns parsed Fundamentals', async () => {
    fetchMock.mockResolvedValue(mockResponse(bfFixture))
    const fund = await fetchBasicFinancials('AAPL')
    expect(fund.symbol).toBe('AAPL')
    expect(fund.peRatio).toBe('28.5')
    expect(fund.eps).toBe('6.2')
    expect(fund.marketCap).toBe('2800000')
    expect(fund.week52High).toBe('200')
    expect(fund.week52Low).toBe('150')
    expect(fund.raw).toBeDefined()
  })

  it('fetchCompanyNews rejects JP ticker BEFORE network call', async () => {
    await expect(
      fetchCompanyNews('7203.T', '2026-04-01', '2026-04-10'),
    ).rejects.toThrow(/US-only/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fetchCompanyNews rejects non-whitelist symbol BEFORE network call', async () => {
    await expect(
      fetchCompanyNews('XYZ', '2026-04-01', '2026-04-10'),
    ).rejects.toBeInstanceOf(WhitelistViolationError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('401 response throws FinnhubError with "unauthorized"', async () => {
    fetchMock.mockResolvedValue(mockResponse({}, 401))
    await expect(
      fetchCompanyNews('AAPL', '2026-04-01', '2026-04-10'),
    ).rejects.toThrow(/unauthorized/)
  })

  it('malformed response throws FinnhubError via zod parse failure', async () => {
    fetchMock.mockResolvedValue(mockResponse({ not: 'an array' }))
    await expect(
      fetchCompanyNews('AAPL', '2026-04-01', '2026-04-10'),
    ).rejects.toBeInstanceOf(FinnhubError)
  })
})
