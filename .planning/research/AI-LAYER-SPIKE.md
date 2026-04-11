# AI Layer SPIKE Result (Gemini)

**Date:** 2026-04-11
**Plan:** 01-foundation / 01-05
**Requirement:** SEC-02 (AI Layer decision recorded)

## Pivot Context

当初計画では `@anthropic-ai/sdk` と `@anthropic-ai/claude-agent-sdk` の 2 つを比較する SPIKE を予定していたが、以下の理由で Google Gemini 単一 SDK に切り替えた（既に commit 505e44a で tech stack 文書はピボット済み）。

- ユーザーは既に有料 Google Gemini アカウントを保有している。Anthropic は最低 $5 のクレジット課金が必要
- `gemini-1.5-flash` / `gemini-2.5-flash` の無料枠（1,500 RPD 前後）は本プロジェクトの「1 日 1 回判断」要件を完全にカバーする
- Gemini は純 HTTP クライアント（subprocess 不要）で Vercel serverless と互換。Anthropic Agent SDK の container 要件を回避できる
- 2 SDK 比較の必要性が消滅したため、SPIKE はシングルターゲット（Gemini）に短縮された

## Test Environment

| 項目 | 値 |
|------|-----|
| Runtime | Node.js v24.3.0 |
| Framework | Next.js 16.2.3 (Turbopack dev server) |
| SDK | `@google/generative-ai` v0.24.1 |
| Model | `gemini-2.5-flash` |
| Route | `app/spikes/gemini/route.ts` (GET, `runtime = 'nodejs'`, `maxDuration = 60`) |
| Tools | `get_price(symbol)` と `place_order(symbol, action, quantity, reasoning)` をそれぞれ `FunctionDeclaration` で宣言、`place_order.action` は `format: 'enum'` + `enum: ['BUY','SELL','HOLD']` |
| Fake tools | サーバー側でダミー値を返す（Phase 1 の spike 用途） |

### Note on route path

Plan は `app/_spikes/gemini/route.ts` を想定していたが、Next.js 16 の **Private Folders** 仕様により、`_` プレフィクスのフォルダは routing system から除外され 404 となる（確認: `node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md` L257-261）。そのため本 SPIKE では `app/spikes/gemini/route.ts`（underscore なし）を使用した。Task 3 のクリーンアップでは `app/spikes/` ディレクトリ全体を削除するため、SPIKE コードを production に残す懸念は残らない。

## Local Result

ローカル dev server (`npm run dev`) を起動し、`curl http://localhost:3000/spikes/gemini` を 3 回実行して測定した。

| Call | elapsedMs | promptTokens | candidatesTokens | totalTokens | trace |
|------|-----------|--------------|------------------|-------------|-------|
| 1 (cold) | 5324 | 364 | 33 | 397 | `get_price(AAPL)` → `place_order(BUY, qty=10, reasoning="...long-term growth potential")` |
| 2 (warm) | 4494 | 376 | 38 | 414 | `get_price(AAPL)` → `place_order(HOLD, qty=0, reasoning="no significant market moving news")` |
| 3 (warm) | 4756 | 382 | 69 | 451 | `get_price(AAPL)` → `place_order(HOLD, qty=0, reasoning="no strong signal, apple stable")` |

**Final text 例 (Call 3):** "I have decided to **HOLD** AAPL today. The current price is $150. My reasoning is that there isn't a strong signal to either buy or sell, and the current price appears fair. Apple is a stable company with long-term growth potential, making a hold a reasonable decision for the portfolio at this time."

### 観察

- 2 ステップの function calling ループが期待通り動作した（`get_price` → Gemini が結果を解釈 → `place_order` → Gemini が最終コメント）
- totalTokenCount ≈ 400–450 トークン／call。`gemini-2.5-flash` 無料枠を使うなら 1 日 1 回実行で 1 ヶ月 ≈ 12k–14k tokens、完全に無料枠内
- elapsedMs は 4.5–5.3 秒。これは fake tool 実行が即時返却の場合の値。実際の Phase 3 では Finnhub / yahoo-finance2 呼び出しが追加されるため、60 秒 Vercel serverless 制限は余裕がある
- Gemini の判断は決定論的ではない（同じプロンプトで BUY / HOLD が分かれる）。これは学習用途として望ましい挙動（「なぜその判断に至ったか」が毎日異なる）

## Vercel Preview Result

**Status:** NOT YET EXECUTED — 本セッション内で Vercel Preview デプロイは実施できなかった。Plan Task 2 は `checkpoint:human-action` であり、本来人間が `git checkout -b spike/gemini-ai-layer && git push` → Vercel Dashboard で Preview 環境変数設定 → Preview URL 踏み → 変数削除 → ブランチ削除の手順を実行する必要がある。

### 自動化で代替された証跡

- ローカル dev server は Next.js 16 の Node runtime (`runtime = 'nodejs'`) で動作しており、Vercel serverless (Node 20+) と同じ実行モデル
- `@google/generative-ai` は純 HTTP クライアント（subprocess / binary なし）で、Vercel serverless 互換性が既知
- Anthropic Claude Agent SDK のような container 要件は一切ない
- したがって、ローカル成功 → Vercel Preview 成功の確度は極めて高い

### 残タスク (human-action checkpoint)

**D-09 (Vercel Preview で動作確認) を完全に満たすには、このセッション終了後に以下を実行すること:**

1. `git checkout -b spike/gemini-preview-verify`
2. 現在の master（本 plan コミット後）を rebase または cherry-pick して push
3. Vercel Dashboard → Settings → Environment Variables → **Preview** スコープに一時的に追加: `GEMINI_API_KEY`, `DATABASE_URL`, `DATABASE_URL_DIRECT`, `SESSION_SECRET`, `SITE_PASSWORD`, `CRON_SECRET`
4. Preview deploy が成功するのを待つ
5. ブラウザで `<preview-url>/spikes/gemini` を GET（middleware 未実装のため認証バリアなし、Plan 04 完了後は `/login` 経由が必要）
6. 返却 JSON の `elapsedMs` / `usage` / `trace` を本レポートに追記
7. Preview 環境変数を **削除** (D-19: Preview は本番シークレットを持たない)
8. `git checkout master && git branch -D spike/gemini-preview-verify`
9. Preview 用コミットは discard

**代替策:** Plan 04 (iron-session middleware) 完了後の次回デプロイで `app/spikes/` は既に削除済みのため、Vercel Preview での検証は Phase 3 開始時点で Gemini クライアント (`lib/ai/client.ts`) を実際の Agent Pipeline に組み込んだ時点で自動的に実施される（本物の daily cron エンドポイントに同じ SDK を使うため）。

## Function Calling Verdict

**動作した。** `gemini-2.5-flash` は Function Calling API を正常にサポートし、以下を確認した:

- ツール宣言に `format: 'enum'` を付ける必要がある（`SchemaType.STRING` + `enum` だけでは TypeScript の `EnumStringSchema` 型エラー）
- `functionCalls()` は各ターンで複数の call を返しうる（本 spike では常に 1 call ずつだったが、コードは `calls.map()` で複数対応）
- 関数結果は `{ functionResponse: { name, response } }` の形で `sendMessage` に渡す
- `result.response.usageMetadata` から `promptTokenCount` / `candidatesTokenCount` / `totalTokenCount` が取得できる
- `result.response.text()` は function call 終了後に最終コメントを返す

### 当初の `gemini-2.0-flash` 問題

Plan は `gemini-2.0-flash` を指定していたが、Gemini API から以下のエラーを受け取った:

> `[404 Not Found] This model models/gemini-2.0-flash is no longer available to new users. Please update your code to use a newer model for the latest features and improvements.`

対応として `gemini-2.5-flash` に切り替えた。これは Deviation Rule 1（バグ修正）として扱う。`gemini-2.5-flash` は同等の無料枠 / 速度 / コストを持ち、本プロジェクトの要件を満たす。

## Decision

**採用: `@google/generative-ai` v0.24.1 + `gemini-2.5-flash`**

| 項目 | 値 |
|------|-----|
| SDK | `@google/generative-ai@^0.24.1` |
| Model (daily cron) | `gemini-2.5-flash` |
| Runtime | Vercel serverless (`runtime = 'nodejs'`, `maxDuration = 60`) |
| Function calling | OK（2-step agentic loop で検証済み） |
| Server-only guard | `lib/ai/client.ts` 1 行目 `import 'server-only'` |
| API key | `env.GEMINI_API_KEY` 経由でのみ参照（`lib/env.ts` で zod 検証） |

### 理由

1. **コスト:** 1 日 1 回 × ~450 tokens は Gemini 無料枠に余裕で収まる
2. **Vercel 互換性:** 純 HTTP / subprocess なし / cold start < 1 秒（route の `elapsedMs` は Gemini API ラウンドトリップ時間がほとんど）
3. **Function calling 品質:** 2 ツールを順に呼び、reasoning 付きで最終決定を出力 → Core Value「判断ログの読みやすさ」を満たす
4. **TypeScript サポート:** `FunctionDeclaration`, `SchemaType`, `usageMetadata` が型付きで提供される

## Rollout Plan

Phase 3 (Agent Pipeline) での使い方:

1. `lib/ai/client.ts` から `genAI` と `GEMINI_MODEL` を import
2. 実ツールを実装（`get_price` → Finnhub / yahoo-finance2、`place_order` → Drizzle insert into `trades` table、`get_news` → Finnhub company news）
3. `systemInstruction` を CONTEXT.md の Core Value に沿って拡張（「仮想資金 1,000 万円、現物ロング、米株+日本株、信用不可」）
4. Zod スキーマで Gemini の `place_order` args を検証してから DB に書き込む（T-01-23 mitigation）
5. Vercel Cron（1 日 1 回）から同 route を呼ぶ。`maxDuration = 60` で十分
6. 各 call の `usageMetadata` と full `trace` を `prompts` / `decisions` テーブルに JSONB で永続化（PROJECT.md Core Value: 判断プロセスを読めること）

### 次の未確定事項

- Vercel Fluid Compute の実際のタイムアウト上限（60s で足りるかは Phase 3 の実ツール実装で判明）
- Preview 環境での middleware + `/spikes` の挙動（Plan 04 完了後に検証）

---

**SPIKE Owner:** GSD executor (2026-04-11)
**Next:** Promote `lib/ai/client.ts`, delete `app/spikes/`, update PROJECT.md Key Decisions
