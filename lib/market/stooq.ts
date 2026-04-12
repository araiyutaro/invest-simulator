import 'server-only'
import { getTicker } from './whitelist'
import { StooqError } from './errors'
import type { OhlcvRow } from './types'

const BASE = 'https://stooq.com/q/d/l'
const EXPECTED_HEADER = 'Date,Open,High,Low,Close,Volume'

/**
 * Convert a canonical symbol (e.g. 'AAPL', '7203.T') to Stooq format (D-28).
 * Throws WhitelistViolationError if symbol is not whitelisted.
 */
export function toStooqSymbol(symbol: string): string {
  const ticker = getTicker(symbol) // throws WhitelistViolationError if not found
  if (ticker.market === 'US') return `${symbol.toLowerCase()}.us`
  if (ticker.market === 'JP') {
    const base = symbol.replace(/\.T$/i, '')
    return `${base.toLowerCase()}.jp`
  }
  throw new StooqError(`unsupported market for Stooq: ${ticker.market}`, symbol)
}

/**
 * Fetch OHLCV data from Stooq CSV endpoint.
 *
 * Env-gated: if STOOQ_API_KEY is not set, the request will be sent without
 * an apikey and Stooq will return a captcha prompt (detected as StooqError).
 * This is intentional — see 02-SPIKE-RAW-CLOSE.md.
 *
 * Pitfall 4 guard: validates response is actual CSV, not HTML error page.
 */
export async function fetchOhlcvStooq(
  symbol: string,
  from: string,
  to: string,
): Promise<OhlcvRow[]> {
  const ticker = getTicker(symbol)
  const stooqSym = toStooqSymbol(symbol)
  const d1 = from.replaceAll('-', '')
  const d2 = to.replaceAll('-', '')

  let url = `${BASE}/?s=${stooqSym}&i=d&d1=${d1}&d2=${d2}`
  const apiKey = process.env.STOOQ_API_KEY
  if (apiKey) {
    url = `${url}&apikey=${apiKey}`
  }

  const res = await fetch(url)
  if (!res.ok) {
    throw new StooqError(`HTTP ${res.status}`, symbol)
  }

  const body = await res.text()

  // Pitfall 4: Stooq returns 200 + HTML on error
  if (body.trimStart().startsWith('<')) {
    throw new StooqError('HTML response (Pitfall 4)', symbol)
  }

  // SPIKE finding: captcha/apikey-gated response detection
  if (body.trimStart().startsWith('Get your apikey')) {
    throw new StooqError('Stooq requires apikey (captcha-gated)', symbol)
  }

  const lines = body
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  if (lines.length === 0) {
    throw new StooqError('empty response', symbol)
  }

  if (lines[0] !== EXPECTED_HEADER) {
    throw new StooqError(`unexpected header: ${lines[0]}`, symbol)
  }

  if (lines.length === 1) {
    throw new StooqError('no data rows', symbol)
  }

  return lines.slice(1).map((line): OhlcvRow => {
    const [date, open, high, low, close, volume] = line.split(',')
    return {
      symbol,
      priceDate: date,
      open,
      high,
      low,
      close,
      rawClose: close, // Stooq is unadjusted — fills raw_close per D-08
      volume,
      currency: ticker.currency,
      source: 'stooq',
      marketClosed: false,
      assetClass: ticker.assetClass,
    }
  })
}
