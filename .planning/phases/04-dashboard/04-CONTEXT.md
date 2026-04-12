# Phase 4: Dashboard - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

蓄積されたトレードログ・Geminiの推論テキスト・パフォーマンス指標をブラウザで読めるダッシュボードUIを完成させる。Core Valueの「なぜそう判断したか」を日単位で追跡できることが最優先。

**Scope:**
- ポートフォリオ総資産の時系列ラインチャート（ベンチマーク SPY + TOPIX ETF 重ね表示）（DASH-01）
- 現在ポジション一覧テーブル + 配分比率パイチャート（DASH-02）
- 取引タイムライン（1日単位、BUY/SELLのみ、判断理由デフォルト展開）（DASH-03）
- パフォーマンス指標グリッドカード（累計リターン・ベンチマーク差分・シャープレシオ・最大DD・勝率・取引数）（DASH-04）
- 確信度（high/medium/low）の色分け表示（DASH-05）
- TOPIX ETF (1306.T) のホワイトリスト追加（ベンチマーク比較用データ取得のため）

**Out of scope for this phase:**
- フルテキスト検索（v2 REASON-01）
- 複数エージェント比較表示（v2 REASON-03）
- リスク管理UI（v2 RISK-01/02）
- Vercel Cron 本番設定（Phase 5）
- ライトテーマ切替（将来検討）

</domain>

<decisions>
## Implementation Decisions

### ページ構成とレイアウト

- **D-01:** ダッシュボードは **1ページスクロール構成**。タブやサイドバーナビは不要。自分専用ツールで10銘柄のため、全セクションを一望できるシンプルさを優先。
- **D-02:** セクション配置順（上から下）: パフォーマンス指標カード → ポートフォリオ推移チャート → ポジション一覧 + 配分パイチャート → トレードタイムライン。
- **D-03:** **ダークテーマ**を採用。金融ダッシュボードの標準的な暗い背景 + 明るいテキスト。チャートの視認性が高い。Tailwind CSSの `dark:` は使わず、ベース自体をダーク配色で設計する。
- **D-04:** ヘッダーにはアプリ名（またはポートフォリオ名）と Sign out ボタンを配置。既存の `app/dashboard/page.tsx` を拡張する。

### チャート表現と操作性

- **D-05:** ポートフォリオ推移チャートは **lightweight-charts のラインチャート**。3本の折れ線: ポートフォリオ総資産（メインカラー）、SPY（グレー系）、TOPIX ETF（グレー系別色）。`"use client"` コンポーネントで描画。
- **D-06:** 3系列は **%リターンで正規化**して重ね表示する。初日=0%として、各系列の初期値からの変化率を計算。絶対値（円）での比較は単位が異なるため不適切。
- **D-07:** ベンチマークは **SPY + TOPIX ETF (1306.T)**。1306.T を `config/tickers.ts` のホワイトリストに `assetClass: 'etf'` として追加する。Phase 2 のデータ取得パイプラインで自動的にprice_snapshots に蓄積される。
- **D-08:** 期間切替機能は **なし（全期間のみ表示）**。運用初期はデータが少なく期間切替の意味が薄い。データが蓄積されてから後日検討。
- **D-09:** 配分比率は **Recharts のパイ/ドーナツチャート**で表示。現金 + 各銘柄の時価評価額の割合を可視化。Recharts はこの用途（10セグメント以下のカテゴリ）に最適。
- **D-10:** `lightweight-charts` と `lightweight-charts-react-wrapper` を新規インストールする。`recharts` も新規インストールする。

### トレードタイムライン

- **D-11:** タイムラインの表示単位は **1日単位**。日付ごとに `market_assessment`（全体市場分析）をヘッダーに、その下にBUY/SELLの銘柄カードを並べる。
- **D-12:** **HOLD判断の銘柄は非表示**。BUY/SELLの取引があった銘柄のみ表示する。全銘柄がHOLDの日は market_assessment のみ + 「取引なし」表示。タイムラインの簡潔さを優先。
- **D-13:** 各銘柄カードには **判断理由（reasoning）がデフォルト展開**で表示される（DASH-03）。アコーディオンで折りたたみ可能にするが、初期状態は展開。Core Valueの「読みやすさ最優先」に直結。
- **D-14:** 確信度（high/medium/low）は **色で視覚的に区別**（DASH-05）。high=緑系、medium=黄/オレンジ系、low=赤系。バッジまたはインジケーターとして銘柄カードに配置。
- **D-15:** ページネーションは **直近20日分を初期表示 + 「もっと見る」ボタン**で追加読み込み。初期ロードを軽くし、必要に応じて過去を遡れる。

### パフォーマンス指標カード

- **D-16:** 6指標の計算は **サーバーサイド**（Server Component または Route Handler）で実行。`portfolio_snapshots` + `trades` をクエリして計算済み値をクライアントに返す。
- **D-17:** 指標カードは **3×2 グリッドレイアウト**。各カードに指標名・値・プラス=緑/マイナス=赤の色分け。
  - 1行目: 累計リターン(%) | vs SPY差分(%) | シャープレシオ
  - 2行目: 最大ドローダウン(%) | 勝率(%) | 取引数
- **D-18:** シャープレシオは `portfolio_snapshots` の日次リターン系列から計算。リスクフリーレートは0%で近似（個人学習プロジェクトのため簡略化）。最大ドローダウンはピークからの最大下落率。勝率は `trades` テーブルの売却取引のうちプラスで終わった比率。

### Claude's Discretion

- コンポーネント分割構成（`app/dashboard/components/` 配下のファイル名・構成）
- lightweight-charts の具体的なスタイリング（色コード、ラインの太さなど）
- ダークテーマの具体的な配色パレット（Tailwind のカスタムカラー設定）
- ポジションテーブルのカラム幅・ソート可否
- パイチャートのカラーパレット
- 「もっと見る」の追加読み込み件数
- レスポンシブ対応の具体的なブレイクポイント
- API Route のエンドポイント設計（`/api/dashboard/*` など）

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-Level
- `.planning/PROJECT.md` §Key Decisions — AI Layer確定（gemini-2.5-flash）、仮想資金1000万円、現物ロングのみ
- `.planning/REQUIREMENTS.md` — DASH-01〜05 の受け入れ条件
- `.planning/ROADMAP.md` §Phase 4 — Success criteria 4項目

### Prior Phase Decisions
- `.planning/phases/01-foundation/01-CONTEXT.md` — D-02 numeric(18,4)精度、D-03 JPY単一ポートフォリオ、D-12-16 Auth UX
- `.planning/phases/02-market-data/02-CONTEXT.md` — D-01/02 ティッカーホワイトリスト構成、D-18 market_closed行のスキップ描画、D-06 news/fundamentals別テーブル
- `.planning/phases/03-agent-pipeline/03-CONTEXT.md` — D-01 観察重視型トーン、D-03 日本語reasoning、D-07 JSON出力スキーマ、D-11 quantity=0保持、D-12 毎日portfolio_snapshots記録

### Source Code (already implemented — read before planning)
- `app/dashboard/page.tsx` — 現在のplaceholder（Phase 1で作成）
- `app/layout.tsx` — RootLayout（Geistフォント、Tailwind v4）
- `db/schema.ts` — 全テーブル定義（portfolioSnapshots, positions, trades, decisions, priceSnapshots等）
- `config/tickers.ts` — ティッカーホワイトリスト（1306.T追加先）
- `lib/ai/client.ts` — Gemini client singleton
- `lib/agent/types.ts` — AgentDecision型定義（confidence, reasoning等）
- `proxy.ts` — 認証ミドルウェア（/dashboard保護済み）

### External Docs (fetch via Context7 during planning)
- `lightweight-charts` v5 — React wrapper API、LineSeries、テーマカスタマイズ
- `lightweight-charts-react-wrapper` v3 — `ChartContainer`, `LineSeries` コンポーネント
- `recharts` v2.15 — PieChart / DonutChart API
- Next.js App Router — Server Components, `"use client"` boundary パターン

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`db/schema.ts`**: `portfolioSnapshots`（時系列チャートデータ源）、`positions`、`trades`、`decisions`（タイムライン・指標計算のデータ源）が全て定義済み
- **`config/tickers.ts`**: ホワイトリスト定義。1306.T（TOPIX ETF）を追加する先
- **`lib/agent/types.ts`**: `AgentDecision`型（confidence: high/medium/low, reasoning: string）が定義済み — タイムラインカードの型に直接使える
- **`proxy.ts`**: `/dashboard` は既に認証保護済み
- **Tailwind CSS v4**: 既にインストール・設定済み。ダークテーマの配色設定に使用
- **Geistフォント**: 既にlayout.tsxで設定済み。金融ダッシュボードの数値表示に適合

### Established Patterns
- **server-only guard**: `import 'server-only'` を全 `lib/` モジュール冒頭に置く
- **Route Handler**: `/api/cron/*` パターンが確立済み — `/api/dashboard/*` も同様の構成で作成可能
- **Drizzle クエリ**: `db/index.ts` 経由でServer Componentから直接クエリ可能

### Integration Points
- **`portfolioSnapshots`テーブル**: 時系列チャート + パフォーマンス指標計算のデータ源。`(portfolioId, snapshotDate)` でクエリ
- **`priceSnapshots`テーブル**: SPY / 1306.T のベンチマーク価格取得元。`market_closed=false` のみフィルタ
- **`positions`テーブル**: 現在ポジション一覧 + 配分比率計算
- **`trades` + `decisions`テーブル**: タイムライン表示。`trades.decisionId` → `decisions.transcript` でreasoning取得
- **`portfolios`テーブル**: 初期資金・現金残高

</code_context>

<specifics>
## Specific Ideas

- **ダークテーマ配色**: 背景はslate-900系、カード背景はslate-800系、テキストはslate-100/200、アクセントはblue-400/green-400/red-400
- **ベンチマーク正規化**: 初日のportfolio_snapshots.total_value_jpy / SPY close / 1306.T close を基準(0%)として日次%リターンを算出。SPYはUSD建てだがprice_snapshotsのclose（JPY換算前の生値）を使い、%変化で正規化すれば通貨差は問題にならない
- **勝率計算**: `trades` テーブルで action='SELL' の取引について、executedPrice × quantity > avgCost × quantity（positions参照）なら勝ち。BUYのみでまだ売却していない銘柄は勝率計算に含めない
- **タイムラインデータ取得**: `decisions` テーブルの `transcript.decisions[]` から各銘柄の action/confidence/reasoning を取得。`trades` と JOIN して実際のBUY/SELLのみフィルタ
- **1306.T追加**: `config/tickers.ts` に `{ symbol: '1306.T', market: 'JP', name: 'TOPIX連動型上場投信', currency: 'JPY', assetClass: 'etf' }` を追加。取引対象ではなくベンチマーク専用だが、データ取得は既存パイプラインで自動的に行われる

</specifics>

<deferred>
## Deferred Ideas

- **期間切替（1M/3M/6M/1Y/ALL）** — データが蓄積されてから検討。現時点では全期間のみで十分
- **ライトテーマ切替** — ダークテーマのみで開始。将来toggle追加を検討
- **銘柄単位タイムライン表示モード** — 1日単位で開始、銘柄別ビューは後日検討
- **HOLD判断の展開表示オプション** — BUY/SELLのみで開始、需要があればトグル追加
- **キャンドルスティックチャート（個別銘柄）** — 個別銘柄の価格チャートは Phase 4 スコープ外
- **フルテキスト検索（reasoning検索）** — v2 REASON-01
- **複数エージェント比較** — v2 REASON-03

### Reviewed Todos (not folded)

（該当なし）

</deferred>

---

*Phase: 04-dashboard*
*Context gathered: 2026-04-12*
