import 'server-only'

// Dashboard performance metric calculations (Phase 04-02).
// Pure functions — no DB access, no I/O. Safe to unit test.
//
// Conventions:
// - numeric columns come from Drizzle as `string` (see D-02). Inputs typed
//   accordingly.
// - all percent values are returned as percents (e.g. 10 for "10%"), NOT
//   as decimals.
// - sharpe ratio is annualized using 252 trading days and rf=0 (D-18).

import type { ChartPoint, PerformanceMetrics } from './types'

// ---------------------------------------------------------------------------
// normalizeToPercent — %リターン正規化
// ---------------------------------------------------------------------------

/**
 * Normalize a time series to percent-change from day 0 (D-06).
 * The first point is always 0%. Subsequent points are
 * `((value - base) / base) * 100`.
 *
 * If the base value is 0 (or the series is empty), returns an all-zero
 * series to avoid division-by-zero. This matches the "initial funding day
 * before execution" edge case.
 */
export function normalizeToPercent(
  series: readonly { date: string; value: number }[]
): ChartPoint[] {
  if (series.length === 0) return []

  const base = series[0].value

  if (base === 0) {
    return series.map((p) => ({ time: p.date, value: 0 }))
  }

  return series.map((p) => ({
    time: p.date,
    value: ((p.value - base) / base) * 100,
  }))
}

// ---------------------------------------------------------------------------
// calculateWinRate — SELL取引の勝率 %
// ---------------------------------------------------------------------------

type WinRateTrade = {
  readonly action: string
  readonly executedPrice: string
  readonly quantity: number
  readonly symbol: string
}

/**
 * Win rate = profitable SELL trades / total SELL trades * 100.
 * Returns null when there are no SELL trades (undefined rate).
 */
export function calculateWinRate(
  trades: readonly WinRateTrade[],
  positionAvgCosts: Readonly<Record<string, number>>
): number | null {
  const sells = trades.filter((t) => t.action === 'SELL')
  if (sells.length === 0) return null

  let wins = 0
  for (const sell of sells) {
    const avgCost = positionAvgCosts[sell.symbol] ?? 0
    const executedPrice = Number(sell.executedPrice)
    if (Number.isFinite(executedPrice) && executedPrice > avgCost) {
      wins += 1
    }
  }

  return (wins / sells.length) * 100
}

// ---------------------------------------------------------------------------
// calculateSpyDiff — ポートフォリオ vs SPY 差分 %
// ---------------------------------------------------------------------------

/**
 * Simple difference between two total-return percentages.
 * Positive = portfolio outperformed SPY.
 */
export function calculateSpyDiff(
  portfolioReturn: number,
  spyReturn: number
): number {
  return portfolioReturn - spyReturn
}

// ---------------------------------------------------------------------------
// calculateMetrics — 6指標まとめて計算
// ---------------------------------------------------------------------------

type MetricSnapshot = {
  readonly totalValueJpy: string
  readonly snapshotDate: string
}

type MetricSpySnapshot = {
  readonly close: string
  readonly priceDate: string
}

const TRADING_DAYS_PER_YEAR = 252

/**
 * Compute the full performance metric bundle (D-18).
 * Returns null if there are fewer than 2 portfolio snapshots — we need at
 * least two points to compute any return.
 */
export function calculateMetrics(params: {
  readonly snapshots: readonly MetricSnapshot[]
  readonly spySnapshots: readonly MetricSpySnapshot[]
  readonly trades: readonly WinRateTrade[]
  readonly positionAvgCosts: Readonly<Record<string, number>>
}): PerformanceMetrics | null {
  const { snapshots, spySnapshots, trades, positionAvgCosts } = params

  if (snapshots.length < 2) return null

  const values = snapshots.map((s) => Number(s.totalValueJpy))
  const base = values[0]
  const last = values[values.length - 1]

  // --- Total return ---
  const totalReturn = base === 0 ? 0 : ((last - base) / base) * 100

  // --- Daily returns series (for sharpe) ---
  const dailyReturns: number[] = []
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1]
    const curr = values[i]
    if (prev === 0) {
      dailyReturns.push(0)
    } else {
      dailyReturns.push((curr - prev) / prev)
    }
  }

  // --- Sharpe ratio (annualized, rf=0) ---
  const sharpe = computeSharpe(dailyReturns)

  // --- Max drawdown ---
  const maxDrawdown = computeMaxDrawdown(values)

  // --- Win rate ---
  const winRate = calculateWinRate(trades, positionAvgCosts)

  // --- SPY diff ---
  let spyReturn = 0
  if (spySnapshots.length >= 2) {
    const spyBase = Number(spySnapshots[0].close)
    const spyLast = Number(spySnapshots[spySnapshots.length - 1].close)
    if (spyBase !== 0 && Number.isFinite(spyBase) && Number.isFinite(spyLast)) {
      spyReturn = ((spyLast - spyBase) / spyBase) * 100
    }
  }
  const spyDiff = calculateSpyDiff(totalReturn, spyReturn)

  return {
    totalReturn,
    spyDiff,
    sharpe,
    maxDrawdown,
    winRate,
    tradeCount: trades.length,
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function computeSharpe(dailyReturns: readonly number[]): number {
  if (dailyReturns.length === 0) return 0

  const mean =
    dailyReturns.reduce((sum, r) => sum + r, 0) / dailyReturns.length

  const variance =
    dailyReturns.reduce((sum, r) => sum + (r - mean) ** 2, 0) /
    dailyReturns.length
  const stddev = Math.sqrt(variance)

  if (stddev === 0) return 0

  return (mean / stddev) * Math.sqrt(TRADING_DAYS_PER_YEAR)
}

function computeMaxDrawdown(values: readonly number[]): number {
  if (values.length < 2) return 0

  let peak = values[0]
  let maxDd = 0

  for (const v of values) {
    if (v > peak) peak = v
    if (peak !== 0) {
      const dd = ((peak - v) / peak) * 100
      if (dd > maxDd) maxDd = dd
    }
  }

  return maxDd
}
