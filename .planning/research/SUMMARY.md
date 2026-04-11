# Project Research Summary

**Project:** invest-simulator
**Domain:** AI-driven virtual stock trading simulator with reasoning observability
**Researched:** 2026-04-11
**Confidence:** MEDIUM-HIGH (AI layer pivoted to Gemini 2026-04-11; core stack HIGH)

---

## ⚠️ Pivot Note (2026-04-11): Anthropic → Gemini

The AI layer has been changed from **Anthropic Claude** to **Google Gemini** (`@google/generative-ai`, model `gemini-2.0-flash`). Reason: user has an existing paid Gemini account, Gemini free tier easily covers 1-run/day, Gemini function calling is Vercel-serverless compatible.

All Anthropic-specific content below is historical context. The AI Layer conflict section is now moot — Gemini single SDK, no comparison needed.

---

## Executive Summary

invest-simulator は Claude が毎日仮想資金で売買判断を行い、その思考プロセスをダッシュボードで観察する個人学習ツールである。コア価値は「P&L ではなく判断ログの可読性」にあり、アーキテクチャの最優先事項もトレード実行の正確さよりも reasoning の完全保存となる。リサーチ全体を通じて、技術的には確立されたパターン（Next.js App Router + Neon Postgres + Drizzle + Vercel Cron）で構築可能であることが確認された。未解決の最大テーマは「AI 実行レイヤー」と「Vercel タイムアウト回避策」の2点であり、Phase 1 開始時に確定させる必要がある。

AI 実行レイヤーについては、STACK.md と ARCHITECTURE.md で結論が食い違う。STACK.md は「`@anthropic-ai/claude-agent-sdk` は subprocess を起動するため Vercel Hobby では構造的ミスマッチ」と判断し、標準 `@anthropic-ai/sdk` + 手書き tool_use ループを推奨する。一方 ARCHITECTURE.md は Agent SDK を前提とした設計を示している。ユーザーの当初意図が Agent SDK 採用にあることを踏まえ、本サマリーでは「両候補を並記し、Phase 1 の research で Vercel 環境上での動作検証後に確定」とする。Vercel タイムアウトについては PITFALLS.md が 60 秒制限を問題視する一方、ARCHITECTURE.md が Fluid Compute で最大 300 秒可能と記載しており、実装時は Fluid Compute を先行設定しつつ Inngest/Trigger.dev/QStash によるバックグラウンドキューを fallback として確保するアプローチを採る。

JP 株データは yahoo-finance2 を primary、Stooq CSV を fallback とするデュアルソース戦略が研究者間で合意形成されている。circuit breaker パターンで自動切替し、stale データ（2 取引日以上古いもの）を警告付きで通知する実装が必須となる。個人プロジェクトとしてのコスト上限は厳しく、Claude のコンテキストに渡すニュース記事数の上限管理（ticker あたり 3 見出しまで）とトークンコスト監視がプロダクション前に必要なガード要件となる。

---

## Key Findings

### Recommended Stack

Next.js 16.2.3（既存 bootstrap）+ Neon Postgres + Drizzle ORM という基盤は全リサーチで合意済み。Prisma は serverless コールドスタートの binary engine 問題で不採用、Drizzle が推奨される。認証は iron-session v8 + env-var パスワードでシンプルに実装する。チャートは time-series に lightweight-charts（TradingView）、allocation 等 50 点以下のデータに Recharts を使い分ける。スケジューラーは Vercel Cron（Hobby = 1 回/日）で要件と完全一致する。

**Core technologies:**

| Technology | Purpose | Rationale |
|---|---|---|
| Next.js 16.2.3 | Framework (already installed) | App Router + Route Handlers で UI・API・Cron エンドポイントを一元管理 |
| Neon Postgres | Persistence | Free tier 0.5GB、JSONB で Claude transcript 保存、Vercel native integration |
| Drizzle ORM ^0.41 | DB access | No binary engine, serverless-first, drizzle-kit migration CLI |
| `@anthropic-ai/sdk` ^0.81 | Claude API (primary candidate) | Serverless 互換、tool_use で agentic loop を手書き実装可能 |
| `@anthropic-ai/claude-agent-sdk` v0.2 | Claude API (secondary candidate) | Agent SDK 公式推奨だが subprocess 要件で Vercel Hobby 45 分制限あり |
| yahoo-finance2 ^3.14 | JP + US market data | TypeScript 型付き、.T suffix で JP ticker 対応、無料・無 API key |
| Finnhub | US stocks (primary) | 60 calls/min 無料、US price/news/fundamentals |
| iron-session ^8 | Session auth | App Router 対応 v8、env-var パスワードによるシンプル単一ユーザー認証 |
| lightweight-charts ^5 | Financial time-series | 45KB gzip、canvas ベース、Portfolio curve + candlestick |
| Vercel Cron (Hobby) | Scheduler | 1 回/日制限がプロジェクト要件と完全一致 |
| technicalindicators ^3.1 | TA indicators | RSI/MACD/SMA を Claude context として事前計算 |

**Fallback/alternatives confirmed:**
- Alpha Vantage: US fundamentals のみ（25 req/day）、daily price では **使わない**
- Stooq CSV: JP price の fallback（API key 不要、HTTP GET）
- J-Quants free: **使用禁止**（12 週遅延）
- GitHub Actions: Vercel Cron が使えない場合の代替スケジューラー

### Expected Features

**Must have (table stakes — v1):**
- 毎日の Claude 売買判断実行（tool use 付き agentic loop）
- トレードログ永続化（symbol / direction / quantity / price / timestamp）
- Claude reasoning 表示（full response、expanded by default）
- 市場コンテキストスナップショット（決定時点のニュース見出し保存）
- ポートフォリオ価値チャート（日次スナップショット、折れ線）
- ベンチマーク比較オーバーレイ（SPY / TOPIX）
- 現在ポジション一覧（symbol / qty / avg_cost / unrealized P&L / weight%）
- キャッシュ残高表示
- トレード履歴タイムライン（逆時系列、reasoning 展開可能）
- パフォーマンス指標（Total return / Sharpe ratio / Max drawdown / Win rate）
- パスワード保護（middleware + iron-session）

**Should have (v1.x — 2〜4 週間の稼働後追加):**
- Reasoning 全文検索
- トレードごとのコンフィデンスレベル（structured output フィールド追加のみ）
- Per-trade プロンプト透明性パネル
- シンボル・期間フィルタ

**Defer (v2+):**
- ポジションごとの thesis トラッキング（narrative arc）
- reasoning ログ markdown/PDF エクスポート
- 日次メールサマリー
- ユーザーアノテーション（Claude の推論に対するメモ）

**Anti-features (build しない):**
- リアルタイム価格ストリーミング
- ショート / レバレッジ
- バックテストエンジン
- マルチユーザー / ソーシャル機能

### Architecture Approach

アーキテクチャは「日次バッチ書き込みパス」と「読み取り専用ダッシュボードパス」の2系統に明確分離する。Vercel Cron が `/api/cron/daily-run` を叩き、MarketFetcher → ContextBuilder → AgentRunner → TradeExecutor → DecisionPersister の順で直列実行する。ダッシュボードは Next.js Server Components が Neon Postgres を直接 Drizzle クエリし、API レイヤーを持たない（単一ユーザーのため中間 API は不要）。価格は MarketFetcher が agent 実行前に `price_snapshots` テーブルに書き込み、TradeExecutor は外部 API を一切呼ばずスナップショットのみ参照することで audit trail を保証する。

**Major components:**

| Component | Responsibility | Location |
|---|---|---|
| CronRoute | HTTP エントリーポイント、CRON_SECRET 検証、パイプライン orchestration | `app/api/cron/daily-run/route.ts` |
| MarketFetcher | 外部 API からの price/news/fundamentals 取得、price_snapshots への書き込み | `lib/market/` |
| ContextBuilder | DB から portfolio・positions を読み Claude prompt context を組み立て | `lib/agent/context-builder.ts` |
| AgentRunner | Claude との tool-use ループ実行、transcript 蓄積 | `lib/agent/trading-agent.ts` |
| TradeExecutor | 仮想トレードのバリデーションと DB 反映（price_snapshots のみ参照） | `lib/executor/trade-executor.ts` |
| DecisionPersister | transcript + summary の decisions テーブルへの永続化 | `lib/agent/decision-persister.ts` |
| Dashboard Pages | Drizzle 直接クエリの Server Components（読み取り専用） | `app/dashboard/`, `app/trades/`, etc. |
| AuthMiddleware | iron-session cookie チェック（全ルート保護） | `middleware.ts` |

**Key pattern: Idempotent cron guard**
Before running agent pipeline, check if a decisions row for run_date=today already exists. If yes, return early with skipped=true. Vercel Cron can fire twice; without this guard, duplicate runs double-execute trades.

**DB schema (key tables):**
`portfolios`, `positions`, `trades`, `decisions` (JSONB transcript), `price_snapshots`, `portfolio_snapshots`

### Critical Pitfalls

1. **Vercel タイムアウト（60秒）が Claude エージェント実行を中断する** — Fluid Compute 設定で最大延長を試みつつ、ローカルで wall-clock を計測し 45 秒超なら Inngest/QStash のバックグラウンドキューに移行する。ARCHITECTURE.md との差異（300秒可能 vs 60秒限界）は Phase 1 の環境検証で確定する。

2. **Yahoo Finance (yahoo-finance2) が無通知で壊れる** — JP 株ソースに circuit breaker を実装し、1 日以上失敗で Stooq CSV fallback へ自動切替。`JpPriceFetcher` アダプタで実装を隠蔽しライブラリ差し替えを容易にする。

3. **Claude がティッカーシンボルを幻覚する** — DB に ticker whitelist テーブルを持ち、`place_order` tool は whitelist 外のティッカーを即時拒否してエラーをエージェントに返す。エージェントに ticker を「記憶から思い出す」よう要求しない（常にリストを context に渡す）。

4. **ニュース記事を無制限に渡してトークンコストが暴走する** — ticker あたり最大 3 見出し + 1 文要約、合計ニュース context ≤ 2,000 tokens を上限とする。`max_tokens` を常に設定し、`usage.input_tokens` / `usage.output_tokens` を decisions テーブルに記録する。

5. **Adjusted/Unadjusted 価格の混在がゴースト P&L を生む** — split-adjusted 価格を統一採用し、`price_snapshots` に `raw_close` と `adj_close` を明示的カラムで両方保存する。

6. **Indirect Prompt Injection（ニュース経由の攻撃）** — ニュースコンテンツを `<external_news_content>` XML タグで囲み「外部非信頼データ」として明示する。`place_order` の出力は Zod スキーマで厳格バリデーションし、freetext のみの応答はトレード実行に使用しない。

7. **agent transcript を保存しないと reasoning が永遠に失われる** — `decisions` テーブルに full transcript（JSONB）、system prompt、token count、estimated cost を 1 回の実行ごとに必ず保存する。これが失われると core value proposition が失われる。

---

## Implications for Roadmap

研究が示す実装順序は、アーキテクチャの依存関係と pitfall 防止タイミングに基づく。全フェーズを通じ「まず書き込みパス、後から表示パス」の原則を維持する。

### Phase 1: Foundation — DB Schema + Auth + AI Layer Decision

**Rationale:** 全ての後続フェーズが Neon Postgres スキーマと認証ミドルウェアに依存する。スキーマ設計ミスはすべての下流を破壊するため最初に確定させる。また Claude Agent SDK vs. `@anthropic-ai/sdk` の選択、Vercel Fluid Compute タイムアウトの実測もこのフェーズで確定する。

**Delivers:**
- Drizzle スキーマ定義と Neon マイグレーション（全テーブル）
- iron-session パスワード認証 + ミドルウェア（全ルート保護）
- 最小限のログインページと空ダッシュボードシェル
- AI レイヤー選択の確定（Fluid Compute 実測 + Agent SDK 動作確認）
- CI 環境（TypeScript 型チェック、lint）

**Addresses:** Password protection（table stakes）、全 UI の前提基盤
**Avoids:** NEXT_PUBLIC_ シークレット漏洩（Pitfall 9）、transcript 未保存（Pitfall 10）のスキーマ設計

**Research flag:** AI 実行レイヤーの最終選択と Vercel Fluid Compute の実際のタイムアウト上限を Phase 1 で実測して確定する。

### Phase 2: Market Data Layer — Fetcher + Fallback + Cache

**Rationale:** Claude エージェントは price_snapshots がなければ実行できない。MarketFetcher を先に構築・検証することで、エージェント統合時の外部 API 変数を排除する。

**Delivers:**
- Finnhub（US price/news/fundamentals）クライアント
- yahoo-finance2（JP + US fallback）クライアント（`.T` suffix 対応）
- Stooq CSV fallback アダプタ + circuit breaker
- price_snapshots テーブルへの書き込みパス
- Alpha Vantage "Thank you" レスポンス検知ガード
- market holiday 判定（`market_closed: true` フラグ）
- adjusted/unadjusted price の両カラム保存

**Uses:** Finnhub, yahoo-finance2, Stooq, Alpha Vantage (fundamentals only)
**Avoids:** API quota 枯渇（Pitfall 1）、Price mixing（Pitfall 2）、JP scraping 破損（Pitfall 5）

### Phase 3: Claude Agent Pipeline — Tool Loop + Trade Executor

**Rationale:** MarketFetcher が機能することが確認できたら、エージェントパイプラインを構築する。TradeExecutor は price_snapshots のみ参照するため Phase 2 完了後でないと正しく実装できない。

**Delivers:**
- ticker whitelist テーブルと whitelist validation
- ContextBuilder（portfolio + positions + price snapshot の context 組み立て）
- AgentRunner（選定した SDK での tool-use ループ）
- 7 つの Claude tools（`get_prices`, `get_news`, `get_fundamentals`, `get_portfolio`, `get_positions`, `place_order`, `get_market_context`）
- TradeExecutor（cash validation、COD price lookup、DB write）
- DecisionPersister（full transcript JSONB 保存）
- Idempotent cron guard（run_date 重複チェック）
- `/api/cron/daily-run` Route Handler
- ニュース context トークン上限ガード（≤ 2,000 tokens）
- `<external_news_content>` XML delimit による prompt injection 対策
- Zod による `place_order` 出力バリデーション
- タイムアウト対策（Fluid Compute + 必要なら Inngest/QStash）

**Implements:** AgentRunner, TradeExecutor, DecisionPersister, CronRoute
**Avoids:** ティッカー幻覚（Pitfall 6）、トークンコスト暴走（Pitfall 7）、Prompt injection（Pitfall 8）、タイムアウト（Pitfall 3）、Lookahead bias（Pitfall 4）

### Phase 4: Dashboard UI — Reasoning-First Display

**Rationale:** データが蓄積され始めたら表示レイヤーを構築する。Server Components + Drizzle 直接クエリのシンプルな実装で読み取り専用ダッシュボードを完成させる。

**Delivers:**
- `/dashboard` — Portfolio value chart（lightweight-charts）、ベンチマーク比較
- `/positions` — 現在ポジション一覧（P&L、weight%）
- `/trades` — トレードタイムライン（reasoning expanded by default）
- `/metrics` — Sharpe ratio、Max drawdown、Win rate、Total return
- Recharts による allocation pie chart
- FX rate 表示（USD→JPY 換算）

**Addresses:** 全 v1 table stakes features（ポートフォリオ表示、reasoning 表示、パフォーマンス指標）
**Avoids:** SSR 経由のデータ漏洩 — Server Components に `server-only` パッケージを適用

### Phase 5: Deployment + Hardening

**Rationale:** クラウドデプロイ前の最後の安全確認フェーズ。セキュリティと運用信頼性を担保する。

**Delivers:**
- `vercel.json` cron 設定（`0 9 * * 1-5` UTC）
- Vercel 環境変数設定（ANTHROPIC_API_KEY / DATABASE_URL / CRON_SECRET / SESSION_SECRET）
- `curl` によるパスワード保護の検証（全 `/api/` ルート、未認証 401 確認）
- Anthropic usage API によるトークンコスト監視（day spend > $0.50 アラート）
- ログインエンドポイントへの rate limiting（brute-force 対策）
- 本番初回 Cron 発火確認と idempotency テスト（同日 2 回実行で DB に 1 レコードのみ）

**Avoids:** 全セキュリティ pitfalls（Pitfall 9）、Vercel Cron 二重実行問題

### Phase Ordering Rationale

- スキーマを最初に固める理由: transcript の JSONB カラム設計、adjusted/unadjusted 価格カラム名、ticker whitelist など、後から変更困難なデータ構造が多い。
- Market Data を Agent より前に構築する理由: TradeExecutor が price_snapshots に依存し、外部 API の異常系（Alpha Vantage quota、yfinance 破損）を先に封じ込める。
- Dashboard を Agent より後にする理由: 表示するデータが存在しない状態での UI 実装はバグ検出が難しい。
- Deployment を最後にする理由: セキュリティ検証（curl テスト、env var 確認）をコード完成後に一括実施する。

### Research Flags

**Phase 1 で必須確認（`/gsd-research-phase` 推奨）:**
- `@anthropic-ai/claude-agent-sdk` vs `@anthropic-ai/sdk` の Vercel Hobby での実際の動作
- Vercel Fluid Compute の実際のタイムアウト上限（無料 Hobby プランでの実測値）
- `vercel.json` maxDuration 設定の Hobby プランにおける有効性

**Phase 3 で確認推奨:**
- 選定 SDK の transcript 構造（Agent SDK の `query()` loop vs 手書き messages loop の差異）
- Anthropic streaming API 使用時のタイムアウト影響

**標準パターン（research 不要）:**
- Phase 1 DB + Auth: Drizzle + Neon + iron-session は公式ドキュメント充実
- Phase 2 Market Data: Finnhub / Stooq は REST API、circuit breaker パターンは確立済み
- Phase 4 Dashboard: Next.js Server Components + lightweight-charts は公式チュートリアルあり
- Phase 5 Deployment: Vercel env vars + cron 設定は公式ドキュメント充実

---

## Confidence Assessment

| Area | Confidence | Notes |
|---|---|---|
| Stack (Core) | HIGH | Next.js / Neon / Drizzle / iron-session / lightweight-charts は公式ドキュメントで全て検証済み |
| Stack (AI Layer) | LOW | claude-agent-sdk vs standard SDK の Vercel Hobby での動作は未実測。Phase 1 で確定が必要 |
| Stack (Market Data JP) | MEDIUM | yahoo-finance2 は unofficial API。安定性に SLA なし。Stooq fallback は安定だが fundamentals 非対応 |
| Features | HIGH | Table stakes / differentiators / anti-features の分類は他ツール比較と PROJECT.md 要件から十分に根拠付けられている |
| Architecture | HIGH | 主要パターン（Cron → Route Handler、Server Components direct query、idempotent guard）は公式ドキュメントで確認済み |
| Pitfalls | HIGH | 各 pitfall は実際のコードベースの issue、公式制限ドキュメント、セキュリティ研究から引用 |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **AI 実行レイヤー選択（CRITICAL）**: `claude-agent-sdk` と `@anthropic-ai/sdk` のどちらを採用するか未確定。Vercel Hobby での実測タイムアウトと SDK の transcript 構造を Phase 1 で検証して確定する。AgentRunner の内部実装に直接影響する。

- **Vercel Fluid Compute タイムアウト（IMPORTANT）**: ARCHITECTURE.md は 300 秒可能と記載するが、PITFALLS.md は 60 秒制限を問題視する。Hobby プランでの実際の maxDuration 上限を Phase 1 で確認する。60 秒しか使えない場合は Phase 3 で Inngest/QStash 統合が必須となる。

- **FX レート取得源（MINOR）**: USD→JPY 換算に使うレートの取得先が未確定。yahoo-finance2 の `USDJPY=X` ティッカーが最も現実的な選択肢だが、JP market data と同じ failure domain に入ることを考慮する。

- **JP ファンダメンタルズ取得品質（MINOR）**: yahoo-finance2 の JP fundamentals（P/E 等）は品質が不安定。Claude context の品質に影響するが、ファンダメンタルズなしでも reasoning は可能。Phase 2 の実装時に品質確認する。

---

## Sources

### Primary (HIGH confidence)
- [Vercel Cron Jobs 公式](https://vercel.com/docs/cron-jobs) — Hobby 1 回/日制限、cron 設定方法
- [Vercel Fluid Compute 公式](https://vercel.com/changelog/higher-defaults-and-limits-for-vercel-functions-running-fluid-compute) — タイムアウト上限
- [Vercel + Claude Agent SDK sandbox 公式 KB](https://vercel.com/kb/guide/using-vercel-sandbox-claude-agent-sdk) — Hobby 45 分制限
- [Claude Agent SDK Overview 公式](https://code.claude.com/docs/en/agent-sdk/overview) — subprocess アーキテクチャ確認
- [Drizzle + Neon 公式チュートリアル](https://orm.drizzle.team/docs/tutorials/drizzle-nextjs-neon) — Next.js App Router 統合確認
- [iron-session v8 リリースノート](https://github.com/vvo/iron-session/releases/tag/v8.0.0) — App Router cookies() API 確認
- [Finnhub rate limits 公式](https://finnhub.io/docs/api/rate-limit) — 60 calls/min 無料確認
- [Alpha Vantage free tier 公式](https://www.alphavantage.co/support/) — 25 req/day 確認
- [J-Quants API 公式](https://jpx-jquants.com/en) — 12 週遅延確認、不採用根拠
- [Next.js データセキュリティ公式](https://nextjs.org/docs/app/guides/data-security) — server-only パッケージ推奨

### Secondary (MEDIUM confidence)
- [yahoo-finance2 npm](https://www.npmjs.com/package/yahoo-finance2) — v3.14.0、server-side only 確認
- [lightweight-charts React チュートリアル公式](https://tradingview.github.io/lightweight-charts/tutorials/react/simple) — React 19 対応確認
- [TradingAgents GitHub](https://github.com/TauricResearch/TradingAgents) — AI trading agent の tool 設計パターン参考
- [Inngest: Vercel long-running functions](https://www.inngest.com/blog/vercel-long-running-background-functions) — バックグラウンドキュー選択肢

### Tertiary (LOW confidence)
- [Yahoo Finance スクレイピング合法性](https://scrapfly.io/blog/posts/guide-to-yahoo-finance-api) — 個人利用は灰色。商用再配布は明確に禁止
- [Indirect prompt injection 成功率 80%](https://www.sciencedirect.com/article/pii/S2405959525001997) — 2026 研究、sanitization 対策根拠
- [LLM 幻覚率 30-50%](https://www.tradingcentral.com/blog/hallucination-in-ai-why-it-is-risky-for-investors---and-how-we-solved-this-problem-with-fibi) — ticker whitelist 必須の根拠

---

### Known Conflicts Reconciled

| Conflict | STACK.md | ARCHITECTURE.md | Resolution |
|---|---|---|---|
| Claude Agent SDK 使用可否 | 標準 SDK + 手書き loop を推奨 | Agent SDK 使用を前提に設計 | Phase 1 で Vercel Hobby 実測後に確定。両候補を並記 |
| Vercel タイムアウト | 60 秒制限が問題 | Fluid Compute で 300 秒可能 | Fluid Compute 先行設定 + Inngest/QStash を fallback として確保 |
| JP 株データソース | yahoo-finance2 推奨 | Stooq fallback 必須 | yahoo-finance2 primary + Stooq fallback を circuit breaker で切替 |

---

*Research completed: 2026-04-11*
*Ready for roadmap: yes*
