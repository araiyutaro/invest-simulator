// lib/agent/data-loader.test.ts
// Phase 3 Plan 04: data-loader のユニットテスト (TDD)
// テスト対象: ensurePortfolio, ensureMarketData, loadPromptContext, saveDecisionRecord, savePortfolioSnapshot

import { describe, it, expect, vi, beforeEach } from 'vitest'

// server-only バイパス
vi.mock('server-only', () => ({}))

// DB モック
vi.mock('@/db/index', () => ({
  db: {
    insert: vi.fn(),
    update: vi.fn(),
    select: vi.fn(),
  },
}))

// fetchMarketData モック
vi.mock('@/lib/market/orchestrator', () => ({
  fetchMarketData: vi.fn().mockResolvedValue({
    ok: ['AAPL', 'MSFT'],
    failed: [],
    marketClosed: [],
    durationMs: 1200,
  }),
}))

// 型インポート
import type {
  ensurePortfolio as EnsurePortfolioFn,
  ensureMarketData as EnsureMarketDataFn,
  loadPromptContext as LoadPromptContextFn,
  saveDecisionRecord as SaveDecisionRecordFn,
  savePortfolioSnapshot as SavePortfolioSnapshotFn,
} from './data-loader'
import type { DecisionTranscript } from '@/db/schema'

// 関数の遅延インポート（モック後に読み込む）
let ensurePortfolio: typeof EnsurePortfolioFn
let ensureMarketData: typeof EnsureMarketDataFn
let loadPromptContext: typeof LoadPromptContextFn
let saveDecisionRecord: typeof SaveDecisionRecordFn
let savePortfolioSnapshot: typeof SavePortfolioSnapshotFn

beforeEach(async () => {
  vi.clearAllMocks()
  vi.resetModules()

  // モジュールの再インポート
  const mod = await import('./data-loader')
  ensurePortfolio = mod.ensurePortfolio
  ensureMarketData = mod.ensureMarketData
  loadPromptContext = mod.loadPromptContext
  saveDecisionRecord = mod.saveDecisionRecord
  savePortfolioSnapshot = mod.savePortfolioSnapshot
})

// ---------------------------------------------------------------------------
// DBモックのヘルパー
// ---------------------------------------------------------------------------

function setupDbMock(opts: {
  selectResult?: unknown[]
  insertReturning?: unknown[]
  insertOnConflictDoNothing?: unknown[]
}) {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(opts.selectResult ?? []),
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(opts.selectResult ?? []),
          }),
        }),
        limit: vi.fn().mockResolvedValue(opts.selectResult ?? []),
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(opts.selectResult ?? []),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(opts.insertReturning ?? []),
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(opts.insertOnConflictDoNothing ?? []),
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
  }
}

// ---------------------------------------------------------------------------
// ensurePortfolio
// ---------------------------------------------------------------------------

describe('ensurePortfolio', () => {
  it('portfoliosが空のとき initial_cash=10000000 でINSERTして新しいidを返す', async () => {
    const { db } = await import('@/db/index')
    const mockDb = setupDbMock({
      selectResult: [],  // 既存レコードなし
      insertReturning: [{ id: 'new-portfolio-uuid' }],
    })
    Object.assign(db, mockDb)

    const id = await ensurePortfolio()

    expect(id).toBe('new-portfolio-uuid')
    expect(db.insert).toHaveBeenCalledOnce()
    // INSERTのvaluesに10000000が含まれることを確認
    const insertCallArg = (db.insert as ReturnType<typeof vi.fn>).mock.results[0].value
    const valuesCallArg = insertCallArg.values.mock.calls[0][0]
    expect(valuesCallArg.cash).toContain('10000000')
    expect(valuesCallArg.initialCash).toContain('10000000')
  })

  it('portfoliosに既存レコードがある場合は既存のidを返す（INSERTなし）', async () => {
    const { db } = await import('@/db/index')
    const mockDb = setupDbMock({
      selectResult: [{ id: 'existing-portfolio-uuid' }],
    })
    Object.assign(db, mockDb)

    const id = await ensurePortfolio()

    expect(id).toBe('existing-portfolio-uuid')
    expect(db.insert).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// ensureMarketData
// ---------------------------------------------------------------------------

describe('ensureMarketData', () => {
  it('当日のprice_snapshotsが0件の場合 fetchMarketData が呼ばれる', async () => {
    const { db } = await import('@/db/index')
    const { fetchMarketData } = await import('@/lib/market/orchestrator')
    const mockDb = setupDbMock({ selectResult: [] })  // データなし
    Object.assign(db, mockDb)

    await ensureMarketData('2026-04-12')

    expect(fetchMarketData).toHaveBeenCalledOnce()
    expect(fetchMarketData).toHaveBeenCalledWith({ mode: 'incremental' })
  })

  it('当日のprice_snapshotsがある場合 fetchMarketData は呼ばれない', async () => {
    const { db } = await import('@/db/index')
    const { fetchMarketData } = await import('@/lib/market/orchestrator')
    const mockDb = setupDbMock({
      selectResult: [{ id: 'some-price-snapshot-id' }],  // データあり
    })
    Object.assign(db, mockDb)

    await ensureMarketData('2026-04-12')

    expect(fetchMarketData).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// saveDecisionRecord
// ---------------------------------------------------------------------------

describe('saveDecisionRecord', () => {
  const mockTranscript: DecisionTranscript = {
    system_prompt: 'system',
    user_prompt: 'user',
    raw_messages: [{ role: 'user', content: 'test' }],
    input_data_snapshot: {
      as_of: '2026-04-12T00:00:00Z',
      universe: ['AAPL'],
      prices: { AAPL: { close: 180 } },
      portfolio: { cashJpy: 10000000, positions: [] },
    },
    usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
  }

  it('新規INSERTの場合 inserted=true と decisionId を返す', async () => {
    const { db } = await import('@/db/index')
    const mockDb = setupDbMock({
      insertOnConflictDoNothing: [{ id: 'decision-uuid-123' }],
    })
    Object.assign(db, mockDb)

    const result = await saveDecisionRecord({
      portfolioId: 'portfolio-uuid',
      runDate: '2026-04-12',
      transcript: mockTranscript,
      costUsd: 0.0015,
      modelUsed: 'gemini-2.5-flash',
      summary: 'Market is bullish',
      confidence: null,
    })

    expect(result.inserted).toBe(true)
    expect(result.decisionId).toBe('decision-uuid-123')
  })

  it('同日2回目のINSERTはDO NOTHINGでスキップ: inserted=false, decisionId=null', async () => {
    const { db } = await import('@/db/index')
    const mockDb = setupDbMock({
      insertOnConflictDoNothing: [],  // 空配列 = 競合でスキップ
    })
    Object.assign(db, mockDb)

    const result = await saveDecisionRecord({
      portfolioId: 'portfolio-uuid',
      runDate: '2026-04-12',
      transcript: mockTranscript,
      costUsd: 0.0015,
      modelUsed: 'gemini-2.5-flash',
      summary: 'Market is bullish',
      confidence: null,
    })

    expect(result.inserted).toBe(false)
    expect(result.decisionId).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// savePortfolioSnapshot
// ---------------------------------------------------------------------------

describe('savePortfolioSnapshot', () => {
  it('totalValueJpy = cashJpy + positionsValueJpy として保存される', async () => {
    const { db } = await import('@/db/index')
    const mockDb = setupDbMock({})
    // insert onConflictDoNothing は返り値不要（voidに近い）
    const onConflictDoNothingMock = vi.fn().mockResolvedValue([])
    mockDb.insert = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: onConflictDoNothingMock,
      }),
    })
    Object.assign(db, mockDb)

    await savePortfolioSnapshot({
      portfolioId: 'portfolio-uuid',
      snapshotDate: '2026-04-12',
      cashJpy: 8000000,
      positionsValueJpy: 2500000,
    })

    expect(db.insert).toHaveBeenCalledOnce()
    const insertCallResult = (db.insert as ReturnType<typeof vi.fn>).mock.results[0].value
    const valuesArg = insertCallResult.values.mock.calls[0][0]

    // totalValueJpy = 8000000 + 2500000 = 10500000
    expect(parseFloat(valuesArg.totalValueJpy)).toBeCloseTo(10500000, 0)
    expect(parseFloat(valuesArg.cashJpy)).toBeCloseTo(8000000, 0)
    expect(parseFloat(valuesArg.positionsValueJpy)).toBeCloseTo(2500000, 0)
    expect(onConflictDoNothingMock).toHaveBeenCalledOnce()
  })
})
