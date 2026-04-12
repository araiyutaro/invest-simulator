import 'server-only'
import { sql } from 'drizzle-orm'
import { db } from '@/db'
import {
  priceSnapshots,
  newsSnapshots,
  fundamentalsSnapshots,
} from '@/db/schema'
import { getTicker } from './whitelist'
import type { OhlcvRow, Market } from './types'
import type { NewsItem, Fundamentals } from './finnhub'

// ---------------------------------------------------------------------------
// upsertPriceSnapshots
// Idempotent upsert on UNIQUE(symbol, price_date).
// Uses `excluded.*` to always overwrite with the latest fetched values.
// ---------------------------------------------------------------------------

export async function upsertPriceSnapshots(
  rows: readonly OhlcvRow[],
): Promise<number> {
  if (rows.length === 0) return 0

  const values = rows.map((r) => ({
    symbol: r.symbol,
    priceDate: r.priceDate,
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    rawClose: r.rawClose,
    volume: r.volume != null ? BigInt(r.volume) : null,
    currency: r.currency,
    fxRateToJpy: null,
    marketClosed: r.marketClosed,
    assetClass: r.assetClass,
    source: r.source,
  }))

  await db
    .insert(priceSnapshots)
    .values(values)
    .onConflictDoUpdate({
      target: [priceSnapshots.symbol, priceSnapshots.priceDate],
      set: {
        open: sql`excluded.open`,
        high: sql`excluded.high`,
        low: sql`excluded.low`,
        close: sql`excluded.close`,
        rawClose: sql`excluded.raw_close`,
        volume: sql`excluded.volume`,
        source: sql`excluded.source`,
        marketClosed: sql`excluded.market_closed`,
        fetchedAt: sql`now()`,
      },
    })

  return values.length
}

// ---------------------------------------------------------------------------
// writeMarketClosedRow
// Inserts placeholder rows for market holidays (close=NULL, source='none').
// Uses onConflictDoNothing — if a real price row already exists, skip.
// ---------------------------------------------------------------------------

export async function writeMarketClosedRow(
  market: Market,
  isoDate: string,
  symbols: readonly string[],
): Promise<number> {
  if (symbols.length === 0) return 0

  const values = symbols.map((sym) => {
    const ticker = getTicker(sym)
    return {
      symbol: sym,
      priceDate: isoDate,
      open: null,
      high: null,
      low: null,
      close: null,
      rawClose: null,
      volume: null,
      currency: ticker.currency,
      fxRateToJpy: null,
      marketClosed: true,
      assetClass: ticker.assetClass,
      source: 'none' as const,
    }
  })

  await db
    .insert(priceSnapshots)
    .values(values)
    .onConflictDoNothing({
      target: [priceSnapshots.symbol, priceSnapshots.priceDate],
    })

  return values.length
}

// ---------------------------------------------------------------------------
// upsertNewsSnapshots
// Plain insert — news_snapshots has no unique constraint (D-06: duplicates ok).
// ---------------------------------------------------------------------------

export async function upsertNewsSnapshots(
  items: readonly NewsItem[],
  newsDate: string,
): Promise<number> {
  if (items.length === 0) return 0

  await db.insert(newsSnapshots).values(
    items.map((n) => ({
      symbol: n.symbol,
      newsDate,
      headline: n.headline,
      url: n.url,
      sourceDomain: n.sourceDomain,
      publishedAt: n.publishedAt,
      raw: n.raw,
    })),
  )

  return items.length
}

// ---------------------------------------------------------------------------
// upsertFundamentalsSnapshots
// Idempotent upsert on UNIQUE(symbol, as_of_date).
// ---------------------------------------------------------------------------

export async function upsertFundamentalsSnapshots(
  funds: readonly Fundamentals[],
  asOfDate: string,
): Promise<number> {
  if (funds.length === 0) return 0

  await db
    .insert(fundamentalsSnapshots)
    .values(
      funds.map((f) => ({
        symbol: f.symbol,
        asOfDate,
        peRatio: f.peRatio,
        eps: f.eps,
        marketCap: f.marketCap,
        week52High: f.week52High,
        week52Low: f.week52Low,
        raw: f.raw,
      })),
    )
    .onConflictDoUpdate({
      target: [fundamentalsSnapshots.symbol, fundamentalsSnapshots.asOfDate],
      set: {
        peRatio: sql`excluded.pe_ratio`,
        eps: sql`excluded.eps`,
        marketCap: sql`excluded.market_cap`,
        week52High: sql`excluded.week_52_high`,
        week52Low: sql`excluded.week_52_low`,
        raw: sql`excluded.raw`,
        fetchedAt: sql`now()`,
      },
    })

  return funds.length
}
