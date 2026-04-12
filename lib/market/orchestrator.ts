import 'server-only'
import { TICKERS } from '@/config/tickers'
import { resolveTargetDate } from './calendar'
import { fetchOhlcvYahoo, fetchFxUsdJpy } from './yahoo'
import { fetchCompanyNews, fetchBasicFinancials } from './finnhub'
import { fetchOhlcvStooq } from './stooq'
import {
  upsertPriceSnapshots,
  upsertNewsSnapshots,
  upsertFundamentalsSnapshots,
  writeMarketClosedRow,
} from './persist'
import { isMarketClosed } from './calendar'
import type { OhlcvRow } from './types'
import type { Ticker } from './types'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type FetchMode = 'incremental' | 'backfill'

export type FailureSummary = {
  readonly ok: string[]
  readonly failed: ReadonlyArray<{ symbol: string; reason: string }>
  readonly marketClosed: string[]
  readonly durationMs: number
}

export type FetchOptions = {
  readonly mode: FetchMode
  readonly daysBack?: number // for backfill; default 100
  readonly now?: Date // for tests
  readonly onlySymbols?: readonly string[] // CLI override
}

// ---------------------------------------------------------------------------
// Main entry point — called by cron route + backfill CLI
// ---------------------------------------------------------------------------

export async function fetchMarketData(
  opts: FetchOptions,
): Promise<FailureSummary> {
  const started = Date.now()
  const now = opts.now ?? new Date()
  const daysBack = opts.mode === 'backfill' ? (opts.daysBack ?? 100) : 1

  const tickers = opts.onlySymbols
    ? TICKERS.filter((t) => opts.onlySymbols!.includes(t.symbol))
    : [...TICKERS]

  const ok: string[] = []
  const failed: Array<{ symbol: string; reason: string }> = []
  const marketClosed: string[] = []

  // D-18: Group tickers by market for holiday detection
  const todayIso = now.toISOString().slice(0, 10)
  const closedMarkets = new Set<string>()

  // Process each ticker independently (D-15: one failure does not abort the run)
  for (const ticker of tickers) {
    try {
      // D-18: If today is a holiday for this market (incremental only), write
      // a market_closed row and skip fetching. In backfill mode, always fetch.
      if (opts.mode === 'incremental' && isMarketClosed(ticker.market, todayIso)) {
        if (!closedMarkets.has(ticker.market)) {
          // Collect all symbols for this market to batch the write
          const marketSymbols = tickers
            .filter((t) => t.market === ticker.market)
            .map((t) => t.symbol)
          await writeMarketClosedRow(ticker.market, todayIso, marketSymbols)
          closedMarkets.add(ticker.market)
        }
        marketClosed.push(ticker.symbol)
        continue
      }

      const dates = resolveTargetDate(ticker.market, opts.mode, daysBack, now)

      if (dates.length === 0) {
        marketClosed.push(ticker.symbol)
        continue
      }

      const period1 = dates[0]
      const period2 = incrementIso(dates[dates.length - 1], 1)

      const rows = await fetchWithFallback(ticker, period1, period2, dates)
      await upsertPriceSnapshots(rows)

      // News + fundamentals for US tickers only
      if (ticker.market === 'US') {
        await fetchNewsAndFundamentals(
          ticker.symbol,
          period1,
          dates[dates.length - 1],
        )
      }

      ok.push(ticker.symbol)
    } catch (e) {
      const reason = (e as Error).message
      failed.push({ symbol: ticker.symbol, reason })
    }
  }

  // FX (once per run, independent of individual tickers)
  try {
    const fxDates = resolveTargetDate('US', opts.mode, daysBack, now)
    if (fxDates.length > 0) {
      const fxRows = await fetchFxUsdJpy(
        fxDates[0],
        incrementIso(fxDates[fxDates.length - 1], 1),
      )
      await upsertPriceSnapshots(fxRows)
      ok.push('JPYUSD')
    }
  } catch (e) {
    failed.push({ symbol: 'JPYUSD', reason: (e as Error).message })
  }

  return { ok, failed, marketClosed, durationMs: Date.now() - started }
}

// ---------------------------------------------------------------------------
// D-13 fallback logic: yahoo -> Stooq for JP tickers
// Three triggers: (1) exception, (2) empty, (3) stale
// ---------------------------------------------------------------------------

async function fetchWithFallback(
  ticker: Ticker,
  period1: string,
  period2: string,
  targetDates: readonly string[],
): Promise<OhlcvRow[]> {
  if (ticker.market === 'JP') {
    return fetchJpWithFallback(ticker, period1, period2, targetDates)
  }

  // US: yahoo only (per Amendment A — Finnhub for news/fundamentals, not OHLCV)
  return fetchOhlcvYahoo(ticker.symbol, period1, period2)
}

async function fetchJpWithFallback(
  ticker: Ticker,
  period1: string,
  period2: string,
  targetDates: readonly string[],
): Promise<OhlcvRow[]> {
  try {
    const rows = await fetchOhlcvYahoo(ticker.symbol, period1, period2)

    // D-13.2: empty response triggers fallback
    if (rows.length === 0) {
      throw new Error('empty yahoo response')
    }

    // D-13.3: stale data triggers fallback
    const expectedDate = targetDates[targetDates.length - 1]
    if (isStale(rows, expectedDate)) {
      throw new Error('stale yahoo data')
    }

    return rows
  } catch {
    // D-13.1/2/3: fall back to Stooq
    return fetchOhlcvStooq(ticker.symbol, period1, period2)
  }
}

// ---------------------------------------------------------------------------
// Staleness check (D-13.3)
// If the latest row date is older than the expected target date, data is stale.
// ---------------------------------------------------------------------------

function isStale(rows: readonly OhlcvRow[], expectedDate: string): boolean {
  const maxDate = rows
    .map((r) => r.priceDate)
    .sort()
    .pop()
  if (!maxDate) return true
  return maxDate < expectedDate
}

// ---------------------------------------------------------------------------
// News + fundamentals (US only, soft failures)
// ---------------------------------------------------------------------------

async function fetchNewsAndFundamentals(
  symbol: string,
  from: string,
  to: string,
): Promise<void> {
  try {
    const news = await fetchCompanyNews(symbol, from, to)
    await upsertNewsSnapshots(news, to)
  } catch {
    // Soft failure — do not propagate
  }

  try {
    const fund = await fetchBasicFinancials(symbol)
    await upsertFundamentalsSnapshots([fund], to)
  } catch {
    // Soft failure — do not propagate
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function incrementIso(isoDate: string, n: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
