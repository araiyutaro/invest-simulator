import 'server-only'

// Dashboard DB queries (Phase 04-02).
// Reads portfolio_snapshots, positions, price_snapshots, decisions, trades
// and shapes them for the dashboard UI layer.
//
// Threat mitigations:
//   T-04-02 (Information Disclosure): `server-only` guard prevents DB
//     credentials from leaking into the client bundle.
//   T-04-03 (Tampering): `parseTimelineFromDecision` defensively handles
//     malformed transcripts; no unchecked type assertions flow into the UI.

import { and, asc, desc, eq, inArray } from 'drizzle-orm'

import { db } from '@/db'
import {
  decisions,
  portfolios,
  portfolioSnapshots,
  positions,
  priceSnapshots,
  trades,
} from '@/db/schema'

import type {
  AllocationSlice,
  PositionWithPrice,
  TimelineDay,
  TimelineTrade,
} from './types'

// ---------------------------------------------------------------------------
// parseTimelineFromDecision — pure transcript parser (unit-tested)
// ---------------------------------------------------------------------------

type ParsedTimeline = {
  readonly marketAssessment: string
  readonly trades: readonly TimelineTrade[]
}

type RawDecisionEntry = {
  ticker?: unknown
  action?: unknown
  quantity?: unknown
  confidence?: unknown
  reasoning?: unknown
}

/**
 * Extract `{ marketAssessment, trades[] }` from a JSONB transcript.
 * - Keeps only BUY/SELL entries (HOLD filtered out per D-12).
 * - Returns an empty fallback for any structurally invalid input
 *   (null, non-object, decisions not an array, etc.).
 *
 * The caller is expected to overlay real executed price/quantity from the
 * `trades` table — this helper only provides confidence + reasoning + the
 * original decision metadata.
 */
export function parseTimelineFromDecision(transcript: unknown): ParsedTimeline {
  if (transcript == null || typeof transcript !== 'object') {
    return { marketAssessment: '', trades: [] }
  }

  const t = transcript as {
    market_assessment?: unknown
    decisions?: unknown
  }

  const marketAssessment =
    typeof t.market_assessment === 'string' ? t.market_assessment : ''

  if (!Array.isArray(t.decisions)) {
    return { marketAssessment, trades: [] }
  }

  const result: TimelineTrade[] = []
  for (const raw of t.decisions as RawDecisionEntry[]) {
    if (raw == null || typeof raw !== 'object') continue

    const action = raw.action
    if (action !== 'BUY' && action !== 'SELL') continue

    const confidence = raw.confidence
    const normalizedConfidence: 'high' | 'medium' | 'low' =
      confidence === 'high' || confidence === 'medium' || confidence === 'low'
        ? confidence
        : 'medium'

    result.push({
      ticker: typeof raw.ticker === 'string' ? raw.ticker : '',
      action,
      quantity: typeof raw.quantity === 'number' ? raw.quantity : 0,
      // transcript doesn't carry the executed price; callers overlay it.
      executedPrice: 0,
      currency: '',
      confidence: normalizedConfidence,
      reasoning: typeof raw.reasoning === 'string' ? raw.reasoning : '',
    })
  }

  return { marketAssessment, trades: result }
}

// ---------------------------------------------------------------------------
// getPortfolioId — single-portfolio convenience
// ---------------------------------------------------------------------------

/**
 * Return the UUID of the (single) portfolio row. Throws if none exists.
 * Matches the D-03 "JPY単一ポートフォリオ" decision from Phase 1.
 */
export async function getPortfolioId(): Promise<string> {
  const rows = await db
    .select({ id: portfolios.id })
    .from(portfolios)
    .limit(1)

  if (rows.length === 0) {
    throw new Error('No portfolio found. Run the daily agent at least once.')
  }
  return rows[0].id
}

// ---------------------------------------------------------------------------
// getChartData — 3系列の時系列（portfolio / SPY / TOPIX ETF）
// ---------------------------------------------------------------------------

type TimeSeriesPoint = { date: string; value: number }

export async function getChartData(portfolioId: string): Promise<{
  portfolio: TimeSeriesPoint[]
  spy: TimeSeriesPoint[]
  topix: TimeSeriesPoint[]
}> {
  const [portfolioRows, spyRows, topixRows] = await Promise.all([
    db
      .select({
        date: portfolioSnapshots.snapshotDate,
        value: portfolioSnapshots.totalValueJpy,
      })
      .from(portfolioSnapshots)
      .where(eq(portfolioSnapshots.portfolioId, portfolioId))
      .orderBy(asc(portfolioSnapshots.snapshotDate)),
    db
      .select({
        date: priceSnapshots.priceDate,
        value: priceSnapshots.close,
      })
      .from(priceSnapshots)
      .where(
        and(
          eq(priceSnapshots.symbol, 'SPY'),
          eq(priceSnapshots.marketClosed, false)
        )
      )
      .orderBy(asc(priceSnapshots.priceDate)),
    db
      .select({
        date: priceSnapshots.priceDate,
        value: priceSnapshots.close,
      })
      .from(priceSnapshots)
      .where(
        and(
          eq(priceSnapshots.symbol, '1306.T'),
          eq(priceSnapshots.marketClosed, false)
        )
      )
      .orderBy(asc(priceSnapshots.priceDate)),
  ])

  return {
    portfolio: portfolioRows.map((r) => ({
      date: r.date,
      value: Number(r.value),
    })),
    spy: spyRows.map((r) => ({
      date: r.date,
      value: Number(r.value ?? 0),
    })),
    topix: topixRows.map((r) => ({
      date: r.date,
      value: Number(r.value ?? 0),
    })),
  }
}

// ---------------------------------------------------------------------------
// getPositionsWithPrices — 現在ポジション + 配分比率
// ---------------------------------------------------------------------------

export async function getPositionsWithPrices(portfolioId: string): Promise<{
  positions: PositionWithPrice[]
  allocations: AllocationSlice[]
  cash: number
}> {
  const [portfolioRow] = await db
    .select({ cash: portfolios.cash })
    .from(portfolios)
    .where(eq(portfolios.id, portfolioId))
    .limit(1)

  const cash = Number(portfolioRow?.cash ?? 0)

  const positionRows = await db
    .select({
      symbol: positions.symbol,
      quantity: positions.quantity,
      avgCost: positions.avgCost,
      currency: positions.currency,
    })
    .from(positions)
    .where(eq(positions.portfolioId, portfolioId))

  const active = positionRows.filter((p) => p.quantity > 0)

  // Fetch the latest close + FX for every symbol (one query per symbol — N
  // stays small because we run with a tight whitelist).
  const latestPrices = await Promise.all(
    active.map(async (p) => {
      const [latest] = await db
        .select({
          close: priceSnapshots.close,
          fxRateToJpy: priceSnapshots.fxRateToJpy,
        })
        .from(priceSnapshots)
        .where(
          and(
            eq(priceSnapshots.symbol, p.symbol),
            eq(priceSnapshots.marketClosed, false)
          )
        )
        .orderBy(desc(priceSnapshots.priceDate))
        .limit(1)

      return {
        symbol: p.symbol,
        close: latest ? Number(latest.close ?? 0) : 0,
        fxRateToJpy: latest?.fxRateToJpy ? Number(latest.fxRateToJpy) : 1,
      }
    })
  )

  const priceMap = new Map(latestPrices.map((p) => [p.symbol, p]))

  // First pass: compute JPY market values + unrealized P&L.
  const enriched = active.map((p) => {
    const priceInfo = priceMap.get(p.symbol)
    const currentPrice = priceInfo?.close ?? 0
    const avgCost = Number(p.avgCost)
    const quantity = p.quantity
    const fx = p.currency === 'JPY' ? 1 : priceInfo?.fxRateToJpy ?? 1

    const marketValueJpy = currentPrice * quantity * fx
    const costBasisJpy = avgCost * quantity * fx
    const unrealizedPnl = marketValueJpy - costBasisJpy

    return {
      symbol: p.symbol,
      quantity,
      avgCost,
      currentPrice,
      currency: p.currency,
      unrealizedPnl,
      marketValueJpy,
    }
  })

  const totalValue = enriched.reduce((sum, e) => sum + e.marketValueJpy, 0) + cash

  // Second pass: attach allocation %.
  const enrichedPositions: PositionWithPrice[] = enriched.map((e) => ({
    symbol: e.symbol,
    quantity: e.quantity,
    avgCost: e.avgCost,
    currentPrice: e.currentPrice,
    currency: e.currency,
    unrealizedPnl: e.unrealizedPnl,
    allocation: totalValue === 0 ? 0 : (e.marketValueJpy / totalValue) * 100,
  }))

  const allocations: AllocationSlice[] = [
    ...enriched.map((e) => ({ name: e.symbol, value: e.marketValueJpy })),
    { name: 'CASH', value: cash },
  ]

  return { positions: enrichedPositions, allocations, cash }
}

// ---------------------------------------------------------------------------
// getTimelineData — トレードタイムライン（日単位、BUY/SELLのみ）
// ---------------------------------------------------------------------------

export async function getTimelineData(
  portfolioId: string,
  limit: number = 20,
  offset: number = 0
): Promise<TimelineDay[]> {
  const decisionRows = await db
    .select({
      id: decisions.id,
      runDate: decisions.runDate,
      transcript: decisions.transcript,
    })
    .from(decisions)
    .where(eq(decisions.portfolioId, portfolioId))
    .orderBy(desc(decisions.runDate))
    .limit(limit)
    .offset(offset)

  if (decisionRows.length === 0) return []

  const decisionIds = decisionRows.map((d) => d.id)

  // One JOIN to collect every trade row tied to these decisions.
  const tradeRows = await db
    .select({
      decisionId: trades.decisionId,
      symbol: trades.symbol,
      action: trades.action,
      quantity: trades.quantity,
      executedPrice: trades.executedPrice,
      currency: trades.currency,
    })
    .from(trades)
    .where(inArray(trades.decisionId, decisionIds))

  // Index trades by decision for fast merge.
  const tradesByDecision = new Map<
    string,
    Array<{
      symbol: string
      action: string
      quantity: number
      executedPrice: string
      currency: string
    }>
  >()
  for (const tr of tradeRows) {
    const list = tradesByDecision.get(tr.decisionId) ?? []
    list.push({
      symbol: tr.symbol,
      action: tr.action,
      quantity: tr.quantity,
      executedPrice: tr.executedPrice,
      currency: tr.currency,
    })
    tradesByDecision.set(tr.decisionId, list)
  }

  const result: TimelineDay[] = decisionRows.map((d) => {
    const parsed = parseTimelineFromDecision(d.transcript)
    const executedTrades = tradesByDecision.get(d.id) ?? []

    // Overlay executed price/quantity onto the parsed transcript entries by
    // (ticker, action). If a transcript decision has no matching executed
    // trade row (e.g. quantity=0 SELL that was skipped), drop it — only the
    // actually-executed BUY/SELL belongs on the timeline.
    const mergedTrades: TimelineTrade[] = []
    for (const parsedTrade of parsed.trades) {
      const match = executedTrades.find(
        (et) =>
          et.symbol === parsedTrade.ticker && et.action === parsedTrade.action
      )
      if (!match) continue
      mergedTrades.push({
        ticker: parsedTrade.ticker,
        action: parsedTrade.action,
        quantity: match.quantity,
        executedPrice: Number(match.executedPrice),
        currency: match.currency,
        confidence: parsedTrade.confidence,
        reasoning: parsedTrade.reasoning,
      })
    }

    return {
      date: d.runDate,
      marketAssessment: parsed.marketAssessment,
      trades: mergedTrades,
    }
  })

  return result
}

// ---------------------------------------------------------------------------
// getPerformanceData — calculateMetrics に投入する一括データ
// ---------------------------------------------------------------------------

export async function getPerformanceData(portfolioId: string): Promise<{
  snapshots: Array<{ totalValueJpy: string; snapshotDate: string }>
  spySnapshots: Array<{ close: string; priceDate: string }>
  trades: Array<{
    action: string
    executedPrice: string
    quantity: number
    symbol: string
  }>
  positionAvgCosts: Record<string, number>
}> {
  const [snapshotRows, spyRows, tradeRows, positionRows] = await Promise.all([
    db
      .select({
        totalValueJpy: portfolioSnapshots.totalValueJpy,
        snapshotDate: portfolioSnapshots.snapshotDate,
      })
      .from(portfolioSnapshots)
      .where(eq(portfolioSnapshots.portfolioId, portfolioId))
      .orderBy(asc(portfolioSnapshots.snapshotDate)),
    db
      .select({
        close: priceSnapshots.close,
        priceDate: priceSnapshots.priceDate,
      })
      .from(priceSnapshots)
      .where(
        and(
          eq(priceSnapshots.symbol, 'SPY'),
          eq(priceSnapshots.marketClosed, false)
        )
      )
      .orderBy(asc(priceSnapshots.priceDate)),
    db
      .select({
        action: trades.action,
        executedPrice: trades.executedPrice,
        quantity: trades.quantity,
        symbol: trades.symbol,
      })
      .from(trades)
      .where(eq(trades.portfolioId, portfolioId)),
    db
      .select({
        symbol: positions.symbol,
        avgCost: positions.avgCost,
      })
      .from(positions)
      .where(eq(positions.portfolioId, portfolioId)),
  ])

  const positionAvgCosts: Record<string, number> = {}
  for (const p of positionRows) {
    positionAvgCosts[p.symbol] = Number(p.avgCost)
  }

  return {
    snapshots: snapshotRows.map((s) => ({
      totalValueJpy: s.totalValueJpy,
      snapshotDate: s.snapshotDate,
    })),
    spySnapshots: spyRows.map((r) => ({
      close: r.close ?? '0',
      priceDate: r.priceDate,
    })),
    trades: tradeRows,
    positionAvgCosts,
  }
}
