---
phase: 04-dashboard
plan: 02
subsystem: dashboard-data-layer
tags: [tdd, dashboard, metrics, queries, drizzle, server-only]
requires:
  - db/schema.ts (portfolioSnapshots, positions, trades, decisions, priceSnapshots, portfolios)
  - lib/agent/types.ts (GeminiResponse, GeminiDecisionItem)
provides:
  - lib/dashboard/types.ts (ChartPoint, PerformanceMetrics, PositionWithPrice, AllocationSlice, TimelineDay, TimelineTrade)
  - lib/dashboard/metrics.ts (normalizeToPercent, calculateMetrics, calculateWinRate, calculateSpyDiff)
  - lib/dashboard/queries.ts (parseTimelineFromDecision, getPortfolioId, getChartData, getPositionsWithPrices, getTimelineData, getPerformanceData)
affects:
  - Phase 04 Plan 03/04 UI components (consume this data layer)
tech-stack:
  patterns:
    - server-only guard on all DB modules
    - pure function extraction for unit-testable transcript parsing
    - Drizzle ORM parameterized queries (SQL injection mitigation)
    - numeric(18,4) columns returned as strings, Number() coerced at boundary
key-files:
  created:
    - lib/dashboard/types.ts
    - lib/dashboard/metrics.ts
    - lib/dashboard/metrics.test.ts
    - lib/dashboard/queries.ts
    - lib/dashboard/queries.test.ts
decisions:
  - Sharpe ratio annualized with 252 trading days, rf=0 (D-18 simplification)
  - normalizeToPercent returns all-zero series when base=0 (divide-by-zero guard)
  - calculateWinRate returns null (not 0) when no SELL trades exist — distinguishes "undefined" from "0%"
  - parseTimelineFromDecision extracted as a pure function so it can be unit-tested without DB mocks
  - getTimelineData drops transcript entries without matching executed trade rows — only actually-executed BUY/SELL appear on the timeline (D-12)
  - AllocationSlice includes a CASH entry as the last element so the pie chart can render cash vs positions naturally (D-09)
metrics:
  duration: ~12m
  completed: 2026-04-12
  tasks: 2
  tests_added: 14
  files_created: 5
requirements:
  - DASH-01
  - DASH-02
  - DASH-03
  - DASH-04
  - DASH-05
---

# Phase 04 Plan 02: Dashboard Data Layer Summary

Phase 04 ダッシュボードの計算ロジック + DBクエリレイヤーをTDDで構築し、Plan 03/04 のUIコンポーネントがテスト済みデータを受け取れる基盤を確立した。

## What Shipped

- **`lib/dashboard/types.ts`**: 型定義（`ChartPoint`, `PerformanceMetrics`, `PositionWithPrice`, `AllocationSlice`, `TimelineDay`, `TimelineTrade`）。`server-only` を付けず、Server Component と Client Component の両方で import 可能なピュアな型ファイル。
- **`lib/dashboard/metrics.ts`**: パフォーマンス指標の純粋計算関数。`server-only` ガード付き。
  - `normalizeToPercent`: 3系列チャート重ね表示用の %正規化（D-06）
  - `calculateMetrics`: 6指標まとめて計算（累計リターン・SPY差分・シャープ・最大DD・勝率・取引数）
  - `calculateWinRate`: SELL取引のうち勝ちの比率（SELLなし → null）
  - `calculateSpyDiff`: ポートフォリオ vs SPY の単純差分
- **`lib/dashboard/queries.ts`**: Drizzle クエリレイヤー + transcript パーサー。`server-only` ガード付き。
  - `parseTimelineFromDecision`: JSONB transcript → `{ marketAssessment, trades[] }` のピュア変換。BUY/SELLのみフィルタ、不正形式は空配列で safe fallback（T-04-03 mitigate）
  - `getPortfolioId`: 単一ポートフォリオのID取得
  - `getChartData`: ポートフォリオ・SPY・1306.T の時系列を並列取得
  - `getPositionsWithPrices`: 含み損益（USD は fxRateToJpy で JPY 換算）+ 配分比率 + CASH エントリ
  - `getTimelineData`: decisions × trades JOIN で実約定した BUY/SELL のみをタイムラインに表出
  - `getPerformanceData`: `calculateMetrics` に投入する一括データ（snapshots + SPY + trades + avgCosts）

## Task Log

| # | Task | Commit | Tests |
|---|------|--------|-------|
| 1 | 型定義 + metrics.ts TDD 実装 | `ba9ae82` | 10 passed |
| 2 | queries.ts TDD 実装 | `718e2e2` | 4 passed |

**Total: 14 tests, all passing.**

## TDD Flow

Both tasks followed strict RED → GREEN:

1. **Task 1 RED**: metrics.test.ts を先に書いて `vitest run` で `Cannot find package '@/lib/dashboard/metrics'` を確認
2. **Task 1 GREEN**: metrics.ts を実装 → 10/10 pass
3. **Task 2 RED**: queries.test.ts を先に書いて `Cannot find package '@/lib/dashboard/queries'` を確認
4. **Task 2 GREEN**: queries.ts を実装 → 4/4 pass

## Verification

```
$ npx vitest run lib/dashboard/
 Test Files  2 passed (2)
      Tests  14 passed (14)
```

TypeScript strict check: dashboard ファイルに関するエラーゼロ。

## Threat Model Status

| Threat ID | Status | How |
|-----------|--------|-----|
| T-04-02 (Information Disclosure) | mitigated | `import 'server-only'` on both `metrics.ts` and `queries.ts`; Next.js build fails if a Client Component imports them |
| T-04-03 (Tampering / malformed transcript) | mitigated | `parseTimelineFromDecision` defensively checks `typeof transcript === 'object'`, `Array.isArray(decisions)`, and only keeps entries with explicit `action === 'BUY' \|\| 'SELL'`. Unit-tested with null/undefined/number/non-array inputs. |

## Deviations from Plan

None of substance. Two minor clarifications applied inline (all within the plan's behavior contract, no new functionality):

1. **`parseTimelineFromDecision` confidence normalization**: plan specified `confidence: 'high' | 'medium' | 'low'`. Added a defensive fallback to `'medium'` when the raw value is missing/invalid rather than throwing — consistent with the plan's "safe fallback" guidance for malformed transcripts. No test change needed.
2. **`getTimelineData` trade overlay**: plan said "merge transcript with trades table for executedPrice/quantity". Implemented as an inner-join-like filter: transcript entries with **no** matching executed trade row are dropped. This matches D-12 ("BUY/SELL only, HOLD skipped") since an unexecuted decision is effectively a HOLD from the portfolio's perspective. Documented in decisions above.

## Deferred Issues

None.

## Known Stubs

None — the data layer is fully wired. UI consumption is the Plan 03/04 scope.

## Self-Check: PASSED

**Files verified:**
- FOUND: `lib/dashboard/types.ts`
- FOUND: `lib/dashboard/metrics.ts`
- FOUND: `lib/dashboard/metrics.test.ts`
- FOUND: `lib/dashboard/queries.ts`
- FOUND: `lib/dashboard/queries.test.ts`

**Commits verified:**
- FOUND: `ba9ae82` feat(04-02): add dashboard types and metrics calculations (TDD)
- FOUND: `718e2e2` feat(04-02): add dashboard Drizzle queries and transcript parser (TDD)

**Tests verified:**
- `npx vitest run lib/dashboard/` → 2 files, 14 tests, all pass
