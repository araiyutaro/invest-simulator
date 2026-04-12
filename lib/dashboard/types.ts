// Dashboard shared type definitions (Phase 04-02).
// NOTE: This file intentionally does NOT include `import 'server-only'`.
// It exports pure type declarations that are consumed by both server modules
// and client components (e.g. chart props), so it must stay isomorphic.

export type ChartPoint = {
  readonly time: string // YYYY-MM-DD
  readonly value: number // %リターン or 絶対値
}

export type PerformanceMetrics = {
  readonly totalReturn: number // 累計リターン %
  readonly spyDiff: number // vs SPY差分 %
  readonly sharpe: number // シャープレシオ（年率換算）
  readonly maxDrawdown: number // 最大ドローダウン % (正の値)
  readonly winRate: number | null // 勝率 % (SELL取引なしの場合null)
  readonly tradeCount: number // 取引数
}

export type PositionWithPrice = {
  readonly symbol: string
  readonly quantity: number
  readonly avgCost: number // 取得平均価格
  readonly currentPrice: number // 最新終値
  readonly currency: string
  readonly unrealizedPnl: number // 含み損益（JPY建て）
  readonly allocation: number // 配分比率 %
}

export type AllocationSlice = {
  readonly name: string
  readonly value: number // 時価評価額 JPY
}

export type TimelineTrade = {
  readonly ticker: string
  readonly action: 'BUY' | 'SELL'
  readonly quantity: number
  readonly executedPrice: number
  readonly currency: string
  readonly confidence: 'high' | 'medium' | 'low'
  readonly reasoning: string
}

export type TimelineDay = {
  readonly date: string // YYYY-MM-DD
  readonly marketAssessment: string
  readonly trades: readonly TimelineTrade[]
}
