import 'server-only'
// lib/agent/data-loader.ts
// Phase 3 Plan 04: DBからのデータ読み込みとPromptContext組み立て
// Threat mitigations:
//   T-03-12 (Information Disclosure): server-only ガードでクライアントバンドル混入防止
//   T-03-11 (DoS): 冪等INSERTで同日2回実行防止

import { eq, desc } from 'drizzle-orm'
import { db } from '@/db/index'
import {
  portfolios,
  positions,
  decisions,
  priceSnapshots,
  newsSnapshots,
  fundamentalsSnapshots,
  portfolioSnapshots,
  type DecisionTranscript,
} from '@/db/schema'
import { computeIndicators, compressNews } from '@/lib/agent/prompt-builder'
import { fetchMarketData } from '@/lib/market/orchestrator'
import { TICKERS, findTicker } from '@/config/tickers'
import type { PromptContext, TickerData, PortfolioContext } from '@/lib/agent/types'

// ---------------------------------------------------------------------------
// ensurePortfolio (D-13, EXEC-01)
// ---------------------------------------------------------------------------

/**
 * portfoliosテーブルにレコードがなければ initial_cash=10000000 で自動作成する。
 * レコードがある場合は既存のidを返す。
 */
export async function ensurePortfolio(): Promise<string> {
  const existing = await db
    .select({ id: portfolios.id })
    .from(portfolios)
    .limit(1)

  if (existing.length > 0) return existing[0].id

  const [created] = await db
    .insert(portfolios)
    .values({
      name: 'Default Portfolio',
      baseCurrency: 'JPY',
      initialCash: '10000000.0000', // 1,000万JPY
      cash: '10000000.0000',
    })
    .returning({ id: portfolios.id })

  return created.id
}

// ---------------------------------------------------------------------------
// ensureMarketData (Pitfall 3対策)
// ---------------------------------------------------------------------------

/**
 * 当日のprice_snapshotsが0件なら fetchMarketData({ mode: 'incremental' }) を呼び出す。
 */
export async function ensureMarketData(runDate: string): Promise<void> {
  const existing = await db
    .select({ id: priceSnapshots.id })
    .from(priceSnapshots)
    .where(eq(priceSnapshots.priceDate, runDate))
    .limit(1)

  if (existing.length > 0) return

  await fetchMarketData({ mode: 'incremental' })
}

// ---------------------------------------------------------------------------
// loadPromptContext
// ---------------------------------------------------------------------------

/**
 * price_snapshots/news_snapshots/fundamentals_snapshots/positionsからデータを読み込み
 * PromptContext型を返す。
 * numericカラム（close, avgCost等）はparseFloat()で数値に変換する（Pitfall 4対策）。
 */
export async function loadPromptContext(
  portfolioId: string,
  runDate: string,
): Promise<PromptContext> {
  // ポートフォリオのcash取得
  const [portfolio] = await db
    .select({ cash: portfolios.cash })
    .from(portfolios)
    .where(eq(portfolios.id, portfolioId))
    .limit(1)

  const cashJpy = portfolio ? parseFloat(portfolio.cash) : 0

  // ポジション取得
  const rawPositions = await db
    .select({
      symbol: positions.symbol,
      quantity: positions.quantity,
      avgCost: positions.avgCost,
      currency: positions.currency,
    })
    .from(positions)
    .where(eq(positions.portfolioId, portfolioId))

  const portfolioPositions = rawPositions
    .filter((p) => p.quantity > 0)
    .map((p) => ({
      symbol: p.symbol,
      quantity: p.quantity,
      avgCost: parseFloat(p.avgCost), // Pitfall 4: numeric文字列 → 数値変換
      currency: p.currency as 'USD' | 'JPY',
    }))

  // FXレート取得: JPYUSD = USD/JPY レート（1ドル何円か）
  const fxRow = await db
    .select({ close: priceSnapshots.close })
    .from(priceSnapshots)
    .where(eq(priceSnapshots.symbol, 'JPYUSD'))
    .orderBy(desc(priceSnapshots.priceDate))
    .limit(1)

  const fxRateUsdJpy =
    fxRow.length > 0 && fxRow[0].close !== null
      ? parseFloat(fxRow[0].close)
      : null

  // 各ティッカーのデータ取得
  const tickerDataList: TickerData[] = []

  for (const ticker of TICKERS) {
    const tickerConfig = findTicker(ticker.symbol)
    if (!tickerConfig) continue

    // 直近100営業日のclose価格（降順取得、指標計算用に昇順に変換）
    const priceRows = await db
      .select({
        close: priceSnapshots.close,
        priceDate: priceSnapshots.priceDate,
      })
      .from(priceSnapshots)
      .where(eq(priceSnapshots.symbol, ticker.symbol))
      .orderBy(desc(priceSnapshots.priceDate))
      .limit(100)

    // 降順→昇順（computeIndicatorsは時系列順を期待）
    const closePrices = priceRows
      .reverse()
      .map((r) => (r.close !== null ? parseFloat(r.close) : null))
      .filter((v): v is number => v !== null)

    const latestClose = closePrices.length > 0 ? closePrices[closePrices.length - 1] : null

    // TA指標計算
    const indicators = computeIndicators(closePrices)

    // ニュース取得（最新newsDateの上位10件）
    const newsRows = await db
      .select({
        headline: newsSnapshots.headline,
        publishedAt: newsSnapshots.publishedAt,
      })
      .from(newsSnapshots)
      .where(eq(newsSnapshots.symbol, ticker.symbol))
      .orderBy(desc(newsSnapshots.publishedAt))
      .limit(10)

    const news = newsRows.map((n) => ({
      headline: n.headline,
      publishedAt: n.publishedAt ? n.publishedAt.toISOString() : null,
    }))

    // ファンダメンタル取得
    const fundRows = await db
      .select({
        peRatio: fundamentalsSnapshots.peRatio,
        eps: fundamentalsSnapshots.eps,
        marketCap: fundamentalsSnapshots.marketCap,
        week52High: fundamentalsSnapshots.week52High,
        week52Low: fundamentalsSnapshots.week52Low,
      })
      .from(fundamentalsSnapshots)
      .where(eq(fundamentalsSnapshots.symbol, ticker.symbol))
      .orderBy(desc(fundamentalsSnapshots.asOfDate))
      .limit(1)

    const fundamentals =
      fundRows.length > 0
        ? {
            peRatio:
              fundRows[0].peRatio !== null ? parseFloat(fundRows[0].peRatio) : null,
            eps: fundRows[0].eps !== null ? parseFloat(fundRows[0].eps) : null,
            marketCap:
              fundRows[0].marketCap !== null ? parseFloat(fundRows[0].marketCap) : null,
            week52High:
              fundRows[0].week52High !== null ? parseFloat(fundRows[0].week52High) : null,
            week52Low:
              fundRows[0].week52Low !== null ? parseFloat(fundRows[0].week52Low) : null,
          }
        : null

    tickerDataList.push({
      symbol: ticker.symbol,
      name: tickerConfig.name,
      market: tickerConfig.market as 'US' | 'JP',
      currency: tickerConfig.currency as 'USD' | 'JPY',
      latestClose,
      priceHistory: closePrices,
      news,
      fundamentals,
      indicators,
    })
  }

  const portfolioContext: PortfolioContext = {
    portfolioId,
    cashJpy,
    positions: portfolioPositions,
  }

  return {
    runDate,
    tickers: tickerDataList,
    portfolio: portfolioContext,
    fxRateUsdJpy,
  }
}

// ---------------------------------------------------------------------------
// saveDecisionRecord (D-16, AGENT-05)
// ---------------------------------------------------------------------------

/**
 * decisionsテーブルにINSERT ON CONFLICT DO NOTHINGで冪等に保存。
 * 既存レコードがあれば inserted=false を返す（同日2回目はスキップ）。
 */
export async function saveDecisionRecord(params: {
  portfolioId: string
  runDate: string
  transcript: DecisionTranscript
  costUsd: number
  modelUsed: string
  summary: string
  confidence: string | null
}): Promise<{ inserted: boolean; decisionId: string | null }> {
  const result = await db
    .insert(decisions)
    .values({
      portfolioId: params.portfolioId,
      runDate: params.runDate,
      transcript: params.transcript,
      tokenCostEstimate: params.costUsd.toFixed(4),
      modelUsed: params.modelUsed,
      summary: params.summary,
      confidence: params.confidence,
    })
    .onConflictDoNothing()
    .returning({ id: decisions.id })

  if (result.length === 0) return { inserted: false, decisionId: null }
  return { inserted: true, decisionId: result[0].id }
}

// ---------------------------------------------------------------------------
// savePortfolioSnapshot (D-12)
// ---------------------------------------------------------------------------

/**
 * portfolio_snapshotsにINSERT ON CONFLICT DO NOTHINGで日次スナップショットを保存。
 */
export async function savePortfolioSnapshot(params: {
  portfolioId: string
  snapshotDate: string
  cashJpy: number
  positionsValueJpy: number
}): Promise<void> {
  const totalValueJpy = params.cashJpy + params.positionsValueJpy
  await db
    .insert(portfolioSnapshots)
    .values({
      portfolioId: params.portfolioId,
      snapshotDate: params.snapshotDate,
      totalValueJpy: totalValueJpy.toFixed(4),
      cashJpy: params.cashJpy.toFixed(4),
      positionsValueJpy: params.positionsValueJpy.toFixed(4),
    })
    .onConflictDoNothing()
}
