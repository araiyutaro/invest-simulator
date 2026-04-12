import 'server-only'
import yahooFinance from 'yahoo-finance2'
import { getTicker } from './whitelist'
import { YahooError } from './errors'
import type { OhlcvRow } from './types'

// Exported for test injection (vi.spyOn) — do not use elsewhere.
export const _yahooClient = yahooFinance

type ChartQuote = {
  date: Date | string
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  adjclose?: number | null
  volume: number | null
}

type ChartResult = { quotes: ChartQuote[] }

/**
 * Fetch daily OHLCV for a whitelisted symbol via yahoo-finance2 chart().
 *
 * Mapping per 02-SPIKE-RAW-CLOSE.md Decision (Option A):
 *   rawClose = quote.close   (split-adjusted only)
 *   close    = quote.adjclose (split + dividend adjusted)
 *
 * historical() is deprecated — chart() is the only supported method.
 */
export async function fetchOhlcvYahoo(
  symbol: string,
  period1: string,
  period2: string,
): Promise<OhlcvRow[]> {
  const ticker = getTicker(symbol) // throws WhitelistViolationError — pre-network guard

  let result: ChartResult
  try {
    // interval '1d' per D-22; chart() is the only supported method (historical() deprecated)
    result = await (_yahooClient.chart as any)(symbol, {
      period1,
      period2,
      interval: '1d',
    })
  } catch (e) {
    throw new YahooError(
      `chart() failed: ${(e as Error).message}`,
      symbol,
    )
  }

  if (!result?.quotes || result.quotes.length === 0) {
    throw new YahooError(
      `empty response for ${symbol} [${period1}..${period2}]`,
      symbol,
    )
  }

  return result.quotes
    .filter((q) => q.close !== null && q.date)
    .map((q): OhlcvRow => {
      const iso =
        typeof q.date === 'string'
          ? q.date.slice(0, 10)
          : new Date(q.date).toISOString().slice(0, 10)

      const rawCloseStr = q.close != null ? String(q.close) : null
      const closeStr =
        q.adjclose != null ? String(q.adjclose) : rawCloseStr

      return {
        symbol,
        priceDate: iso,
        open: q.open != null ? String(q.open) : null,
        high: q.high != null ? String(q.high) : null,
        low: q.low != null ? String(q.low) : null,
        close: closeStr,
        // Per 02-SPIKE-RAW-CLOSE.md decision Option A:
        // rawClose = quote.close (split-adjusted only, not dividend-adjusted)
        rawClose: rawCloseStr,
        volume: q.volume != null ? String(q.volume) : null,
        currency: ticker.currency,
        source: 'yahoo',
        marketClosed: false,
        assetClass: ticker.assetClass,
      }
    })
}

/**
 * Fetch USD/JPY rate as OhlcvRow-shaped records (D-10, D-25, D-26).
 * Symbol used for storage is 'JPYUSD' per D-10. The yahoo ticker is 'JPY=X'
 * which returns JPY per 1 USD (i.e. USD/JPY).
 */
export async function fetchFxUsdJpy(
  period1: string,
  period2: string,
): Promise<OhlcvRow[]> {
  let result: ChartResult
  try {
    result = await (_yahooClient.chart as any)('JPY=X', {
      period1,
      period2,
      interval: '1d',
    })
  } catch (e) {
    throw new YahooError(
      `FX chart() failed: ${(e as Error).message}`,
      'JPY=X',
    )
  }

  if (!result?.quotes || result.quotes.length === 0) {
    throw new YahooError('empty FX response', 'JPY=X')
  }

  return result.quotes
    .filter((q) => q.close !== null && q.date)
    .map((q): OhlcvRow => {
      const iso =
        typeof q.date === 'string'
          ? q.date.slice(0, 10)
          : new Date(q.date).toISOString().slice(0, 10)

      return {
        symbol: 'JPYUSD',
        priceDate: iso,
        open: null,
        high: null,
        low: null,
        close: String(q.close),
        rawClose: null,
        volume: null,
        currency: 'USD',
        source: 'yahoo',
        marketClosed: false,
        assetClass: 'fx',
      }
    })
}
