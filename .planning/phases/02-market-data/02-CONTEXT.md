# Phase 2: Market Data - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning
**Mode:** User delegated all gray areas to Claude's discretion

<domain>
## Phase Boundary

米国株（Finnhub）と日本株（yahoo-finance2 + Stooq fallback）の日次 OHLCV・ニュース・ファンダメンタルを `price_snapshots`（および必要に応じた付随テーブル/列）に永続化する**データ取得パイプライン**を構築する。Phase 3 のエージェントは実行時に外部 API を一切叩かず DB のみを参照する（DATA-03）。

**Scope:**
- ティッカーホワイトリスト定義とバリデーション（DATA-05）
- Finnhub クライアント: 米国株 OHLCV + 基本ファンダメンタル + company news（DATA-01）
- yahoo-finance2 クライアント: 日本株 OHLCV（primary）（DATA-02）
- Stooq CSV fallback: 日本株の yahoo-finance2 失敗時（DATA-02）
- FX レート（USD/JPY）スナップショット（D-03 実装）
- Market calendar（休場判定）と `market_closed` フラグ（DATA-04）
- `price_snapshots` スキーマ拡張（OHLCV・raw/adj 分離・news・fundamentals 列の追加マイグレーション）
- 取得エントリポイント `/api/cron/fetch-market-data`（CRON_SECRET 認証）
- 初回バックフィル（100 営業日分）と増分取得（T-1 のみ）

**Out of scope for this phase:**
- ニュースの LLM 圧縮（3 ヘッドライン + 1 行要約） → Phase 3 の prompt builder で実施
- `<external_news_content>` XML タグでのプロンプト組み立て → Phase 3
- エージェント実行・売買判断 → Phase 3
- Vercel Cron スケジューリング本番設定 → Phase 5
- ダッシュボードでの価格表示 → Phase 4
- TA 指標（RSI/MACD/SMA）の事前計算（ただし 100 日バックフィルで Phase 3 が実行時計算できる状態にする）

</domain>

<decisions>
## Implementation Decisions

### Ticker Whitelist

- **D-01:** ホワイトリストは **TypeScript ハードコードファイル** `config/tickers.ts` に定義する。DB テーブルや env 変数は使わない。編集は git コミットベース（自分専用なので PR フローは不要、直接 commit）。
  - **Rationale:** 型安全、バージョン管理、レビュー履歴、デプロイと同期、無料（DB 行・env 管理コスト 0）。`lib/env.ts` と同じ pattern。
- **D-02:** 初期銘柄数は **米国 6 + 日本 4 = 10 銘柄** でスタート。将来の拡張を前提に、20 銘柄まではコード変更だけで耐える構成にする。
  - **US 初期候補:** AAPL, MSFT, NVDA, GOOGL, AMZN, SPY（SPY は Phase 4 のベンチマーク比較に必要）
  - **JP 初期候補:** 7203.T (トヨタ), 6758.T (ソニー), 9984.T (ソフトバンクG), 7974.T (任天堂)
  - **Rationale:** Finnhub 無料枠 60/min、10 銘柄 × 3 エンドポイント = 30 calls で 1 分以内に完走。Neon 0.5 GB 無料枠で数年運用可能。
- **D-03:** `Ticker` 型は `{ symbol: string; market: 'US' | 'JP'; name: string; currency: 'USD' | 'JPY'; assetClass: 'equity' | 'etf' }` を含む。ホワイトリストチェックは `isWhitelisted(symbol)` util で一点集中し、全取得関数が冒頭で呼ぶ（DATA-05 の幻覚防止）。
- **D-04:** 非ホワイトリスト銘柄に対する取得は `WhitelistViolationError` を投げて呼び出し元で拒否される。ログにも記録するがリトライしない。

### News & Fundamentals Storage

- **D-05:** Phase 2 は **raw データ永続化のみ**。LLM 圧縮（3 ヘッドライン + 1 行要約）は Phase 3 の prompt builder で実施する。
  - **Rationale:** Phase 2 は純粋なデータ層。圧縮はプレゼンテーション（prompt 組み立て）ロジックで、責務が異なる。raw を保持することでプロンプト実験の自由度が上がる。
- **D-06:** ニュースとファンダメンタルは `price_snapshots` とは**別テーブル**に保存する：
  - `news_snapshots`: `(id, symbol, news_date, headline, url, source_domain, published_at, raw jsonb, fetched_at)` — 1 銘柄 × 1 日に複数行
  - `fundamentals_snapshots`: `(id, symbol, as_of_date, pe_ratio, eps, market_cap, raw jsonb, fetched_at)` — 1 銘柄 × 1 日に 1 行
  - **Rationale:** price_snapshots は 1:1:(symbol,date) の時系列、ニュースは 1:N、ファンダメンタルは更新頻度が違う（週次程度）。JSONB に押し込めると Phase 3 の prompt builder がクエリしづらい。ただし生 payload は `raw jsonb` に残してスキーマ変更耐性を確保する。
- **D-07:** ファンダメンタルは **Finnhub Basic Financials** から取得（P/E, EPS, market cap, 52-week high/low）。米国株のみ対象、日本株のファンダメンタルは Phase 2 では取得しない（yahoo-finance2 にもあるが Phase 3 で必要になった時点で追加検討）。
  - **Rationale:** 日本株のファンダ取得は優先度低。Phase 3 のエージェントが日本株に対して fundamentals を要求しないならば無駄な実装になる。

### Schema Extensions (price_snapshots)

- **D-08:** `price_snapshots` に以下の列を追加するマイグレーションを Phase 2 Plan 冒頭で実行する：
  - `open numeric(18,4)`, `high numeric(18,4)`, `low numeric(18,4)`, `volume bigint` (OHLCV 完成)
  - `raw_close numeric(18,4)` (split 前の生 close)、既存 `close` を **adjusted close** として扱う（split-adjusted, NOT dividend-adjusted）
  - **Rationale:** PITFALLS Pitfall 2（split で ghost P&L）対策。現行 `close` の意味論を「adjusted」に固定し、split 検知時の再計算時に raw と比較できる状態にする。
- **D-09:** 既存の `source text` 列は `'finnhub' | 'yahoo' | 'stooq'` のいずれかを必ず取る。Check 制約までは入れない（将来の追加を阻害しない）が TypeScript の union 型でコード側を縛る。
- **D-10:** 既存 `fxRateToJpy` カラムは株式行では NULL、FX 行では必須。FX スナップショットは **同じ price_snapshots テーブル**に `symbol='JPYUSD'`, `assetClass='fx'`, `currency='USD'`, `close = USD/JPY レート` として保存する（D-03 に沿う）。別テーブルは作らない。
  - **Rationale:** 時系列クエリが `price_snapshots` に集約されるので Phase 4 ダッシュボードが 1 テーブル SELECT で済む。

### Market Source & Fallback Strategy

- **D-11:** 米国株取得は **Finnhub のみ**。Alpha Vantage（25 req/day）は使わない（PITFALLS Pitfall 1）。
- **D-12:** 日本株取得は **yahoo-finance2 primary → Stooq CSV fallback** の二段階。
- **D-13:** Fallback 発火条件:
  1. yahoo-finance2 が例外を投げた（ネットワーク/scraping 破損）
  2. yahoo-finance2 が空のレスポンス `[]` を返した
  3. 取得した `historicalByDate` の最新日が期待営業日より 1 日以上古い（stale data 検知）
  - **Rationale:** yahoo-finance2 は非公式ラッパーで SLA なし。単純な exception catch だけでは silent failure（PITFALLS Pitfall 1 と同じパターン）を見逃す。
- **D-14:** Fallback 切替ログは `console.warn` + `fetch_failures` (仮) 用の軽量ログテーブルまでは作らず、`news_snapshots.raw` のような JSONB ログ文字列に記録する方針もとらない。**stdout ログ + price_snapshots.source カラム**で事後追跡できれば十分（自分専用プロジェクト）。
- **D-15:** Stooq でも失敗した場合は当該 ticker をスキップし、全体パイプラインは継続する（1 銘柄の失敗が全体を止めない）。パイプライン終了時に失敗 ticker 一覧を summary として返す。

### Market Calendar

- **D-16:** 休場判定は **二段構え**:
  1. 週末（土日）は `date-fns` の `isWeekend` で確実に skip
  2. 祝日は `config/market-holidays.ts` に **2026 年分の NYSE + 東証 祝日リスト**をハードコード
  - **Rationale:** `nyse-holidays` 等の npm は過剰。2026 年分 + 2027 年分を都度追加すれば個人プロジェクト寿命には十分。
- **D-17:** `config/market-holidays.ts` の構造:
  ```ts
  export const US_HOLIDAYS_2026 = ['2026-01-01', '2026-01-19', ...] as const
  export const JP_HOLIDAYS_2026 = ['2026-01-01', '2026-01-02', ...] as const
  ```
  - 型: `ReadonlyArray<string>`（`YYYY-MM-DD` ISO 形式）
- **D-18:** `market_closed: true` 行は休場日用の「何もしなかった」マーカー。close/OHLCV は NULL、`source='none'`。Phase 4 のチャートはこの行を「値なし」としてスキップ描画する。
  - **Rationale:** 行を作らないと「取得漏れ」と「休場」を区別できない。行を作ることで監査可能。
- **D-19:** タイムゾーン処理は **固定 2 カットオフ**: 米国データは `America/New_York` の 16:30 close 後、日本データは `Asia/Tokyo` の 15:00 close 後に確定。サーバー実装は UTC で動くが、**入力の営業日判定は各市場のローカル日付に変換**してから `date-fns-tz` で行う。
  - **Rationale:** PITFALLS Pitfall 3（タイムゾーン／先見情報漏洩）対策。

### Entry Point & Execution Model

- **D-20:** Phase 2 では **独立したエンドポイント** `/api/cron/fetch-market-data` を作る。Phase 3 の `/api/cron/daily-run` はこれを**前提として**、実行開始時に「今日の fetched_at が既に存在するか」をチェックし、無ければ fetch を先に呼ぶ（内部直接呼び出し、HTTP 往復しない）。
  - **Rationale:** 独立エンドポイントは手動トリガ・デバッグ・リトライが楽。Phase 5 で Vercel Cron を設定する際も、2 つのエンドポイントを別々にスケジュール可能。
- **D-21:** `/api/cron/fetch-market-data` は `CRON_SECRET` ヘッダ認証必須（Phase 1 Plan 01-04 の proxy.ts bypass 対象である `/api/cron/*` に該当、proxy は通すが route handler 内でヘッダ検証）。
- **D-22:** バックフィル挙動: 初回実行（= 対象 ticker の price_snapshots 行が 0 件）は **過去 100 営業日分** を一括取得。以降は **T-1（前営業日）1 日分のみ**を増分取得。100 営業日は Phase 3 の TA 指標（RSI 14 / MACD 26 / SMA 50）の計算余裕を見込んだ値。
- **D-23:** バックフィル中に API rate limit に当たる場合: Finnhub は 60/min なので 10 ticker × 3 endpoint × 100 日では足りない → **OHLCV は `/stock/candle` バルク endpoint を使う**（1 call で 100 日取得）、news は 5 日ずつ分割、fundamentals は 1 call/ticker。全体で 10 × (1 + 20 + 1) = 220 calls、約 4 分で完走。Vercel Hobby の 60 秒制限を超えるため、バックフィルはローカル CLI（`pnpm tsx scripts/backfill.ts`）から実行する前提。
- **D-24:** 日次増分取得（T-1 のみ）は 10 × 3 = 30 calls で 1 分以内、Vercel Hobby 60 秒制限内で完走可能。

### FX Rate Ingestion

- **D-25:** USD/JPY レートは **yahoo-finance2 の `JPY=X`** を使用（別 API キー不要、既存 SDK 統一）。
  - **Rationale:** Finnhub forex は有料プラン、ECB は EUR 基軸で USD/JPY 直接は無い。yahoo-finance2 `JPY=X` は日次 close で十分。
- **D-26:** FX 取得頻度は **1 日 1 レコード**。NY クローズ後の最終値（= 翌営業日 UTC 06:00 頃に確定）を `symbol='JPYUSD'` として `price_snapshots` に 1 行追加。`assetClass='fx'`, `currency='USD'`, `close=<レート>`, `fxRateToJpy=1/<レート>` を記録。
- **D-27:** JPY 換算ロジック自体は Phase 3（positions/trades 書き込み時）に属する。Phase 2 は FX レートを永続化するだけ。

### Claude's Discretion

- マイグレーション分割戦略（1 マイグレーションで OHLCV + news + fundamentals 一括 vs 3 分割）
- `lib/market/` 配下のファイル分割構成（`finnhub.ts`, `yahoo.ts`, `stooq.ts`, `orchestrator.ts` など）
- Ticker whitelist の実装詳細（`Map<string, Ticker>` か `readonly Ticker[]` か）
- パイプラインの並列度（Promise.all で全 ticker 同時 vs p-limit で throttle）
- テストフィクスチャの作り方（Finnhub / yahoo response の記録データをどこに置くか）
- `market_closed` 行のデフォルト値列（どの列を NULL にしどれを埋めるか）
- ログの verbosity レベル
- エラークラスの階層（`MarketDataError` 抽象 → `FinnhubError`, `YahooError`, `StooqError`, `WhitelistViolationError`）

### Folded Todos

（Phase 2 に折り込むべき todo は検出されず）

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-Level
- `.planning/PROJECT.md` §Key Decisions — AI Layer Confirmed、仮想資金 1000 万円、現物ロングのみ
- `.planning/REQUIREMENTS.md` §Data Layer — DATA-01/02/03/04/05 の受け入れ条件
- `.planning/ROADMAP.md` §Phase 2 — Success criteria 5 項目
- `.planning/STATE.md` — 現在のプロジェクト状態（Phase 1 完了確認）

### Prior Phase Decisions
- `.planning/phases/01-foundation/01-CONTEXT.md` — D-02 numeric(18,4)、D-03 JPY 単一ポートフォリオ、D-17-D-21 env 方針
- `.planning/phases/01-foundation/01-01-SUMMARY.md` — 実装済み Drizzle schema（price_snapshots 最小構成）
- `.planning/phases/01-foundation/01-05-SUMMARY.md` — Gemini SPIKE 実測（Phase 3 エージェント接続点）
- `.planning/phases/01-foundation/01-VERIFICATION.md` — Phase 1 完了ステータス

### Research
- `.planning/research/STACK.md` — Finnhub / yahoo-finance2 / Stooq 選定理由、無料枠比較
- `.planning/research/ARCHITECTURE.md` — MarketFetcher コンポーネント配置 (`lib/market/`)、cron エントリポイント設計
- `.planning/research/PITFALLS.md` — Pitfall 1（Alpha Vantage 罠）、Pitfall 2（split/adj 問題）、Pitfall 3（Vercel 60 秒）、Pitfall 4（タイムゾーン漏洩）
- `.planning/research/FEATURES.md` — 機能要件の全体像

### Source Code (already implemented — read before planning)
- `db/schema.ts` — `priceSnapshots` 現行定義（拡張が必要）
- `db/index.ts` — Drizzle client singleton with server-only guard
- `drizzle.config.ts` — マイグレーション設定、`DATABASE_URL_DIRECT` 使用
- `lib/env.ts` — 環境変数検証パターン（`FINNHUB_API_KEY` 追加先）
- `proxy.ts` — `/api/cron/*` を bypass 対象にしているので fetch-market-data も対象

### External Docs (fetch via Context7 during planning)
- `finnhub-node` SDK 最新版 API reference（`stockCandles`, `companyNews`, `companyBasicFinancials`）
- `yahoo-finance2` v3 API（`historical`, `quote`, `historicalByDate`, `JPY=X` 取得方法）
- Drizzle ORM `ALTER TABLE` マイグレーション文法（既存テーブル拡張）
- `date-fns-tz` の `zonedTimeToUtc` / `utcToZonedTime` — タイムゾーン境界処理
- Vercel Hobby serverless function timeout の最新値（バックフィルを CLI に逃がす判断根拠）

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`db/index.ts`**: server-only Drizzle client singleton — 取得パイプラインはこれを import して書き込む
- **`lib/env.ts`**: zod ベースの環境変数 runtime 検証 — `FINNHUB_API_KEY` を追加する先（schema 拡張パターンは既に確立）
- **`db/schema.ts`**: `priceSnapshots` 定義 — 拡張マイグレーションの起点。既に `(symbol, price_date)` UNIQUE 制約があり冪等 upsert が可能
- **`drizzle.config.ts`**: `drizzle-kit push --force` / `drizzle-kit migrate` の両方が動作確認済み（Phase 1 Plan 01-01）

### Established Patterns
- **server-only guard**: `import 'server-only'` を全 `lib/` モジュールの 1 行目に置く（Phase 1 で確立）
- **環境変数 fail-fast 検証**: `lib/env.ts` で zod parse、起動時に throw（Phase 1 Plan 01-02）
- **Route Handler = 書き込みエントリ**: `/api/cron/*` パターンは `proxy.ts` bypass 済み（Phase 1 Plan 01-04）
- **atomic commit per task**: Plan 内のタスク単位で独立コミット（Phase 1 Plan 01-01/02/03/04/05 全て実施）

### Integration Points
- **`proxy.ts`** L21-25: bypass 対象に `/api/cron/fetch-market-data` が自動的にマッチ（matcher が `/api/cron/*` を除外していないが、bypass ロジックがパスプレフィックスで走る）
- **`lib/env.ts`**: `FINNHUB_API_KEY` schema 追加 → `.env.example` 反映 → `.env.local` で実値
- **`db/schema.ts`**: price_snapshots 拡張 + news_snapshots / fundamentals_snapshots 新規テーブル追加 → `drizzle-kit generate` で migration 生成
- **Phase 3 `/api/cron/daily-run`**: 起動時に `SELECT COUNT(*) FROM price_snapshots WHERE price_date = today_tz` を実行し、0 なら `fetchMarketData()` を内部直接呼び出し

### Creative Options Enabled
- 既存 `(symbol, price_date)` UNIQUE 制約により **INSERT ON CONFLICT DO UPDATE** で冪等 upsert が自然に書ける（drizzle の `.onConflictDoUpdate()`）
- `priceSnapshots.assetClass` 列が既に存在 → FX 行を同テーブルに乗せる D-10 が自然に動く

</code_context>

<specifics>
## Specific Ideas

- **実装スタート点**: `lib/market/finnhub.ts` に `fetchUsPrice(symbol, from, to)` を書いてローカルでホワイトリスト内 1 銘柄のみ実行できる状態を最初のチェックポイントにする
- **テスト戦略**: 各クライアント（finnhub/yahoo/stooq）の response を `__tests__/fixtures/market/` に JSON 保存し、ネットワークモックで決定論的テスト。Phase 1 で `__tests__` は既に整備済み
- **PITFALLS 遵守テスト**: TSLA 2022-08 split を含む日付範囲で raw_close と adjusted close の差が記録されることを確認するテストを入れる
- **バックフィル CLI**: `scripts/backfill.ts` を `pnpm tsx` で実行可能にし、`--symbol AAPL --days 100` でターゲット指定実行
- **failure summary の形状**: `{ ok: string[], failed: Array<{ symbol: string; reason: string }>, duration_ms: number }` を return、fetch-market-data route の JSON body に含める

</specifics>

<deferred>
## Deferred Ideas

- **日本株ファンダメンタル取得** — D-07 により Phase 2 からは除外。Phase 3 でエージェントが必要とした時点で再検討
- **ニュース LLM 圧縮** — Phase 3 prompt builder に属する（D-05）
- **TA 指標の事前計算キャッシュ** — Phase 3 で実行時計算が遅ければ price_snapshots に列追加する検討。Phase 2 では生データまで
- **複数年祝日カレンダー** — 2026 年分のみ、2027 年分は時期が来たら追加（D-16）
- **バックフィル完了後の split / dividend 自動検知再計算** — PITFALLS Pitfall 2 の完全対策は Phase 2 では最小限（raw + adjusted 両保存）。コーポレートアクション対応の再計算は将来 milestone
- **`fetch_failures` ログテーブル** — D-14 で不要と判断。運用中に監査要件が出たら追加
- **複数通貨ポートフォリオ** — D-03 で非対応と確定（JPY 換算単一）
- **リアルタイム価格 / intraday** — PROJECT.md §Out of Scope

</deferred>

---

*Phase: 02-market-data*
*Context gathered: 2026-04-12*
*All gray areas resolved by Claude's discretion (user delegated)*
