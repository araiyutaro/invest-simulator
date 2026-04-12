import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Mock server-only to avoid error in test environment
vi.mock('server-only', () => ({}))

const { fetchOhlcvStooq, toStooqSymbol } = await import(
  '@/lib/market/stooq'
)

import { StooqError, WhitelistViolationError } from '@/lib/market/errors'

const csvFixture = readFileSync(
  resolve(__dirname, '../fixtures/market/stooq-7203-jp.csv'),
  'utf8',
)
const htmlFixture = readFileSync(
  resolve(__dirname, '../fixtures/market/stooq-error.html'),
  'utf8',
)
const captchaFixture = readFileSync(
  resolve(__dirname, '../fixtures/market/stooq-aapl-us.csv'),
  'utf8',
)

function mockRes(
  body: string,
  ct = 'text/csv',
  status = 200,
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (k: string) =>
        k.toLowerCase() === 'content-type' ? ct : null,
    },
    text: async () => body,
  } as unknown as Response
}

describe('toStooqSymbol (D-28)', () => {
  it('AAPL -> aapl.us', () => {
    expect(toStooqSymbol('AAPL')).toBe('aapl.us')
  })

  it('7203.T -> 7203.jp', () => {
    expect(toStooqSymbol('7203.T')).toBe('7203.jp')
  })

  it('XYZ -> WhitelistViolationError', () => {
    expect(() => toStooqSymbol('XYZ')).toThrow(WhitelistViolationError)
  })
})

describe('fetchOhlcvStooq (DATA-02 fallback)', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('parses CSV fixture into OhlcvRow[]', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockRes(csvFixture)))
    const rows = await fetchOhlcvStooq('7203.T', '2026-01-01', '2026-04-10')
    expect(rows.length).toBe(5)
    expect(rows[0]).toMatchObject({
      symbol: '7203.T',
      source: 'stooq',
      currency: 'JPY',
      priceDate: '2026-01-05',
      open: '2600.0000',
      high: '2650.0000',
      low: '2580.0000',
      close: '2620.0000',
      rawClose: '2620.0000',
      marketClosed: false,
      assetClass: 'equity',
    })
    expect(rows[0].priceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('HTML body (Pitfall 4) -> StooqError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(mockRes(htmlFixture, 'text/html')),
    )
    await expect(
      fetchOhlcvStooq('7203.T', '2026-01-01', '2026-04-10'),
    ).rejects.toThrow(StooqError)
  })

  it('captcha / apikey-gated response -> StooqError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockRes(captchaFixture, 'text/plain; charset=UTF-8'),
      ),
    )
    await expect(
      fetchOhlcvStooq('7203.T', '2026-01-01', '2026-04-10'),
    ).rejects.toThrow(StooqError)
  })

  it('CSV with wrong header -> StooqError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(mockRes('Foo,Bar\n1,2')),
    )
    await expect(
      fetchOhlcvStooq('7203.T', '2026-01-01', '2026-04-10'),
    ).rejects.toThrow(StooqError)
  })

  it('CSV with only header (no data) -> StooqError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockRes('Date,Open,High,Low,Close,Volume'),
      ),
    )
    await expect(
      fetchOhlcvStooq('7203.T', '2026-01-01', '2026-04-10'),
    ).rejects.toThrow(StooqError)
  })

  it('empty response body -> StooqError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(mockRes('')),
    )
    await expect(
      fetchOhlcvStooq('7203.T', '2026-01-01', '2026-04-10'),
    ).rejects.toThrow(StooqError)
  })

  it('non-whitelist symbol -> WhitelistViolationError before fetch', async () => {
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    await expect(
      fetchOhlcvStooq('XYZ', '2026-01-01', '2026-04-10'),
    ).rejects.toBeInstanceOf(WhitelistViolationError)
    expect(spy).not.toHaveBeenCalled()
  })

  it('HTTP error status -> StooqError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(mockRes('Server Error', 'text/html', 500)),
    )
    await expect(
      fetchOhlcvStooq('7203.T', '2026-01-01', '2026-04-10'),
    ).rejects.toThrow(StooqError)
  })

  it('builds correct URL with STOOQ_API_KEY', async () => {
    const originalEnv = process.env.STOOQ_API_KEY
    process.env.STOOQ_API_KEY = 'TESTKEY123'
    const spy = vi.fn().mockResolvedValue(mockRes(csvFixture))
    vi.stubGlobal('fetch', spy)

    await fetchOhlcvStooq('7203.T', '2026-01-01', '2026-04-10')

    const calledUrl = spy.mock.calls[0][0] as string
    expect(calledUrl).toContain('apikey=TESTKEY123')

    process.env.STOOQ_API_KEY = originalEnv
  })
})
