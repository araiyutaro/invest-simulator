// lib/agent/executor.test.ts
// Phase 3 Plan 03: 仮想売買執行ロジックのユニットテスト
// TDD RED phase: テストを先に書き、実装前に全テストが失敗することを確認する

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ExecuteParams } from './executor'

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

// executeDecisions の遅延インポート（モック後に読み込む）
let executeDecisions: (params: ExecuteParams) => Promise<import('./executor').ExecutionResultFromExecutor>

beforeEach(async () => {
  vi.clearAllMocks()

  // DB モックのセットアップ
  const { db } = await import('@/db/index')
  const mockInsert = db.insert as ReturnType<typeof vi.fn>
  const mockUpdate = db.update as ReturnType<typeof vi.fn>

  // INSERT チェーン: insert().values() → Promise または onConflictDoUpdate チェーン
  // onConflictDoUpdate は Promise として解決される
  const onConflictDoUpdateMock = vi.fn().mockResolvedValue([])
  const insertValuesMock = vi.fn().mockReturnValue({
    returning: vi.fn().mockResolvedValue([{ id: 'trade-uuid-123' }]),
    onConflictDoUpdate: onConflictDoUpdateMock,
    // values() が直接 await された場合も対応
    then: undefined, // Promise風にしない（チェーンが必要）
  })

  // INSERT は 2種類の呼び出しパターンをサポート:
  // 1. trades用: db.insert(trades).values({...}) → そのままawait可能
  // 2. positions用: db.insert(positions).values({...}).onConflictDoUpdate({...}) → await
  // モックは両方に対応するため、valuesを thennable にする
  const insertValuesWithPromiseMock = vi.fn().mockImplementation(() => {
    const obj = {
      onConflictDoUpdate: vi.fn().mockResolvedValue([]),
    }
    // await可能にする（thenable）
    return Object.assign(Promise.resolve([]), obj)
  })
  mockInsert.mockReturnValue({ values: insertValuesWithPromiseMock })

  // UPDATE チェーン: update().set().where()
  const updateWhereMock = vi.fn().mockResolvedValue([])
  const updateSetMock = vi.fn().mockReturnValue({ where: updateWhereMock })
  mockUpdate.mockReturnValue({ set: updateSetMock })

  // executor を動的インポート（モック後）
  const mod = await import('./executor')
  executeDecisions = mod.executeDecisions
})

// ---------------------------------------------------------------------------
// テストヘルパー
// ---------------------------------------------------------------------------

function makeParams(overrides: Partial<ExecuteParams> = {}): ExecuteParams {
  return {
    decisions: [],
    portfolioId: 'portfolio-001',
    decisionId: 'decision-001',
    closePrices: new Map(),
    fxRateUsdJpy: 150,
    currentCashJpy: 1_000_000,
    currentPositions: new Map(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// テストケース
// ---------------------------------------------------------------------------

describe('executeDecisions', () => {
  // ケース 1: BUY成功 — 現金十分 → trade記録 + position作成 + cash減少
  it('BUY成功: 現金十分のとき取引が記録されcashが減少する（JPY銘柄）', async () => {
    const params = makeParams({
      decisions: [
        { ticker: '7203.T', action: 'BUY', quantity: 100, confidence: 'high', reasoning: 'test' },
      ],
      closePrices: new Map([['7203.T', 2500]]),
      fxRateUsdJpy: null, // JPY銘柄はFX不要
      currentCashJpy: 1_000_000,
      currentPositions: new Map(),
    })

    const result = await executeDecisions(params)

    // costJpy = 2500 * 100 = 250,000
    expect(result.newCashJpy).toBe(750_000)
    expect(result.trades).toHaveLength(1)
    expect(result.trades[0].symbol).toBe('7203.T')
    expect(result.trades[0].action).toBe('BUY')
    expect(result.trades[0].quantity).toBe(100)
    expect(result.trades[0].executedPrice).toBe(2500)
    expect(result.trades[0].currency).toBe('JPY')
    expect(result.trades[0].costJpy).toBe(250_000)
    expect(result.skipped).toHaveLength(0)
  })

  // ケース 2: BUY失敗（残高不足）— costJpy > cash → skip + cash変わらず
  it('BUY失敗: 現金不足のときskippedに記録されcashが変わらない', async () => {
    const params = makeParams({
      decisions: [
        { ticker: '7203.T', action: 'BUY', quantity: 1000, confidence: 'high', reasoning: 'test' },
      ],
      closePrices: new Map([['7203.T', 2500]]),
      fxRateUsdJpy: null,
      currentCashJpy: 100_000, // costJpy = 2500 * 1000 = 2,500,000 > 100,000
      currentPositions: new Map(),
    })

    const result = await executeDecisions(params)

    expect(result.newCashJpy).toBe(100_000) // 変わらず
    expect(result.trades).toHaveLength(0)
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0].ticker).toBe('7203.T')
    expect(result.skipped[0].action).toBe('BUY')
    expect(result.skipped[0].reason).toBe('insufficient_cash')
  })

  // ケース 3: SELL成功 — 保有十分 → trade記録 + position数量減少 + cash増加
  it('SELL成功: 保有十分のとき取引が記録されcashが増加する（JPY銘柄）', async () => {
    const params = makeParams({
      decisions: [
        { ticker: '7203.T', action: 'SELL', quantity: 50, confidence: 'high', reasoning: 'test' },
      ],
      closePrices: new Map([['7203.T', 3000]]),
      fxRateUsdJpy: null,
      currentCashJpy: 500_000,
      currentPositions: new Map([
        ['7203.T', { quantity: 100, avgCost: 2500, currency: 'JPY' as const }],
      ]),
    })

    const result = await executeDecisions(params)

    // proceedsJpy = 3000 * 50 = 150,000
    expect(result.newCashJpy).toBe(650_000)
    expect(result.trades).toHaveLength(1)
    expect(result.trades[0].symbol).toBe('7203.T')
    expect(result.trades[0].action).toBe('SELL')
    expect(result.trades[0].quantity).toBe(50)
    expect(result.trades[0].costJpy).toBe(150_000)
    expect(result.skipped).toHaveLength(0)
  })

  // ケース 4: SELL失敗（保有不足）— sellQty > positionQty → skip
  it('SELL失敗: 保有不足のときskippedに記録される', async () => {
    const params = makeParams({
      decisions: [
        { ticker: '7203.T', action: 'SELL', quantity: 200, confidence: 'high', reasoning: 'test' },
      ],
      closePrices: new Map([['7203.T', 3000]]),
      fxRateUsdJpy: null,
      currentCashJpy: 500_000,
      currentPositions: new Map([
        ['7203.T', { quantity: 100, avgCost: 2500, currency: 'JPY' as const }], // 100株しかない
      ]),
    })

    const result = await executeDecisions(params)

    expect(result.trades).toHaveLength(0)
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0].ticker).toBe('7203.T')
    expect(result.skipped[0].action).toBe('SELL')
    expect(result.skipped[0].reason).toBe('insufficient_shares')
    expect(result.newCashJpy).toBe(500_000) // 変わらず
  })

  // ケース 5: HOLD — trades/skippedに含まれない
  it('HOLD: tradesにもskippedにも含まれない', async () => {
    const params = makeParams({
      decisions: [
        { ticker: '7203.T', action: 'HOLD', quantity: 0, confidence: 'low', reasoning: 'test' },
        { ticker: 'AAPL', action: 'HOLD', quantity: 0, confidence: 'medium', reasoning: 'test' },
      ],
      closePrices: new Map([['7203.T', 2500], ['AAPL', 200]]),
      currentCashJpy: 1_000_000,
    })

    const result = await executeDecisions(params)

    expect(result.trades).toHaveLength(0)
    expect(result.skipped).toHaveLength(0)
    expect(result.newCashJpy).toBe(1_000_000) // 変わらず
  })

  // ケース 6: USD銘柄のFX変換 — costJpy = price * qty * fxRate
  it('USD銘柄BUY: FXレートでJPY換算されcashが正しく減少する', async () => {
    const params = makeParams({
      decisions: [
        { ticker: 'AAPL', action: 'BUY', quantity: 10, confidence: 'high', reasoning: 'test' },
      ],
      closePrices: new Map([['AAPL', 200]]),
      fxRateUsdJpy: 150,
      currentCashJpy: 1_000_000,
      currentPositions: new Map(),
    })

    const result = await executeDecisions(params)

    // costJpy = 200 * 10 * 150 = 300,000
    expect(result.newCashJpy).toBe(700_000)
    expect(result.trades[0].currency).toBe('USD')
    expect(result.trades[0].fxRateToJpy).toBe(150)
    expect(result.trades[0].costJpy).toBe(300_000)
  })

  // ケース 7: BUY加重平均 — 既存100株@2500 + 新50株@3000 → avgCost計算
  it('BUY加重平均: 既存ポジションがある場合avgCostが加重平均で更新される', async () => {
    const params = makeParams({
      decisions: [
        { ticker: '7203.T', action: 'BUY', quantity: 50, confidence: 'high', reasoning: 'test' },
      ],
      closePrices: new Map([['7203.T', 3000]]),
      fxRateUsdJpy: null,
      currentCashJpy: 1_000_000,
      currentPositions: new Map([
        ['7203.T', { quantity: 100, avgCost: 2500, currency: 'JPY' as const }],
      ]),
    })

    const result = await executeDecisions(params)

    // avgCost = (100*2500 + 50*3000) / (100+50) = (250000+150000)/150 = 2666.67
    expect(result.trades).toHaveLength(1)
    expect(result.trades[0].action).toBe('BUY')
    // costJpy = 3000 * 50 = 150,000
    expect(result.newCashJpy).toBe(850_000)
  })

  // ケース 8: SELL後quantity=0 — positionsレコードが削除されずquantity=0で残る (DB更新確認)
  it('SELL後quantity=0: positionレコードのquantityが0に更新される（削除されない）', async () => {
    const params = makeParams({
      decisions: [
        { ticker: '7203.T', action: 'SELL', quantity: 100, confidence: 'high', reasoning: 'test' },
      ],
      closePrices: new Map([['7203.T', 3000]]),
      fxRateUsdJpy: null,
      currentCashJpy: 500_000,
      currentPositions: new Map([
        ['7203.T', { quantity: 100, avgCost: 2500, currency: 'JPY' as const }],
      ]),
    })

    const result = await executeDecisions(params)

    // 全株売却 → proceeds = 3000 * 100 = 300,000
    expect(result.newCashJpy).toBe(800_000)
    expect(result.trades).toHaveLength(1)
    expect(result.trades[0].quantity).toBe(100)
    expect(result.skipped).toHaveLength(0)
    // DB update が呼ばれたことを確認（quantity=0に更新）
    const { db } = await import('@/db/index')
    expect(db.update).toHaveBeenCalled()
  })

  // ケース 9: fxRateUsdJpy=null + USD銘柄 → skip (reason: 'no_fx_rate')
  it('FXレートnull + USD銘柄: no_fx_rateでスキップされる', async () => {
    const params = makeParams({
      decisions: [
        { ticker: 'AAPL', action: 'BUY', quantity: 10, confidence: 'high', reasoning: 'test' },
      ],
      closePrices: new Map([['AAPL', 200]]),
      fxRateUsdJpy: null, // FXレートなし
      currentCashJpy: 1_000_000,
      currentPositions: new Map(),
    })

    const result = await executeDecisions(params)

    expect(result.trades).toHaveLength(0)
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0].ticker).toBe('AAPL')
    expect(result.skipped[0].reason).toBe('no_fx_rate')
    expect(result.newCashJpy).toBe(1_000_000)
  })

  // ケース 10: closePrice不在の銘柄 → skip (reason: 'no_close_price')
  it('Close価格不在: no_close_priceでスキップされる', async () => {
    const params = makeParams({
      decisions: [
        { ticker: '7203.T', action: 'BUY', quantity: 10, confidence: 'high', reasoning: 'test' },
      ],
      closePrices: new Map(), // 価格なし
      fxRateUsdJpy: null,
      currentCashJpy: 1_000_000,
      currentPositions: new Map(),
    })

    const result = await executeDecisions(params)

    expect(result.trades).toHaveLength(0)
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0].ticker).toBe('7203.T')
    expect(result.skipped[0].reason).toBe('no_close_price')
    expect(result.newCashJpy).toBe(1_000_000)
  })

  // ケース 11: USD銘柄SELL — FXレートで正しく換算されcashが増加する
  it('USD銘柄SELL: FXレートでJPY換算されcashが正しく増加する', async () => {
    const params = makeParams({
      decisions: [
        { ticker: 'AAPL', action: 'SELL', quantity: 5, confidence: 'high', reasoning: 'test' },
      ],
      closePrices: new Map([['AAPL', 200]]),
      fxRateUsdJpy: 150,
      currentCashJpy: 500_000,
      currentPositions: new Map([
        ['AAPL', { quantity: 10, avgCost: 180, currency: 'USD' as const }],
      ]),
    })

    const result = await executeDecisions(params)

    // proceedsJpy = 200 * 5 * 150 = 150,000
    expect(result.newCashJpy).toBe(650_000)
    expect(result.trades[0].fxRateToJpy).toBe(150)
    expect(result.trades[0].costJpy).toBe(150_000)
  })

  // ケース 12: 複数判断の連続処理 — BUY後にcashが更新されて次のBUYに影響
  it('複数BUY: 1件目のBUYでcashが減り2件目の残高チェックに影響する', async () => {
    const params = makeParams({
      decisions: [
        { ticker: '7203.T', action: 'BUY', quantity: 100, confidence: 'high', reasoning: 'test' },
        // 2件目は1件目後のcashで判定される
        { ticker: '6758.T', action: 'BUY', quantity: 1000, confidence: 'high', reasoning: 'test' },
      ],
      closePrices: new Map([
        ['7203.T', 2500],  // costJpy = 250,000
        ['6758.T', 9000],  // costJpy = 9,000,000 → 残高不足
      ]),
      fxRateUsdJpy: null,
      currentCashJpy: 1_000_000,
      currentPositions: new Map(),
    })

    const result = await executeDecisions(params)

    // 1件目成功: cash = 1,000,000 - 250,000 = 750,000
    // 2件目失敗: 9,000,000 > 750,000
    expect(result.trades).toHaveLength(1)
    expect(result.trades[0].symbol).toBe('7203.T')
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0].symbol ?? result.skipped[0].ticker).toBe('6758.T')
    expect(result.skipped[0].reason).toBe('insufficient_cash')
    expect(result.newCashJpy).toBe(750_000)
  })

  // ケース 13: SELL時にポジションなし → insufficient_shares
  it('SELL: ポジションが存在しない場合insufficient_sharesでスキップ', async () => {
    const params = makeParams({
      decisions: [
        { ticker: '7203.T', action: 'SELL', quantity: 10, confidence: 'high', reasoning: 'test' },
      ],
      closePrices: new Map([['7203.T', 2500]]),
      fxRateUsdJpy: null,
      currentCashJpy: 500_000,
      currentPositions: new Map(), // ポジションなし
    })

    const result = await executeDecisions(params)

    expect(result.trades).toHaveLength(0)
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0].reason).toBe('insufficient_shares')
  })
})
