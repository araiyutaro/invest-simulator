import { describe, it, expect, vi } from 'vitest'

// Mock server-only so the module can be imported in test environment
vi.mock('server-only', () => ({}))

import { isWhitelisted, getTicker } from '@/lib/market/whitelist'
import { WhitelistViolationError, MarketDataError } from '@/lib/market/errors'
import { TICKERS } from '@/config/tickers'

describe('whitelist (D-01..D-04, DATA-05)', () => {
  it('contains exactly 10 tickers (6 US + 4 JP)', () => {
    expect(TICKERS.length).toBe(10)
    expect(TICKERS.filter((t) => t.market === 'US').length).toBe(6)
    expect(TICKERS.filter((t) => t.market === 'JP').length).toBe(4)
  })

  it('isWhitelisted returns true for AAPL and 7203.T', () => {
    expect(isWhitelisted('AAPL')).toBe(true)
    expect(isWhitelisted('7203.T')).toBe(true)
  })

  it('isWhitelisted returns false for unlisted symbol', () => {
    expect(isWhitelisted('XYZ')).toBe(false)
  })

  it('getTicker returns full Ticker for AAPL', () => {
    const t = getTicker('AAPL')
    expect(t.symbol).toBe('AAPL')
    expect(t.market).toBe('US')
    expect(t.currency).toBe('USD')
    expect(t.assetClass).toBe('equity')
    expect(t.name).toBe('Apple Inc.')
  })

  it('getTicker throws WhitelistViolationError for unlisted', () => {
    expect(() => getTicker('XYZ')).toThrow(WhitelistViolationError)
    expect(() => getTicker('XYZ')).toThrow(MarketDataError)
  })
})
