// lib/agent/types.ts
// Phase 3 Agent Pipeline: shared types and zod schemas
// NOTE: 'server-only' is intentionally omitted — this file exports pure types
// and schemas used by both server-side modules and tests.

import { z } from 'zod'

// ---------------------------------------------------------------------------
// GeminiDecisionItem zod schema (D-07)
// ---------------------------------------------------------------------------

export const GeminiDecisionItemSchema = z.object({
  ticker: z.string().min(1),
  action: z.preprocess(
    (v) => (typeof v === 'string' ? v.toUpperCase() : v),
    z.enum(['BUY', 'SELL', 'HOLD']),
  ),
  quantity: z.number().int().nonnegative(),
  confidence: z.preprocess(
    (v) => (typeof v === 'string' ? v.toLowerCase() : v),
    z.enum(['high', 'medium', 'low']),
  ),
  reasoning: z.string().min(1),
})

export type GeminiDecisionItem = z.infer<typeof GeminiDecisionItemSchema>

// ---------------------------------------------------------------------------
// GeminiResponse zod schema
// ---------------------------------------------------------------------------

export const GeminiResponseSchema = z.object({
  market_assessment: z.string().min(1),
  decisions: z.array(GeminiDecisionItemSchema),
})

export type GeminiResponse = z.infer<typeof GeminiResponseSchema>

// ---------------------------------------------------------------------------
// PromptContext — input to prompt-builder
// ---------------------------------------------------------------------------

export type TickerData = {
  readonly symbol: string
  readonly name: string
  readonly market: 'US' | 'JP'
  readonly currency: 'USD' | 'JPY'
  readonly latestClose: number | null
  readonly priceHistory: readonly number[] // 直近100営業日のclose
  readonly news: readonly { headline: string; publishedAt: string | null }[]
  readonly fundamentals: {
    peRatio: number | null
    eps: number | null
    marketCap: number | null
    week52High: number | null
    week52Low: number | null
  } | null
  readonly indicators: {
    rsi14: number | null
    macd: { MACD: number; signal: number; histogram: number } | null
    sma20: number | null
    sma50: number | null
  }
}

export type PortfolioContext = {
  readonly portfolioId: string
  readonly cashJpy: number
  readonly positions: readonly {
    symbol: string
    quantity: number
    avgCost: number
    currency: 'USD' | 'JPY'
  }[]
}

export type PromptContext = {
  readonly runDate: string // YYYY-MM-DD
  readonly tickers: readonly TickerData[]
  readonly portfolio: PortfolioContext
  readonly fxRateUsdJpy: number | null
}

// ---------------------------------------------------------------------------
// ExecutionResult — output from trade executor
// ---------------------------------------------------------------------------

export type TradeResult = {
  readonly symbol: string
  readonly action: 'BUY' | 'SELL'
  readonly quantity: number
  readonly executedPrice: number
  readonly currency: 'USD' | 'JPY'
  readonly fxRateToJpy: number | null
  readonly costJpy: number
}

export type SkippedDecision = {
  readonly ticker: string
  readonly action: string
  readonly reason: string
}

export type ExecutionResult = {
  readonly trades: readonly TradeResult[]
  readonly skipped: readonly SkippedDecision[]
  readonly newCashJpy: number
}

// ---------------------------------------------------------------------------
// Token cost estimation (AGENT-07)
// Gemini 2.5 Flash pricing [VERIFIED: ai.google.dev 2026-04-12]
// ---------------------------------------------------------------------------

export const GEMINI_INPUT_PRICE_PER_TOKEN = 0.30 / 1_000_000
export const GEMINI_OUTPUT_PRICE_PER_TOKEN = 2.50 / 1_000_000

export function estimateTokenCostUsd(
  promptTokens: number,
  candidateTokens: number,
): number {
  return (
    promptTokens * GEMINI_INPUT_PRICE_PER_TOKEN +
    candidateTokens * GEMINI_OUTPUT_PRICE_PER_TOKEN
  )
}
