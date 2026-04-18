---
phase: 03-agent-pipeline
plan: "01"
subsystem: agent-pipeline
tags: [types, zod, prompt-builder, technicalindicators, tdd]
dependency_graph:
  requires: []
  provides: [lib/agent/types.ts, lib/agent/prompt-builder.ts]
  affects: [lib/agent/gemini-caller.ts, lib/agent/trade-executor.ts]
tech_stack:
  added: [technicalindicators@3.1.0]
  patterns: [zod-preprocess, server-only-guard, xml-delimiter-injection-mitigation]
key_files:
  created:
    - lib/agent/types.ts
    - lib/agent/types.test.ts
    - lib/agent/prompt-builder.ts
    - lib/agent/prompt-builder.test.ts
  modified: []
decisions:
  - "GeminiDecisionItemSchema に z.preprocess で action(uppercase)/confidence(lowercase) 正規化を適用"
  - "compressNews は publishedAt 降順ソート後上位3件に圧縮し <external_news_content> XML タグで囲む（AGENT-06/T-03-01）"
  - "prompt-builder.ts に import server-only を配置しクライアントバンドル混入防止（T-03-02）"
  - "types.ts は server-only なし（テストからもインポートするため型のみファイル）"
metrics:
  duration: "4m"
  completed_date: "2026-04-12"
  tasks_completed: 2
  files_created: 4
---

# Phase 3 Plan 01: Agent Types and Prompt Builder Summary

**One-liner:** Zod schemas for Gemini JSON response validation + prompt assembly module with RSI/MACD/SMA indicators and XML-delimited news injection mitigation

## What Was Built

### Task 1: lib/agent/types.ts
- `GeminiDecisionItemSchema`: action フィールドに `z.preprocess` で小文字→大文字変換、confidence は大文字→小文字変換。BUY/SELL/HOLD 以外は reject。
- `GeminiResponseSchema`: `market_assessment` + `decisions` 配列
- `PromptContext` / `TickerData` / `PortfolioContext`: prompt-builder の入力型
- `ExecutionResult` / `TradeResult` / `SkippedDecision`: 売買執行結果型
- `estimateTokenCostUsd`: Gemini 2.5 Flash の入力 $0.30/1M・出力 $2.50/1M でコスト計算

### Task 2: lib/agent/prompt-builder.ts
- `computeIndicators(closePrices)`: `technicalindicators` ライブラリで RSI(14)/MACD(12,26,9)/SMA(20)/SMA(50) を計算。データ不足時は null を返す
- `compressNews(news)`: publishedAt 降順ソートで上位3件に圧縮し `<external_news_content>` XML タグ + "untrusted external content" 警告で囲む（D-04/AGENT-06）
- `buildSystemPrompt()`: 観察重視型トーン、日本語指示、ニュース警告、BUY/SELL/HOLD 制約（D-01/D-03）
- `buildUserPrompt(ctx)`: 実行日・FXレート・ポートフォリオ・全銘柄データ・JSON スキーマ指示を組み立て（D-06/D-07）

## Test Results

- `npx vitest run lib/agent/types.test.ts`: 20/20 passed
- `npx vitest run lib/agent/prompt-builder.test.ts`: 33/33 passed
- 合計: 53/53 tests passed

## Deviations from Plan

None — plan executed exactly as written.

## Threat Surface Scan

T-03-01（Tampering: ニュースプロンプトインジェクション）: `<external_news_content>` タグ + "untrusted external content" 警告テキストで対応済み。  
T-03-02（Information Disclosure: server-only ガード）: `import 'server-only'` を prompt-builder.ts 冒頭に配置済み。

## Self-Check: PASSED
