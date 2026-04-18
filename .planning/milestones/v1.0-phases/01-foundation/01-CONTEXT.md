# Phase 1: Foundation - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

DBスキーマ・認証ミドルウェア・AI Layer実装方針を確定する土台フェーズ。後続フェーズ（Market Data / Agent Pipeline / Dashboard / Deployment）が安全に実装を開始できる状態を作る。

**Scope:**
- Neon PostgreSQL上に6テーブル（portfolios/positions/trades/decisions/price_snapshots/portfolio_snapshots）のDrizzleスキーマ定義とマイグレーション
- iron-session v8 ベースの簡易パスワード保護ミドルウェア
- AI Layer（Google Gemini API via `@google/generative-ai`）のHello World SPIKEとKey Decisions記録
- 環境変数設計と開発/本番分離

**Out of scope for this phase:**
- 実際の市場データ取得（Phase 2）
- AIの売買判断ロジック（Phase 3）
- ダッシュボードUI（Phase 4）
- Vercel Cron/本番デプロイ確認（Phase 5）

</domain>

<decisions>
## Implementation Decisions

### DB Schema

- **D-01:** AIのトランスクリプト（プロンプト全文・レスポンス全文・input_data snapshot・function calls）は `decisions` テーブルの単一JSONBカラム（例: `transcript jsonb not null`）に格納する。agent_runsなど別テーブルには分けない。
- **D-02:** 価格・金額は `numeric(18,4)` 型で保持する。floating point誤差を避け、財務計算の正確性を優先する。
- **D-03:** 多通貨は取り扱わず、取得時点のFXレートでJPY換算した単一ポートフォリオとして保存する。USDティッカーもJPY換算後の数値を `positions` / `trades` / `portfolio_snapshots` に記録する。FXレート自体は `price_snapshots` に別途スナップショットしておく。
- **D-04:** 冪等性は `decisions (portfolio_id, run_date)` への UNIQUE 制約で担保する。Cronが同日2回発火した場合はINSERT ON CONFLICT DO NOTHINGでskip。
- **D-05:** 6テーブル構成を維持: `portfolios`, `positions`, `trades`, `decisions`, `price_snapshots`, `portfolio_snapshots`。`decisions` には `agent_run_id`（自身のPK兼用）、`run_date`、`transcript jsonb`、`token_cost_estimate`、`confidence`、`model_used` を含める。
- **D-06:** 各取引（`trades`）は `decision_id` を FK として持ち、どのAI判断から生まれたかを追跡可能にする。

### AI Layer Selection (PIVOTED 2026-04-11)

**Pivot note**: 当初 Anthropic Claude の Agent SDK vs 標準 SDK の比較 SPIKE を予定していたが、Anthropic は有料（最低 $5 チャージ）、ユーザーは既に有料 Gemini アカウントを保有しているため Gemini に切り替え。Gemini は Function Calling、JSON 出力、Vercel serverless 互換、無料枠寛大（1.5 Flash: 1500 req/day）と要件を満たす。

- **D-07:** AI Layer は Google Gemini API を採用する。SDK は `@google/generative-ai` (`^0.24`)。モデルは `gemini-2.0-flash`（速度・コスト・無料枠のバランス）。Phase 3 で必要に応じて `gemini-2.5-pro` 等に切り替え検討。
- **D-08:** SPIKE は Gemini 単一 SDK で実施する：`app/_spikes/gemini/route.ts` に Hello World 売買判断エージェント（`get_price`・`place_order` を Function Declaration で定義）を実装し、ローカル + Vercel Preview の両方で動作確認する。
- **D-09:** 判定基準: Vercel Preview で function calling が動き、構造化判断 JSON が返れば合格。不合格なら Phase 3 で設計変更を検討。
- **D-10:** SPIKE 結果（実測応答時間・トークン使用量・function call 挙動）を PROJECT.md の Key Decisions テーブルに記録し、`Pending → Confirmed` に更新する。SPIKE コードは採用後 `lib/ai/client.ts` に昇格し、`app/_spikes/` は削除する。
- **D-11:** SPIKE レポートは `.planning/research/AI-LAYER-SPIKE.md` に短く残す（測定値、function calling 成功/失敗、モデル選定理由）。

### Auth UX

- **D-12:** `/login` ページはパスワード単一入力のみ。ユーザー名入力フィールドはなし。
- **D-13:** セッション有効期間は30日（iron-session の `cookieOptions.maxAge = 60*60*24*30`）。
- **D-14:** 認証保護範囲はダッシュボードとAPI全域。`/login` と Cron エンドポイント（`/api/cron/*`、別途 `CRON_SECRET` ヘッダで保護）のみ除外。保護は Next.js middleware で実装。
- **D-15:** パスワード誤入力時は401応答とログインフォーム上に「パスワードが違います」を表示。レートリミットは無し（自分専用のため）。
- **D-16:** パスワード保存方式は平文envでの定数時間比較（`crypto.timingSafeEqual`）。自分専用かつハッシュ管理のオーバーヘッドは不要。

### Secret / Env Management

- **D-17:** 開発環境と本番環境を完全分離する: 別Neon DB（もしくはNeonブランチ）、別Gemini APIキー（可能なら）、別SESSION_SECRET。
- **D-18:** ローカルは `.env.local` のみ使用（Next.js標準、.gitignore済）。`.env.example` にキー名一覧を置く（値なし）。
- **D-19:** Vercel の environment は Production のみ設定する。Previewデプロイはenv未設定で動かなくてよい（学習プロジェクトのため）。SPIKE 検証時は一時的に Preview env を設定し、確認後削除する。
- **D-20:** 必須環境変数: `DATABASE_URL`, `DATABASE_URL_DIRECT`, `GEMINI_API_KEY`, `SESSION_SECRET`（32バイト以上）, `SITE_PASSWORD`, `CRON_SECRET`。将来Phase 2で `FINNHUB_API_KEY` を追加する前提。
- **D-21:** 全てのシークレットは Route Handler / Server Component からのみ参照する。`NEXT_PUBLIC_*` プレフィックスは禁止。

### Claude's Discretion

- Drizzleのマイグレーションファイル名・構成
- テーブルの timestamp カラム名（`created_at`/`inserted_at` など）
- iron-session の cookie 名
- ログインページのスタイリング詳細（Tailwindでシンプルに）
- エラー表示コンポーネントの実装方法

### Folded Todos

（折り込まれたtodoなし）

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-Level
- `.planning/PROJECT.md` — Core value, constraints, key decisions
- `.planning/REQUIREMENTS.md` — SEC-01/02/03 requirements being addressed in this phase
- `.planning/ROADMAP.md` §Phase 1 — Success criteria and phase goal

### Research
- `.planning/research/STACK.md` — Neon + Drizzle + iron-session選定理由、`@anthropic-ai/sdk` 推奨
- `.planning/research/ARCHITECTURE.md` — 6テーブルのDBスキーマ案、cron entry pointはRoute Handler
- `.planning/research/PITFALLS.md` — agent_runsトランスクリプト保存必須、Vercelタイムアウト注意
- `.planning/research/SUMMARY.md` — AI Layer選択の矛盾整理（SPIKEで確定）

### External Docs (to fetch via Context7 during planning)
- Drizzle ORM migrations guide (latest)
- Neon `@neondatabase/serverless` driver setup
- iron-session v8 Next.js App Router integration
- Next.js 16 middleware API
- `@anthropic-ai/sdk` tool_use API reference
- `@anthropic-ai/claude-agent-sdk` overview (for SPIKE comparison)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Next.js 16.2.3 + React 19.2.4 + Tailwind CSS v4** は既にbootstrap済み（package.json）
- `app/` App Router構造が標準化されている前提
- TypeScript ^5設定済み

### Established Patterns
- まだアプリケーションコードが書かれていないため、Phase 1が全パターンの出発点になる
- 以降のフェーズは Phase 1 で決めた schema / auth / env パターンを踏襲する

### Integration Points
- `proxy.ts`（プロジェクトルート、Next.js 16では middleware.ts ではなく proxy.ts）— iron-session認証チェック
- `app/login/page.tsx` — ログインUI
- `app/api/auth/login/route.ts` — 認証処理
- `db/schema.ts` + `db/index.ts` — Drizzleスキーマとクライアント
- `drizzle.config.ts` — drizzle-kit設定
- `lib/session.ts` — iron-session設定

</code_context>

<specifics>
## Specific Ideas

- **Transcript構造案（JSONB内）**: `{ system_prompt, user_prompt, tool_calls: [...], response, raw_messages, input_data_snapshot }` のような形で、後から検索・パースできる形にしておく
- **FXレート取得源**: Finnhubまたはyahoo-finance2から取得。Phase 2 で実装するが、Phase 1 のスキーマ段階で `price_snapshots.asset_class = 'fx'` を表現できるようにしておく
- **SPIKE成果物レイアウト**: `app/_spikes/agent-sdk/` と `app/_spikes/standard-sdk/` に隔離し、決定後に採用側を `lib/ai/` へ昇格、不採用側を削除

</specifics>

<deferred>
## Deferred Ideas

- Neonブランチを使った preview 環境でのデータ差し替え — Phase 5 デプロイ時に検討
- パスワードローテーションポリシー — 自分専用のため当面不要、気になったら `/gsd-add-todo`
- bcryptハッシュベース認証への切替 — 複数人利用になったら検討
- エージェントのログ検索UI（フルテキスト検索） — v2のREASON-01で扱う
- Rate limiting（ログイン試行） — 公開ツール化するときに実装

### Reviewed Todos (not folded)

（該当なし）

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-04-11*
