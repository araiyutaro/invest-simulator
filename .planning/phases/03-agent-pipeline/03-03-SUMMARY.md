---
phase: 03-agent-pipeline
plan: 03
subsystem: api
tags: [drizzle-orm, postgres, vitest, tdd, virtual-trading, portfolio]

# Dependency graph
requires:
  - phase: 03-01
    provides: "GeminiDecisionItem, ExecutionResult, TradeResult, SkippedDecision types"
  - phase: 01-foundation
    provides: "db/schema.ts (trades, positions, portfolios tables), db/index.ts Drizzle client"
provides:
  - "executeDecisions() — Gemini判断を仮想ポートフォリオに安全に反映する売買執行ロジック"
  - "BUY/SELLの残高・保有チェック、USD/JPY FX換算、加重平均avgCost更新"
  - "TDD 13テストケース (executor.test.ts)"
affects:
  - "03-04 (daily-run route handler — executeDecisions()を呼び出す)"
  - "04-dashboard (trades/positions/portfolios テーブルを読み取る)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TDD: テストファイル先行作成 → RED確認 → 実装でGREEN化"
    - "DBモック: vi.mock('@/db/index') + thenable mock でチェーンAPIを模倣"
    - "server-only guard: lib/agent/executor.ts冒頭に import 'server-only'"
    - "Drizzle onConflictDoUpdate: positions UPSERT for BUY (portfolioId, symbol) unique制約"
    - "immutable running cash: let runningCash で順次BUY時の残高追跡"

key-files:
  created:
    - lib/agent/executor.ts
    - lib/agent/executor.test.ts
  modified: []

key-decisions:
  - "D-11遵守: SELL後quantity=0のpositionsレコードは削除せずquantity=0で保持（過去履歴保持）"
  - "USD銘柄fxRateNull時はno_fx_rateでスキップ（不正な0円取引を防止）"
  - "加重平均avgCostはUSD銘柄でもclosePrice（USD建て）で計算し、costJpy換算はFXレート×株数×価格"
  - "TDDテストのDBモックはthenable+onConflictDoUpdateチェーンをObject.assign(Promise.resolve([]), obj)パターンで解決"

patterns-established:
  - "Pattern: vitest で Drizzle insert().values().onConflictDoUpdate() チェーンをモックする方法 — Object.assign(Promise.resolve([]), { onConflictDoUpdate: vi.fn().mockResolvedValue([]) })"

requirements-completed:
  - EXEC-02
  - EXEC-03
  - EXEC-04
  - EXEC-05

# Metrics
duration: 20min
completed: 2026-04-12
---

# Phase 3 Plan 03: executor.ts Summary

**仮想売買執行ロジック (executeDecisions) — BUY/SELL/HOLD判断を現金・保有チェック付きでtrades/positions/portfoliosに反映、USD銘柄FX換算・加重平均avgCost・quantity=0保持を含む13テストケースでTDD完了**

## Performance

- **Duration:** 20 min
- **Started:** 2026-04-12T07:15:00Z
- **Completed:** 2026-04-12T07:35:00Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments

- `executeDecisions()` 関数を実装 — Gemini判断JSONを受けて仮想売買を安全に執行する
- BUY残高チェック（insufficient_cash）、SELL保有チェック（insufficient_shares）でLLM指示の不正取引を拒否
- USD銘柄のfxRateUsdJpy変換、fxRateNull時のno_fx_rateスキップ
- 加重平均avgCost更新 `(existQty*existAvgCost + buyQty*price) / (existQty+buyQty)`
- D-11: SELL後quantity=0のpositionsレコードを削除せず保持
- 13テストケースがTDDで全green

## Task Commits

1. **Task 1: executor.ts — 仮想売買執行ロジック** - `6fafb68` (feat)

## Files Created/Modified

- `/lib/agent/executor.ts` — 仮想売買執行ロジック本体（import 'server-only'、executeDecisions()エクスポート）
- `/lib/agent/executor.test.ts` — TDDテスト13ケース（BUY/SELL/HOLD/FX/avgCost/エッジケース）

## Decisions Made

- USD銘柄のavgCostはUSD建て価格で計算（costJpyはFXレート変換）。この分離により将来的なFXレート変動でも元コストの追跡が一貫する
- Drizzle `onConflictDoUpdate` の target 配列は `[positions.portfolioId, positions.symbol]` — UNIQUE制約と一致
- テストモックパターン: `Object.assign(Promise.resolve([]), { onConflictDoUpdate: vi.fn().mockResolvedValue([]) })` でDrizzleのinsertチェーンを模倣

## Deviations from Plan

なし — プラン通りに実行。

ただし、テスト実行中にDBモックの`onConflictDoUpdate`が`undefined`になる問題（Rule 3相当）を自動解決:

### Auto-fixed Issues

**1. [Rule 3 - Blocking] DBモックのonConflictDoUpdateチェーン未対応**
- **Found during:** Task 1 GREEN フェーズ（テスト実行時）
- **Issue:** `db.insert(...).values(...).onConflictDoUpdate is not a function` — シンプルな `mockResolvedValue` ではinsert後のチェーンAPIが存在しない
- **Fix:** `Object.assign(Promise.resolve([]), { onConflictDoUpdate: vi.fn().mockResolvedValue([]) })` パターンでthenableかつonConflictDoUpdateをサポートするモックオブジェクトを構築
- **Files modified:** lib/agent/executor.test.ts
- **Verification:** 13テスト全green
- **Committed in:** 6fafb68

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** テストインフラの問題のみ。実装ロジックへの影響なし。

## Issues Encountered

なし

## User Setup Required

なし — 外部サービス設定不要。

## Next Phase Readiness

- `executeDecisions()` が完成し、03-04 daily-run Route Handlerから呼び出す準備が整った
- `ExecuteParams.closePrices` は price_snapshots テーブルからRoute Handler側でクエリして渡す
- `ExecuteParams.currentPositions` は portfolios/positions テーブルからRoute Handler側でクエリして渡す

---
*Phase: 03-agent-pipeline*
*Completed: 2026-04-12*
