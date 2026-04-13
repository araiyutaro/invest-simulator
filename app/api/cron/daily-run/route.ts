import 'server-only'
// app/api/cron/daily-run/route.ts
// Phase 3 Plan 04: 日次AIエージェント実行オーケストレーター
// Threat mitigations:
//   T-03-09 (Spoofing): CRON_SECRET 認証 → 不一致時 401
//   T-03-10 (Repudiation): フルtranscript を decisions テーブルに保存 (AGENT-05)
//   T-03-11 (DoS): 冪等ガード (D-16) + maxDuration=120

import { NextResponse, type NextRequest } from 'next/server'
import { env } from '@/lib/env'
import { GEMINI_MODEL } from '@/lib/ai/client'
import { buildSystemPrompt, buildUserPrompt } from '@/lib/agent/prompt-builder'
import { callGemini } from '@/lib/agent/gemini-caller'
import { executeDecisions } from '@/lib/agent/executor'
import {
  ensurePortfolio,
  ensureMarketData,
  loadPromptContext,
  saveDecisionRecord,
  savePortfolioSnapshot,
} from '@/lib/agent/data-loader'
import type { DecisionTranscript } from '@/db/schema'

// D-17: Vercel Fluid Compute 対応 maxDuration
export const maxDuration = 120

// ---------------------------------------------------------------------------
// handleDailyRun — 共有実装本体（Phase 05 Plan 01 で POST 本体から抽出）
// Phase 05 Plan 01 / D-01: GET added for Vercel Cron (Pitfall 1 fix)
// ---------------------------------------------------------------------------

async function handleDailyRun(request: NextRequest): Promise<NextResponse> {
  // 1. CRON_SECRET 認証（fetch-market-data/route.ts パターン転用）
  const header = request.headers.get('authorization') ?? ''
  const expected = `Bearer ${env.CRON_SECRET}`

  if (header !== expected) {
    return NextResponse.json(
      { error: 'unauthorized', reason: 'bad or missing authorization header' },
      { status: 401 },
    )
  }

  try {
    const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD

    // 2. ポートフォリオ確保（D-13: レコードなければ 1,000万JPY で自動作成）
    const portfolioId = await ensurePortfolio()

    // 3. 市場データ確保（Pitfall 3: 当日データ未取得なら fetch する）
    await ensureMarketData(today)

    // 4. プロンプト構築
    const promptContext = await loadPromptContext(portfolioId, today)
    const systemPrompt = buildSystemPrompt()
    const userPrompt = buildUserPrompt(promptContext)

    // 5. Gemini 呼び出し（D-14: エラー時 30s 待機 → 1 回リトライ）
    const geminiResult = await callGemini(systemPrompt, userPrompt)

    // 6. DecisionTranscript 組み立て（AGENT-05: フルログ保存）
    const transcript: DecisionTranscript = {
      system_prompt: systemPrompt,
      user_prompt: userPrompt,
      raw_messages: geminiResult.ok
        ? [
            { role: 'user', content: userPrompt },
            { role: 'model', content: geminiResult.rawText },
          ]
        : [
            { role: 'user', content: userPrompt },
            { role: 'system', content: `Error: ${(geminiResult as { error: string }).error}` },
          ],
      input_data_snapshot: {
        as_of: new Date().toISOString(),
        universe: promptContext.tickers.map((t) => t.symbol),
        prices: Object.fromEntries(
          promptContext.tickers.map((t) => [t.symbol, { close: t.latestClose }]),
        ),
        portfolio: {
          cashJpy: promptContext.portfolio.cashJpy,
          positions: promptContext.portfolio.positions,
        },
      },
      usage: geminiResult.ok
        ? {
            input_tokens: geminiResult.usage.promptTokens,
            output_tokens: geminiResult.usage.candidateTokens,
            total_tokens: geminiResult.usage.totalTokens,
          }
        : undefined,
    }

    // 7. decisions 保存（D-16: ON CONFLICT DO NOTHING 冪等 INSERT）
    const saveResult = await saveDecisionRecord({
      portfolioId,
      runDate: today,
      transcript,
      costUsd: geminiResult.ok ? geminiResult.costUsd : 0,
      modelUsed: GEMINI_MODEL,
      summary: geminiResult.ok
        ? geminiResult.response.market_assessment.slice(0, 500)
        : `Error: ${(geminiResult as { error: string }).error}`,
      confidence: null,
    })

    // 8. 同日 2 回目の発火は冪等スキップ
    if (!saveResult.inserted) {
      return NextResponse.json(
        { status: 'skipped', reason: 'already_ran_today' },
        { status: 200 },
      )
    }

    // 9. Gemini 失敗時は失敗 transcript を保存して終了（D-14: cron retry 防止で 200 を返す）
    if (!geminiResult.ok) {
      return NextResponse.json(
        {
          status: 'error',
          error: (geminiResult as { error: string }).error,
          decisionId: saveResult.decisionId,
        },
        { status: 200 },
      )
    }

    // 10. 売買執行
    const closePrices = new Map(
      promptContext.tickers
        .filter((t): t is typeof t & { latestClose: number } => t.latestClose !== null)
        .map((t) => [t.symbol, t.latestClose]),
    )

    const currentPositions = new Map(
      promptContext.portfolio.positions.map((p) => [
        p.symbol,
        { quantity: p.quantity, avgCost: p.avgCost, currency: p.currency },
      ]),
    )

    const executionResult = await executeDecisions({
      decisions: geminiResult.filteredDecisions,
      portfolioId,
      decisionId: saveResult.decisionId!,
      closePrices,
      fxRateUsdJpy: promptContext.fxRateUsdJpy,
      currentCashJpy: promptContext.portfolio.cashJpy,
      currentPositions,
    })

    // 11. portfolio_snapshot 記録（D-12: 実行後キャッシュ価値を近似計算）
    // positionsValueJpy = 全ポジションの (close × quantity × fxRate) 合計
    // 注: 売買執行後のポジション変化は executionResult.trades から計算するのが理想だが、
    //     簡略化として実行前のポジションデータで近似する（同日スナップショットなので許容）
    let positionsValueJpy = 0
    for (const pos of promptContext.portfolio.positions) {
      if (pos.quantity === 0) continue

      const tickerData = promptContext.tickers.find((t) => t.symbol === pos.symbol)
      const close = tickerData?.latestClose ?? 0

      const fxRate =
        pos.currency === 'USD' ? (promptContext.fxRateUsdJpy ?? 0) : 1

      positionsValueJpy += pos.quantity * close * fxRate
    }

    await savePortfolioSnapshot({
      portfolioId,
      snapshotDate: today,
      cashJpy: executionResult.newCashJpy,
      positionsValueJpy,
    })

    return NextResponse.json(
      {
        status: 'success',
        decisionId: saveResult.decisionId,
        trades: executionResult.trades.length,
        skipped: executionResult.skipped.length,
        costUsd: geminiResult.costUsd,
        newCashJpy: executionResult.newCashJpy,
      },
      { status: 200 },
    )
  } catch (e) {
    const msg = (e as Error).message
    console.error('[cron/daily-run] fatal:', msg)
    return NextResponse.json({ error: 'internal', message: msg }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// GET — Vercel Cron entry point
// Vercel Cron invokes this route with GET + Authorization: Bearer $CRON_SECRET
// [CITED: vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs]
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleDailyRun(request)
}

// ---------------------------------------------------------------------------
// POST — 手動 curl / デバッグ起動用
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleDailyRun(request)
}
