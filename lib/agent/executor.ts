import 'server-only'
// lib/agent/executor.ts
// Phase 3 Plan 03: 仮想売買執行ロジック
// Threat mitigations: T-03-06 (残高/保有チェック), T-03-07 (HOLD除外), T-03-08 (server-only)

import { eq, and } from 'drizzle-orm'
import { db } from '@/db/index'
import { trades, positions, portfolios } from '@/db/schema'
import { findTicker } from '@/config/tickers'
import type { GeminiDecisionItem, ExecutionResult, TradeResult, SkippedDecision } from './types'

// ---------------------------------------------------------------------------
// パラメータ型定義
// ---------------------------------------------------------------------------

export type ExecuteParams = {
  readonly decisions: readonly GeminiDecisionItem[]
  readonly portfolioId: string
  readonly decisionId: string
  readonly closePrices: ReadonlyMap<string, number>
  readonly fxRateUsdJpy: number | null
  readonly currentCashJpy: number
  readonly currentPositions: ReadonlyMap<string, { quantity: number; avgCost: number; currency: 'USD' | 'JPY' }>
}

// テストから参照するために再エクスポート
export type ExecutionResultFromExecutor = ExecutionResult

// ---------------------------------------------------------------------------
// メイン関数
// ---------------------------------------------------------------------------

/**
 * Geminiの判断結果を受けて仮想売買を執行する。
 *
 * - BUY: 現金残高チェック → trades INSERT → positions UPSERT（avgCost加重平均）→ cash減少
 * - SELL: 保有数量チェック → trades INSERT → positions UPDATE（quantity減少）→ cash増加
 * - HOLD: 完全無視（trades/skippedに記録しない）
 * - USD銘柄: fxRateUsdJpyでJPY換算。fxRateがnullなら skip (no_fx_rate)
 */
export async function executeDecisions(params: ExecuteParams): Promise<ExecutionResult> {
  const {
    decisions,
    portfolioId,
    decisionId,
    closePrices,
    fxRateUsdJpy,
    currentCashJpy,
    currentPositions,
  } = params

  // HOLD を除外（D-07: HOLDは実行しない）
  const actionable = decisions.filter((d) => d.action !== 'HOLD')

  let runningCash = currentCashJpy
  const executedTrades: TradeResult[] = []
  const skippedDecisions: SkippedDecision[] = []

  for (const decision of actionable) {
    const { ticker, action, quantity } = decision

    // Close価格チェック
    const closePrice = closePrices.get(ticker)
    if (closePrice === undefined) {
      skippedDecisions.push({ ticker, action, reason: 'no_close_price' })
      continue
    }

    // ticker設定からcurrency取得
    const tickerConfig = findTicker(ticker)
    const currency: 'USD' | 'JPY' = tickerConfig?.currency ?? 'JPY'

    // USD銘柄のFXレートチェック
    if (currency === 'USD' && fxRateUsdJpy === null) {
      skippedDecisions.push({ ticker, action, reason: 'no_fx_rate' })
      continue
    }

    const fxRate = currency === 'USD' ? fxRateUsdJpy! : null
    const amountJpy = currency === 'USD'
      ? closePrice * quantity * fxRateUsdJpy!
      : closePrice * quantity

    if (action === 'BUY') {
      // 現金残高チェック（D-08, EXEC-03）
      if (runningCash < amountJpy) {
        skippedDecisions.push({ ticker, action, reason: 'insufficient_cash' })
        continue
      }

      // cash減少（順番重要: 複数BUYの連続処理に影響する）
      runningCash -= amountJpy

      // avgCost加重平均計算（Pattern 5）
      const existingPosition = currentPositions.get(ticker)
      const existQty = existingPosition?.quantity ?? 0
      const existAvgCost = existingPosition?.avgCost ?? 0

      const newAvgCost = existQty > 0
        ? (existQty * existAvgCost + quantity * closePrice) / (existQty + quantity)
        : closePrice

      // DB: trades INSERT
      await db.insert(trades).values({
        portfolioId,
        decisionId,
        symbol: ticker,
        action: 'BUY',
        quantity,
        executedPrice: closePrice.toString(),
        commission: '0',
        currency,
        fxRateToJpy: fxRate !== null ? fxRate.toString() : null,
      })

      // DB: positions UPSERT（onConflictDoUpdate）
      await db.insert(positions).values({
        portfolioId,
        symbol: ticker,
        exchange: tickerConfig?.market ?? 'US',
        quantity: existQty + quantity,
        avgCost: newAvgCost.toString(),
        currency,
      }).onConflictDoUpdate({
        target: [positions.portfolioId, positions.symbol],
        set: {
          quantity: existQty + quantity,
          avgCost: newAvgCost.toString(),
          updatedAt: new Date(),
        },
      })

      executedTrades.push({
        symbol: ticker,
        action: 'BUY',
        quantity,
        executedPrice: closePrice,
        currency,
        fxRateToJpy: fxRate,
        costJpy: amountJpy,
      })
    } else if (action === 'SELL') {
      // 保有数量チェック（D-09, D-11, EXEC-03, Pitfall 5）
      const existingPosition = currentPositions.get(ticker)
      const existQty = existingPosition?.quantity ?? 0

      if (existQty < quantity) {
        skippedDecisions.push({ ticker, action, reason: 'insufficient_shares' })
        continue
      }

      // cash増加
      runningCash += amountJpy

      // DB: trades INSERT
      await db.insert(trades).values({
        portfolioId,
        decisionId,
        symbol: ticker,
        action: 'SELL',
        quantity,
        executedPrice: closePrice.toString(),
        commission: '0',
        currency,
        fxRateToJpy: fxRate !== null ? fxRate.toString() : null,
      })

      // DB: positions UPDATE（quantity減少、D-11: quantity=0でも削除しない）
      const newQty = existQty - quantity
      await db.update(positions)
        .set({ quantity: newQty, updatedAt: new Date() })
        .where(and(
          eq(positions.portfolioId, portfolioId),
          eq(positions.symbol, ticker),
        ))

      executedTrades.push({
        symbol: ticker,
        action: 'SELL',
        quantity,
        executedPrice: closePrice,
        currency,
        fxRateToJpy: fxRate,
        costJpy: amountJpy,
      })
    }
  }

  // DB: portfolios.cash を更新
  await db.update(portfolios)
    .set({ cash: runningCash.toString() })
    .where(eq(portfolios.id, portfolioId))

  return {
    trades: executedTrades,
    skipped: skippedDecisions,
    newCashJpy: runningCash,
  }
}
