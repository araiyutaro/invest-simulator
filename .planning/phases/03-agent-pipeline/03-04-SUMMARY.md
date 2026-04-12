---
phase: 03-agent-pipeline
plan: "04"
subsystem: agent-pipeline
tags: [data-loader, daily-run, orchestrator, tdd, drizzle, cron, idempotency]
dependency_graph:
  requires:
    - lib/agent/types.ts
    - lib/agent/prompt-builder.ts
    - lib/agent/gemini-caller.ts
    - lib/agent/executor.ts
    - lib/market/orchestrator.ts
    - db/schema.ts
  provides:
    - lib/agent/data-loader.ts
    - app/api/cron/daily-run/route.ts
  affects:
    - vercel.json (cron endpoint)
tech_stack:
  added: []
  patterns:
    - onConflictDoNothing-idempotency
    - server-only-guard
    - parseFloat-numeric-conversion
    - cron-secret-auth
key_files:
  created:
    - lib/agent/data-loader.ts
    - lib/agent/data-loader.test.ts
    - app/api/cron/daily-run/route.ts
  modified:
    - lib/agent/gemini-caller.ts
    - lib/agent/executor.test.ts
decisions:
  - "loadPromptContext は TICKERS 全件をループして price/news/fundamentals を個別クエリで取得（シンプルさを優先）"
  - "saveDecisionRecord の冪等ガードは onConflictDoNothing().returning() で実装（D-16）"
  - "positionsValueJpy は実行前ポジションで近似計算（同日スナップショットとして許容）"
  - "FXレートは priceSnapshots symbol='JPYUSD' の最新 close から取得"
metrics:
  duration: "7m"
  completed_date: "2026-04-12"
  tasks_completed: 2
  files_created: 3
  files_modified: 2
---

# Phase 3 Plan 04: Data Loader and Daily Run Orchestrator Summary

**One-liner:** DB 読み込みユーティリティ (data-loader) と完全 AI エージェントパイプラインを実行する `/api/cron/daily-run` Route Handler の実装（TDD + 冪等性ガード + フル transcript 保存）

## What Was Built

### Task 1 (TDD): lib/agent/data-loader.ts

Phase 3 の全モジュールをオーケストレートするためのDB 読み書きユーティリティ。

- **`ensurePortfolio()`**: portfolios テーブルが空なら `initialCash=10000000.0000` (1,000万JPY) で自動作成。既存なら既存 id を返す（D-13/EXEC-01）
- **`ensureMarketData(runDate)`**: 当日の `price_snapshots` が 0 件なら `fetchMarketData({ mode: 'incremental' })` を呼び出す（Pitfall 3 対策）
- **`loadPromptContext(portfolioId, runDate)`**: TICKERS 全件をループし、各 ticker の price history (最新100件 DESC→昇順変換)、news (最新10件)、fundamentals (最新1件) を取得。`computeIndicators()` で RSI/MACD/SMA を計算。numeric カラムを `parseFloat()` で数値変換（Pitfall 4 対策）。FXレートは `symbol='JPYUSD'` の最新 close から取得
- **`saveDecisionRecord()`**: `onConflictDoNothing().returning()` で冪等 INSERT。既存レコードなら `{ inserted: false, decisionId: null }` を返す（D-16/AGENT-05）
- **`savePortfolioSnapshot()`**: `onConflictDoNothing()` で日次スナップショットを保存。`totalValueJpy = cashJpy + positionsValueJpy` で計算（D-12）

`import 'server-only'` で T-03-12 (クライアントバンドル混入防止) を実施。

### Task 1 テスト: lib/agent/data-loader.test.ts

7 ケースのユニットテスト:
1. `ensurePortfolio` 新規作成（INSERT で 10000000 を確認）
2. `ensurePortfolio` 既存返却（INSERT なし）
3. `ensureMarketData` データなし → `fetchMarketData` 呼び出し
4. `ensureMarketData` データあり → `fetchMarketData` 呼ばれない
5. `saveDecisionRecord` 新規 INSERT → `inserted=true`
6. `saveDecisionRecord` 冪等スキップ → `inserted=false`
7. `savePortfolioSnapshot` totalValueJpy 計算確認

### Task 2: app/api/cron/daily-run/route.ts

Phase 3 の完全パイプラインを実行するオーケストレーター Route Handler。

**パイプライン順序:**
1. `Authorization: Bearer ${CRON_SECRET}` 認証（T-03-09 対策）
2. `ensurePortfolio()` でポートフォリオ確保
3. `ensureMarketData(today)` で市場データ確保
4. `loadPromptContext()` + `buildSystemPrompt()` + `buildUserPrompt()` でプロンプト構築
5. `callGemini()` で AI 判断取得（D-14: 30s 待機後 1 回リトライ）
6. `DecisionTranscript` 組み立て（system_prompt/user_prompt/raw_messages/input_data_snapshot/usage）
7. `saveDecisionRecord()` で冪等 INSERT → 同日 2 回目は `{ status: 'skipped', reason: 'already_ran_today' }` 200 返却（D-16）
8. Gemini 失敗時は失敗 transcript を保存して 200 返却（cron retry 防止、D-14）
9. `executeDecisions()` で仮想売買執行
10. `savePortfolioSnapshot()` で日次スナップショット記録（D-12）

`export const maxDuration = 120` (D-17)。`GET` は 405 を返す。

## Test Results

- `npx vitest run lib/agent/data-loader.test.ts`: 7/7 passed
- `npx vitest run lib/agent/`: 87/87 passed（5 test files）
- `npx tsc --noEmit`: エラーなし

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] gemini-caller.ts: SchemaType `as const` 不足による型エラー修正**
- **Found during:** Task 2 の型チェック実行時
- **Issue:** `SchemaType.OBJECT` 等が `SchemaType` 型として推論され、`ObjectSchema` の `type: SchemaType.OBJECT` に代入不可
- **Fix:** 各 `SchemaType.XXX` に `as const` を追加してリテラル型に絞り込み
- **Files modified:** `lib/agent/gemini-caller.ts`
- **Commit:** ed51af8

**2. [Rule 1 - Bug] executor.test.ts: `SkippedDecision.symbol` 参照エラー修正**
- **Found during:** Task 2 の型チェック実行時
- **Issue:** `SkippedDecision` 型は `ticker` プロパティを持つが、テストが `result.skipped[0].symbol ?? result.skipped[0].ticker` と書いており TypeScript エラー発生
- **Fix:** `.symbol ?? .ticker` を `.ticker` に統一
- **Files modified:** `lib/agent/executor.test.ts`
- **Commit:** ed51af8

## Known Stubs

なし — 全エクスポート関数は実データを読み書きする実装済み。

## Threat Surface Scan

| Flag | File | Description |
|------|------|-------------|
| threat_flag: authentication | app/api/cron/daily-run/route.ts | 新規 POST エンドポイント。Authorization: Bearer CRON_SECRET で保護済み（T-03-09 対応済み） |
| threat_flag: repudiation | app/api/cron/daily-run/route.ts | AI 判断の全 transcript を decisions テーブルに JSONB 保存済み（T-03-10/AGENT-05 対応済み） |

## Self-Check: PASSED
