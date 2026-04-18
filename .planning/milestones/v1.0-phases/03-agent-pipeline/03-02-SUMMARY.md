---
phase: 03-agent-pipeline
plan: "02"
subsystem: agent-pipeline
tags: [gemini, structured-output, retry, zod-validation, tdd, cost-estimation]
dependency_graph:
  requires: [lib/agent/types.ts, lib/ai/client.ts, config/tickers.ts]
  provides: [lib/agent/gemini-caller.ts]
  affects: [lib/agent/trade-executor.ts, app/api/cron/daily-run/route.ts]
tech_stack:
  added: []
  patterns: [server-only-guard, responseSchema-structured-output, zod-safeParse, vi-hoisted-mock, vi-useFakeTimers]
key_files:
  created:
    - lib/agent/gemini-caller.ts
    - lib/agent/gemini-caller.test.ts
  modified: []
decisions:
  - "vi.hoisted() を使って vi.mock ファクトリ内の TDZ 問題を回避（標準 vi.fn() 変数では hoisting エラー発生）"
  - "GeminiResponseSchema.safeParse() を使用（parse() ではなく）— バリデーション失敗時にスローせずok:falseで返す"
  - "usageMetadata.candidatesTokenCount はオプショナルのため ?? 0 フォールバックを適用"
metrics:
  duration: "6m"
  completed_date: "2026-04-12"
  tasks_completed: 1
  files_created: 2
---

# Phase 3 Plan 02: Gemini Caller Summary

**One-liner:** callGemini() with responseSchema structured JSON output, zod validation + whitelist filter, 30s retry logic, and usageMetadata cost estimation

## What Was Built

### Task 1: lib/agent/gemini-caller.ts + lib/agent/gemini-caller.test.ts

**`callGemini(systemPrompt, userPrompt): Promise<GeminiCallResult>`**

- `import 'server-only'` ガード（サーバーサイド専用モジュール）
- `genAI.getGenerativeModel()` に `responseMimeType: 'application/json'`、`responseSchema`（SchemaType.OBJECT/ARRAY/STRING/INTEGER）、`temperature: 0.3`、`systemInstruction` を設定（D-05, D-07）
- `model.generateContent(userPrompt)` → 失敗時は 30 秒待機後 1 回リトライ → 2 回目失敗で `{ ok: false, error }` を返す（D-14）
- `JSON.parse(rawText)` → `GeminiResponseSchema.safeParse()` でzodバリデーション → 失敗時 `{ ok: false, error: 'validation_failed: ...' }` を返す（T-03-03, T-03-04）
- `findTicker(d.ticker)` でホワイトリスト外銘柄を `filteredDecisions` から除外し `console.warn` でログ出力（D-15）
- `usageMetadata.promptTokenCount / candidatesTokenCount / totalTokenCount` を取得し `estimateTokenCostUsd()` でUSDコスト計算（AGENT-07）
- 正常時は `{ ok: true, response, filteredDecisions, usage, costUsd, rawText }` を返す

**テスト（14 件すべて green）:**
- 正常応答: ok:true でパース・rawText・usage 確認
- コスト計算: usageMetadata 値から costUsd が正しく計算される
- ホワイトリストフィルタ: UNKNOWN_TICKER が filteredDecisions に含まれない
- zodバリデーション失敗: 不正構造・不正JSON文字列で ok:false、rawText も返される
- リトライ: 1回目失敗→2回目成功（vi.useFakeTimers で 30s をスキップ）
- 2回失敗: ok:false, error に Second Error メッセージ
- モデル設定: responseMimeType/systemInstruction/temperature/generateContent の呼び出し引数を検証

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] vi.mock ファクトリ内の TDZ (Temporal Dead Zone) エラーを修正**
- **Found during:** Task 1 RED フェーズ — テスト実行時に `ReferenceError: Cannot access 'mockGetGenerativeModel' before initialization`
- **Issue:** `vi.mock()` はホイスティングされるため、ファクトリ外で宣言した `const mockGenerateContent = vi.fn()` は TDZ に入る
- **Fix:** `vi.hoisted(() => { ... })` を使って mock 関数を宣言し、`vi.mock` ファクトリ内から参照
- **Files modified:** `lib/agent/gemini-caller.test.ts`
- **Commit:** a656cc0

## Known Stubs

None. `callGemini` は実際の Gemini API クライアント呼び出しをラップしており、モックなし。

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: input-validation | lib/agent/gemini-caller.ts | Gemini 出力を zodバリデーション + ホワイトリストフィルタで処理（T-03-03, T-03-04 対応済み） |

## Self-Check: PASSED

- FOUND: lib/agent/gemini-caller.ts
- FOUND: lib/agent/gemini-caller.test.ts
- FOUND: .planning/phases/03-agent-pipeline/03-02-SUMMARY.md
- FOUND: commit a656cc0
