# Phase 2: Market Data - Research

**Researched:** 2026-04-12
**Domain:** Daily market data ingestion pipeline (US equities + JP equities + FX) on Next.js 16 / Drizzle / Neon
**Confidence:** HIGH on stack; MEDIUM on yahoo-finance2 stability (unofficial); **CRITICAL decision pivot required — see §Critical Finding**

---

## Summary

Phase 2 は米国株・日本株・USD/JPY の日次データを `price_snapshots` と新設 2 テーブル（news / fundamentals）に永続化する取得パイプラインである。既に Phase 1 で `priceSnapshots` スキーマ・Drizzle client・proxy.ts bypass・`lib/env.ts` パターン・vitest テスト基盤が揃っており、今回の仕事は 「外部 API クライアント層 + マイグレーション + cron エントリ + バックフィル CLI + テスト」 に集約される。

調査の最大の発見は **Finnhub `/stock/candle`（stockCandles）エンドポイントが 2024 年から無料枠対象外になっている**こと（403 "You don't have access to this resource"）。CONTEXT.md D-23 が前提としている「Finnhub で US OHLCV をバルク取得」は現状機能しない。**→ 推奨: US OHLCV も `yahoo-finance2.chart()` で取得し、Finnhub は news + basic financials 専用にする**（詳細は §Critical Finding）。

**Primary recommendation:** US/JP OHLCV は `yahoo-finance2` v3 の新しい `chart()` API を単一パスで使い、Finnhub は news と basic financials だけに限定する。JP 失敗時は Stooq CSV（`7203.jp` 形式）に fallback する。FX は `JPY=X` を yahoo-finance2 から取得する。マイグレーションは 1 本で OHLCV 列追加と news/fundamentals 新規テーブル作成を同時に行う。並列度は `p-limit` を使わずネイティブの逐次 `for...of` でスタート（10 ticker、60 秒枠内で余裕）、Vercel 60s 制限回避のためバックフィルは `scripts/backfill.ts` ローカル実行。

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (D-01 〜 D-27)

**Ticker whitelist**
- D-01: ホワイトリストは `config/tickers.ts` (TypeScript ハードコード) — DB/env は使わない
- D-02: 初期 10 銘柄（US 6: AAPL MSFT NVDA GOOGL AMZN SPY / JP 4: 7203.T 6758.T 9984.T 7974.T）、20 銘柄まで拡張可能構成
- D-03: `Ticker` 型 = `{ symbol, market: 'US'|'JP', name, currency: 'USD'|'JPY', assetClass: 'equity'|'etf' }`、`isWhitelisted(symbol)` util で一点集中チェック
- D-04: 非ホワイトリスト銘柄は `WhitelistViolationError` を投げて拒否、リトライしない

**News & Fundamentals storage**
- D-05: Phase 2 は raw データ永続化のみ（LLM 圧縮は Phase 3）
- D-06: 別テーブル `news_snapshots` (1:N) と `fundamentals_snapshots` (1:1/day) を新設。raw payload は `raw jsonb` で保持
- D-07: ファンダは Finnhub Basic Financials で **米国株のみ**（JP は Phase 3 で必要になったら追加）

**Schema extensions (price_snapshots)**
- D-08: `open/high/low numeric(18,4)`, `volume bigint`, `raw_close numeric(18,4)` を追加。既存 `close` は **adjusted close** として扱う（split-adjusted, NOT dividend-adjusted）
- D-09: `source` は `'finnhub' | 'yahoo' | 'stooq'` の union、check 制約は入れずコード側 TypeScript で縛る
- D-10: FX 行は `price_snapshots` に `symbol='JPYUSD', assetClass='fx', currency='USD', close=レート` として同居。別テーブル作らない

**Market source & fallback**
- D-11: 米国株は Finnhub のみ、Alpha Vantage は使わない（PITFALLS 1）
- D-12: 日本株は yahoo-finance2 primary → Stooq CSV fallback の二段階
- D-13: Fallback 発火条件: (1) 例外 (2) 空レスポンス `[]` (3) 最新日が期待営業日より 1 日以上古い（stale 検知）
- D-14: fallback ログは stdout + `price_snapshots.source` カラムで事後追跡。専用テーブル不要
- D-15: Stooq でも失敗した ticker はスキップし全体継続、失敗 ticker 一覧を summary で返す

**Market calendar**
- D-16: 週末 = date-fns `isWeekend`、祝日 = `config/market-holidays.ts` に 2026 年 NYSE + 東証 ハードコード
- D-17: `YYYY-MM-DD` ISO 形式の `readonly string[]`
- D-18: 休場日は `market_closed: true` + close/OHLCV NULL + `source='none'` の行を作成（監査可能性）
- D-19: TZ 固定カットオフ: 米国 = `America/New_York` 16:30、日本 = `Asia/Tokyo` 15:00。営業日判定は各市場ローカル日付に変換してから `date-fns-tz` で処理（PITFALLS 4 対策）

**Entry point & execution model**
- D-20: 独立エンドポイント `/api/cron/fetch-market-data`。Phase 3 の `/api/cron/daily-run` はこれを内部直接呼び出し（HTTP 往復なし）
- D-21: `CRON_SECRET` ヘッダ認証必須（proxy.ts は `/api/cron/*` を既に bypass 済み）
- D-22: 初回実行 = バックフィル 100 営業日分、以降 = T-1 のみ 1 日分（TA 指標 RSI14/MACD26/SMA50 の計算余裕）
- D-23: rate limit 対策 — **OHLCV は Finnhub `/stock/candle` バルク 1 call/ticker**（←**§Critical Finding で要変更**）、news は 5 日ずつ分割、fundamentals 1 call/ticker。合計 ~220 calls で ~4 分。Vercel 60s 超のためバックフィルは `pnpm tsx scripts/backfill.ts` ローカル実行
- D-24: 日次増分 (T-1) は 10 × 3 = 30 calls ≈ 1 分以内、Vercel 60s 内で完走

**FX rate ingestion**
- D-25: USD/JPY は yahoo-finance2 `JPY=X` を使用
- D-26: 1 日 1 レコード。NY クローズ後の最終値を `symbol='JPYUSD'`, `close=<USD/JPY>`, `fxRateToJpy=1/close` で保存
- D-27: JPY 換算ロジック自体は Phase 3（positions/trades 書き込み時）。Phase 2 は永続化のみ

### Claude's Discretion
- マイグレーション分割戦略（1 本 vs 3 本）
- `lib/market/` 配下のファイル構成（`finnhub.ts`, `yahoo.ts`, `stooq.ts`, `orchestrator.ts` 等）
- Ticker whitelist の実装詳細（`Map<string, Ticker>` vs `readonly Ticker[]`）
- 並列度（Promise.all vs p-limit vs 逐次）
- テストフィクスチャ配置
- `market_closed` 行のどの列を NULL にするか
- ログ verbosity
- エラークラス階層（`MarketDataError` 抽象 → 具象）

### Deferred Ideas (OUT OF SCOPE)
- 日本株ファンダメンタル取得 (→ Phase 3)
- ニュース LLM 圧縮 (→ Phase 3 prompt builder)
- TA 指標の事前計算キャッシュ (→ Phase 3 で判断)
- 2027 年以降の祝日カレンダー (時期が来たら追加)
- split/dividend 自動検知再計算 (将来 milestone)
- `fetch_failures` 専用ログテーブル (運用要件が出たら)
- 複数通貨ポートフォリオ (D-03 で確定 JPY 単一)
- リアルタイム / intraday 価格
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **DATA-01** | Finnhub から米国株の日次価格・ニュース・基本ファンダメンタルを取得できる | §Critical Finding: Finnhub は news + basic financials のみ free。OHLCV は yahoo-finance2 `chart()` へ移行。§US Stock Pipeline に統合手順 |
| **DATA-02** | 日本株を yahoo-finance2 (primary) + Stooq (fallback) で取得、自動切替 | §JP Stock Pipeline: yahoo-finance2 `chart('7203.T')` → 失敗時 `https://stooq.com/q/d/l/?s=7203.jp&i=d` CSV fetch。切替条件は D-13 |
| **DATA-03** | 取得データを `price_snapshots` に永続化、エージェントは DB 参照 | §Schema Migration: ALTER TABLE で OHLCV 列追加、`.onConflictDoUpdate((symbol,price_date))` で冪等 upsert |
| **DATA-04** | 市場休場日とタイムゾーン差を考慮、最新営業日ベース | §Market Calendar + §Timezone Handling: date-fns `isWeekend` + `config/market-holidays.ts` + `date-fns-tz` `formatInTimeZone` |
| **DATA-05** | ティッカーホワイトリストに基づく取得 (幻覚防止) | §Ticker Whitelist: `config/tickers.ts` + `isWhitelisted()` gate を全 fetch 関数の冒頭で呼ぶ、`WhitelistViolationError` で拒否 |
</phase_requirements>

---

## Project Constraints (from CLAUDE.md / AGENTS.md)

| Directive | Source | Phase 2 impact |
|-----------|--------|----------------|
| **Next.js 16 breaking changes** | `AGENTS.md` | `proxy.ts` (not middleware.ts)、Route Handler は `export async function GET(request: Request)` パターン。書く前に `node_modules/next/dist/docs/` を確認 |
| **TDD 原則: RED → GREEN → REFACTOR** | `~/.claude/CLAUDE.md` | 各 fetcher はまずモック fixture でユニットテストを書いてから実装 |
| **server-only guard 全 `lib/` 先頭** | Phase 1 確立 | `lib/market/**/*.ts` 全ファイル先頭に `import 'server-only'` |
| **Immutability (no mutation)** | `~/.claude/rules/coding-style.md` | 取得結果の row 組み立ては spread でコピー、`Array.push` 代わりに `map`/`flatMap` |
| **Input validation with zod** | `~/.claude/rules/coding-style.md` | Finnhub / yahoo / Stooq の各レスポンスを zod schema で parse してから DB 書き込み |
| **No `NEXT_PUBLIC_*` secrets** | `~/.claude/rules/security.md` + Phase 1 D-21 | `FINNHUB_API_KEY` は server-only env、`lib/env.ts` に追加 |
| **Many small files > few large files, 200-400 lines typical** | `coding-style.md` | `lib/market/` は source 別にファイル分割（`finnhub/*.ts`, `yahoo.ts`, `stooq.ts`, `orchestrator.ts`, `calendar.ts`, `types.ts`, `errors.ts`） |
| **Test coverage 80%+** | `testing.md` | 各 fetcher + orchestrator + calendar + whitelist に unit test、DB 書き込みに integration test |

---

## Critical Finding: Finnhub `/stock/candle` is NOT free

**Evidence (HIGH confidence):**

- [VERIFIED: GitHub Finnhub-API Issue #534](https://github.com/finnhubio/Finnhub-API/issues/534) — Maintainer 公式回答: "If you are accessing a premium endpoint, you would need a premium subscription for that data. Otherwise, the API will return a 403 error."
- [VERIFIED: finnhub-python Issue #58](https://github.com/Finnhub-Stock-API/finnhub-python/issues/58) — 2024 年 6-7 月に複数ユーザーが `stock_candles` で `FinnhubAPIException(status_code: 403): You don't have access to this resource` を報告
- [CITED: finnhub.io pricing / docs overview] — 無料枠記載は "60 calls/min, real-time US stock quotes, company news, basic financials, SEC filings, WebSocket streaming" — **candle / OHLCV 履歴の記載なし**

**Impact on CONTEXT.md decisions:**

- **D-23 の前提が崩れる**: "OHLCV は `/stock/candle` バルク endpoint を使う（1 call で 100 日取得）" は free tier では 403 になる
- **DATA-01 の「日次価格」部分を Finnhub で満たせない** → 別ソースが必要

**Recommended fix (PLANNER MUST DECIDE):**

**Option A (RECOMMENDED)**: US OHLCV も `yahoo-finance2.chart('AAPL', {period1, period2, interval:'1d'})` で取得する。理由:
  1. `yahoo-finance2` は既に JP stocks 用に stack に入っている（D-12）— 追加依存なし
  2. US ticker も同じ `chart()` API で動く（`.T` サフィックスなしで `AAPL`）
  3. 無料・無認証・split-adjusted close が取れる
  4. Finnhub は本来の free tier が強い領域（news + basic financials）に集中できる
  5. Fallback 戦略が単純化: US/JP 両方 yahoo-finance2 → Stooq (US は `aapl.us`、JP は `7203.jp`)

**Option B**: Finnhub `/quote` を日次 cron 時に叩いて close を集める + 履歴は別途。**NOT RECOMMENDED** — バックフィル 100 日が事実上不可能（`/quote` は current only）

**Option C**: Finnhub 有料プラン $7.99/month ($85/year) 契約。**NOT RECOMMENDED** — PROJECT.md の無料/低コスト制約に反する

**Claude's recommendation: Option A**. Plannerは Option A を採用し、D-23 / D-24 の rate-limit 試算を「Finnhub は news(5 日ずつ × 20 batch + fundamentals 1 call)/ticker、yahoo-finance2 は chart 1 call/ticker」に書き換えるべき。これにより Finnhub 側は 10 ticker × 21 ≈ 210 calls/min に収まり、むしろ余裕になる（60/min → 4 分バッチだが yahoo と並列で走らせれば短縮可能）。

**Tagged:** `[VERIFIED: GitHub Finnhub-API issues #534, #58, #553]`, `[CITED: finnhub.io free tier feature list]`

---

## Standard Stack

### Core (all already installed except the new additions)

| Library | Version (verified npm registry 2026-04-12) | Purpose | Confidence |
|---------|---|---|---|
| `yahoo-finance2` | **3.14.0** (latest) | US + JP + FX OHLCV via `chart()` | HIGH — `[VERIFIED: npm view yahoo-finance2]` |
| `finnhub` (node client) | **2.0.13** | News + basic financials (free tier endpoints only) | HIGH — `[VERIFIED: npm view finnhub]` |
| `date-fns` | **4.1.0** (already installed? v3 check Phase 1 — verify in plan) | `isWeekend`, business-day arithmetic | HIGH — `[VERIFIED: npm view date-fns]` |
| `date-fns-tz` | **3.2.0** | `formatInTimeZone` / `toZonedTime` for NY/Tokyo cutoffs | HIGH — `[VERIFIED: npm view date-fns-tz]` |
| `zod` | ^3.25 (already installed) | Runtime parse of all external API responses | HIGH |
| `drizzle-orm` / `drizzle-kit` | ^0.45 / ^0.31 (already installed) | Migration + `.onConflictDoUpdate()` upsert | HIGH |
| `@neondatabase/serverless` | ^1.0 (already installed) | DB client (via existing `db/index.ts` singleton) | HIGH |

### Supporting

| Library | Version | Purpose | When to Use |
|---|---|---|---|
| `papaparse` (OR native split) | 5.x | Stooq CSV parsing | Stooq response は 7 列 CSV（TICKER, DATE, OPEN, HIGH, LOW, CLOSE, VOL）。papaparse は過剰、**native `line.split(',')` で十分**（CSV に quoting なし）|
| `p-limit` (optional) | 7.x | 並列度制御 | 10 ticker なら逐次 `for...of await` で十分。本フェーズでは **NOT required** |

### What NOT to add

- `node-cron` — Vercel Cron を使うので不要
- `axios` — 各 SDK が fetch を内包、または Stooq 用に native `fetch` で十分
- `moment` / `moment-timezone` — `date-fns-tz` で完結
- `csv-parse` — Stooq CSV は単純構造、native split で OK
- Finnhub 有料プラン — §Critical Finding 参照

### Installation

```bash
npm install yahoo-finance2 finnhub date-fns date-fns-tz
# (date-fns / zod / drizzle-orm は既に Phase 1 で入っている)
```

**Version verification:**
- `yahoo-finance2@3.14.0` published to npm `[VERIFIED: npm view yahoo-finance2 version → 3.14.0]`
- `finnhub@2.0.13` published `[VERIFIED: npm view finnhub version → 2.0.13]`
- `date-fns-tz@3.2.0` — v3 系が date-fns v3/v4 と互換 `[VERIFIED: npm view]`
- `date-fns@4.1.0` latest; Phase 1 で入った版の確認は plan 内で `package.json` diff する

---

## Architecture Patterns

### Recommended Project Structure

```
lib/
├── market/
│   ├── index.ts              # re-export barrel
│   ├── types.ts              # Ticker, MarketDataRow, NewsRow, FundamentalsRow, FetchResult
│   ├── errors.ts             # MarketDataError, WhitelistViolationError, YahooError, StooqError, FinnhubError
│   ├── whitelist.ts          # isWhitelisted(), getTicker(), all 10 tickers (re-export from config)
│   ├── calendar.ts           # isMarketClosed(market, date), lastBusinessDay(market, from)
│   ├── yahoo.ts              # fetchOhlcvYahoo(symbol, from, to) — US + JP 両対応、chart() 使用
│   ├── stooq.ts              # fetchOhlcvStooq(symbol, from, to) — JP / US fallback、CSV parse
│   ├── finnhub/
│   │   ├── client.ts         # Finnhub SDK 初期化
│   │   ├── news.ts           # fetchCompanyNews(symbol, from, to)
│   │   └── fundamentals.ts   # fetchBasicFinancials(symbol)
│   ├── fx.ts                 # fetchUsdJpy(date) — yahoo-finance2 JPY=X
│   ├── orchestrator.ts       # fetchMarketDataForDate(dateRange) — main orchestration
│   └── persist.ts            # upsertPriceSnapshot, upsertNews, upsertFundamentals (Drizzle wrappers)
config/
├── tickers.ts                # D-01: readonly array of 10 tickers, isWhitelisted()
└── market-holidays.ts        # D-17: US_HOLIDAYS_2026, JP_HOLIDAYS_2026
app/
└── api/
    └── cron/
        └── fetch-market-data/
            └── route.ts      # GET handler, CRON_SECRET verify, call orchestrator
scripts/
└── backfill.ts               # Standalone tsx entry for 100-day backfill
db/
└── schema.ts                 # + OHLCV columns, + news_snapshots, + fundamentals_snapshots
drizzle/
└── migrations/
    └── NNNN_phase2_market_data.sql  # 1 本マイグレーション（§Migration strategy 参照）
__tests__/
└── market/                   # 既存 lib/__tests__ と別階層 or 並列、planner で決定
    ├── fixtures/
    │   ├── yahoo-chart-aapl.json
    │   ├── yahoo-chart-7203t.json
    │   ├── stooq-7203jp.csv
    │   ├── finnhub-news-aapl.json
    │   └── finnhub-financials-aapl.json
    ├── whitelist.test.ts
    ├── calendar.test.ts
    ├── yahoo.test.ts
    ├── stooq.test.ts
    ├── finnhub-news.test.ts
    ├── finnhub-financials.test.ts
    ├── fx.test.ts
    ├── orchestrator.test.ts
    └── persist.test.ts
```

### Pattern 1: Whitelist Gate at Every Entry

**What:** 全 fetch 関数の第 1 行で `isWhitelisted(symbol)` を呼び、非ホワイトリストは `WhitelistViolationError` を即 throw する。
**When:** Always — DATA-05 の受入条件。
**Example:**
```typescript
// Source: CONTEXT.md D-04 + PITFALLS.md Pitfall 6
import 'server-only'
import { isWhitelisted, WhitelistViolationError } from './whitelist'

export async function fetchOhlcvYahoo(symbol: string, from: Date, to: Date) {
  if (!isWhitelisted(symbol)) throw new WhitelistViolationError(symbol)
  // ... actual fetch
}
```

### Pattern 2: yahoo-finance2 `chart()` (NOT `historical()`)

**What:** v3 以降は `historical()` が "User not logged in" で壊れるため、`chart()` のみ使う。
**When:** Always (US + JP + FX 全て).
**Example:**
```typescript
// Source: https://github.com/gadicc/yahoo-finance2/issues/795 (maintainer official recommendation)
import 'server-only'
import yahooFinance from 'yahoo-finance2'

const result = await yahooFinance.chart('AAPL', {
  period1: '2025-12-01',
  period2: '2026-04-11',
  interval: '1d',
})
// result.quotes: [{ date, open, high, low, close, adjclose, volume }, ...]
// NOTE: yahoo chart's `close` is already split-adjusted. `adjclose` additionally dividend-adjusts.
//       For D-08 mapping: price_snapshots.close (adjusted) = result.quotes[i].close
//                         price_snapshots.raw_close        = NOT provided by chart() directly
// → For raw_close, use quoteSummary or set raw_close = close (split already adjusted, no dividend adjust).
//   PLANNER MUST DECIDE: store raw_close = close (same value), OR call a second unadjusted source.
//   RECOMMEND: set raw_close = close for now (D-08 の目的は split 検知時の再計算余地確保、yahoo は既に split 調整済みなので raw を取れない)。
//   PITFALLS Pitfall 2 対策は「adjusted のみに統一する」方針で十分（mix しない）。
```

**CRITICAL**: `yahoo-finance2.chart().quotes[i].close` は既に **split-adjusted（スプリット過去遡及反映済み）**。dividend-adjusted かどうかは `adjclose` フィールドで別途提供される。CONTEXT.md D-08 の `raw_close` は「split 前の生 close」だが yahoo chart は raw を返さない。**Planner は D-08 の意味論を再定義する必要がある**: 現実的には `close = quotes[i].close` (split-adjusted)、`raw_close = quotes[i].close` (同値) を保存、あるいは `raw_close` カラムを NULLABLE にして「将来 unadjusted source を追加したときに埋める」スロットとして保持する。`[ASSUMED: yahoo chart semantics based on yahoo-finance2 v3 docs + community usage]`

### Pattern 3: Stooq CSV Fallback

**What:** HTTP GET to `https://stooq.com/q/d/l/?s={symbol}&i=d&d1={YYYYMMDD}&d2={YYYYMMDD}` → text/csv response。ヘッダ行 + data行。
**When:** yahoo-finance2 fail 発火（D-13 の 3 条件いずれか）.
**Example:**
```typescript
// Source: https://stooq.com/q/d/l/?s=7203.jp&i=d ([CITED: stooq.com direct URL + QuantStart guide])
import 'server-only'

const stooqSymbol = symbol.endsWith('.T')
  ? symbol.toLowerCase().replace('.t', '.jp')  // 7203.T → 7203.jp
  : `${symbol.toLowerCase()}.us`                // AAPL → aapl.us
const url = `https://stooq.com/q/d/l/?s=${stooqSymbol}&i=d&d1=${fmt(from)}&d2=${fmt(to)}`
const res = await fetch(url, { headers: { 'user-agent': 'invest-simulator/1.0' } })
if (!res.ok) throw new StooqError(`HTTP ${res.status}`)
const csv = await res.text()
// Columns: Date,Open,High,Low,Close,Volume
// Example row: 2026-04-10,150.50,152.00,149.80,151.25,1234567
const rows = csv.trim().split('\n').slice(1).map((line) => {
  const [d, o, h, l, c, v] = line.split(',')
  return { date: d, open: Number(o), high: Number(h), low: Number(l), close: Number(c), volume: Number(v) }
})
if (rows.length === 0) throw new StooqError('empty response')
```

**Stooq quirks** `[VERIFIED: QuantStart guide + Chartoasis]`:
- JP tickers use `.jp` suffix (lowercase)，not `.T`
- US tickers use `.us` suffix
- Returns 7-column CSV with header `Date,Open,High,Low,Close,Volume` (no Ticker column in single-symbol download)
- Date format is `YYYY-MM-DD`
- No API key required, no rate limit documented (but be polite: 1 req/sec is safe)
- Empty response = `<HTML>` error page, not empty CSV — **MUST** content-type check or parse-failure catch
- Stooq **is NOT split-adjusted** by default (raw close). This is actually useful for filling `raw_close` column.

### Pattern 4: Finnhub for news + basic financials only

**What:** Free tier で動く endpoints のみ使用。
**When:** US ticker 対象、daily cron.
**Example:**
```typescript
// Source: finnhub.io docs (free tier endpoints)
import 'server-only'
import * as finnhub from 'finnhub'

const api_key = finnhub.ApiClient.instance.authentications['api_key']
api_key.apiKey = env.FINNHUB_API_KEY
const client = new finnhub.DefaultApi()

// News: GET /company-news?symbol=AAPL&from=2026-04-05&to=2026-04-10
const news = await new Promise((resolve, reject) => {
  client.companyNews('AAPL', '2026-04-05', '2026-04-10', (err, data) => {
    if (err) reject(err); else resolve(data)
  })
})
// data: [{ category, datetime, headline, id, image, related, source, summary, url }, ...]

// Basic financials: GET /stock/metric?symbol=AAPL&metric=all
const fin = await new Promise((resolve, reject) => {
  client.companyBasicFinancials('AAPL', 'all', (err, data) => {
    if (err) reject(err); else resolve(data)
  })
})
// data.metric: { peNormalizedAnnual, epsInclExtraItemsAnnual, marketCapitalization, 52WeekHigh, 52WeekLow, ... }
```

`[ASSUMED: finnhub-node v2.0.13 callback-style API]` — SDK は古い callback pattern。Planner は可読性のために `promisify` util を書くか、`fetch` で direct REST call する選択肢がある。後者は依存を 1 つ減らせるので推奨候補。

### Pattern 5: Idempotent Upsert via `onConflictDoUpdate`

**What:** `(symbol, price_date)` UNIQUE 制約に対する upsert で重複実行を無害化する。
**When:** 全 `price_snapshots` 書き込み（§Pitfall: Vercel cron 二重発火対策）.
**Example:**
```typescript
// Source: Drizzle ORM docs — onConflictDoUpdate
// https://orm.drizzle.team/docs/insert#upserts-and-conflicts
await db
  .insert(priceSnapshots)
  .values(row)
  .onConflictDoUpdate({
    target: [priceSnapshots.symbol, priceSnapshots.priceDate],
    set: { close: row.close, open: row.open, high: row.high, low: row.low, volume: row.volume, fetchedAt: new Date() },
  })
```

### Anti-Patterns to Avoid

- **yahoo-finance2 `.historical()`**: 2024 年以降 "User not logged in" で壊れる。`[VERIFIED: GitHub gadicc/yahoo-finance2 issue #795 — maintainer official recommendation to switch to chart()]`
- **Finnhub `/stock/candle`**: Premium only since 2024. §Critical Finding 参照
- **`new Date()` を営業日判定に使う**: UTC ずれで PITFALLS Pitfall 4（lookahead bias）。必ず `formatInTimeZone(utcNow, 'America/New_York', 'yyyy-MM-dd')` のようにローカル日付化
- **Finnhub callback を await なしで**: SDK は callback style。`new Promise(...)` でラップするか fetch で REST 直接
- **大量 ticker を `Promise.all` で並列**: yahoo-finance2 は内部に rate-limit なし → Yahoo が 429 を返す。10 ticker なら逐次 await で 1 ticker ≈ 1-2 秒、合計 10-20 秒で問題なし
- **エラー時に throw で全体停止**: D-15 により個別失敗は summary に集めて全体継続
- **raw HTML を Stooq CSV と誤認**: Stooq はエラー時 200 OK + HTML 返す。Content-Type または parse 結果の sanity check 必須

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Business day math | `new Date(Date.now() - 86400000)` + 週末判定 | `date-fns` `isWeekend` + holiday lookup | DST 跨ぎ・月末・leap year で破綻 |
| Timezone conversion | 手計算 offset | `date-fns-tz` `formatInTimeZone`, `toZonedTime` | DST（NY 3月第2日曜 / 11月第1日曜）で無音バグ |
| Yahoo API scraping | 自作 fetch + HTML parse | `yahoo-finance2` | crumb/cookie auth がライブラリに封じ込め |
| Finnhub REST client | 自前 fetch ラッパー | `finnhub` SDK（または薄い fetch wrapper — planner の選択） | SDK は型定義付き、fetch 派は callback 回避 |
| CSV parser | 自作 split-by-comma | native `String.split` （Stooq CSV は quoting なし）OR `papaparse` | Stooq の単純 CSV には native で十分 |
| Retry with backoff | 手動 while ループ | 1 回試して失敗ならフェイルオーバー（D-12 の二段階で完結） | retry は fallback の前段で濃度を薄めるだけ |
| DB upsert | SELECT-then-INSERT | Drizzle `onConflictDoUpdate` | race condition 耐性 |
| Request throttling | 手動 `await sleep(100)` | 逐次 `for...of await` で自然に直列化（10 ticker なら不要） | 10 ticker × 1-2 秒 = 10-20 秒で間に合う |

**Key insight:** この phase の "don't hand-roll" リストは短い。殆どが既存 SDK + 既存 drizzle + 既存 date-fns で解決する。唯一のカスタムコードは **orchestration logic（fallback 条件判定 + 全 ticker を回すループ + summary 組立）** に集中すべきで、そこにテストも集中する。

---

## Common Pitfalls

### Pitfall 1: Finnhub candle 403 (→ §Critical Finding)
既に議論済み。Recommendation Option A を採用してコード 0 行段階で回避。

### Pitfall 2: yahoo-finance2 `chart()` の split-adjusted close を raw と誤認
**What goes wrong:** D-08 の `raw_close` カラムに何を入れるか不明。yahoo chart の `close` は split-adjusted、`adjclose` は split+dividend adjusted。raw は存在しない。
**Why it happens:** Yahoo Finance は歴史的価格を常に split 遡及反映する仕様。
**How to avoid:** (1) raw_close を nullable にして yahoo 経由の行では NULL で埋める、OR (2) raw_close = close（同値）を保存して D-08 意図を「将来 unadjusted source 追加の余地」とする、OR (3) Stooq (unadjusted) を正として二重書き込み。**Planner decision required** — §Standard Stack Pattern 2 参照
**Warning signs:** TSLA 2022-08 の 3:1 split テスト日付で raw と adjusted が同値になる
**`[ASSUMED: yahoo chart adjustment semantics — verify via SPIKE with AAPL 2020-08 4:1 split]`**

### Pitfall 3: yahoo-finance2 notice系 console.log を vitest が拾う
**What goes wrong:** `yahoo-finance2` は初回呼び出し時に `notices` 的な console 出力を出す（v3 で軽減されたが残っている）。TDD テストログが汚れる。
**How to avoid:** `yahooFinance.suppressNotices(['yahooSurvey'])` を `lib/market/yahoo.ts` の最上部で 1 回呼ぶ。
**`[CITED: yahoo-finance2 README — suppressNotices API]`**

### Pitfall 4: Stooq empty CSV returns HTML 200
**What goes wrong:** 存在しない ticker / 休場日 / サーバー側 maintenance 時、Stooq は `<HTML><head>...` を 200 OK で返す。`.split('\n')` したら "data row" として間違ってパースされる。
**How to avoid:** CSV response を parse する前に、最初の行が `Date,Open,High,Low,Close,Volume` であることを確認。不一致なら `StooqError('unexpected response format')` を throw。
**Warning signs:** DB に `NaN` close が入る

### Pitfall 5: PITFALLS.md Pitfall 4（timezone lookahead）
**What goes wrong:** Cron が UTC 06:00 (= NY 01:00 am, 前日遅く) に走ると、`new Date()` は UTC "今日" を返す。US 市場はまだ閉じていない ("前営業日" は前々日)。
**How to avoid:** 営業日判定は必ず `formatInTimeZone(now, 'America/New_York', 'yyyy-MM-dd')` で NY ローカル日付を先に取り、そこから `lastBusinessDay(us, nyLocalDate - 1)` を計算。JP も同様に Tokyo ローカル。
**Test:** Cron を UTC 00:00, 06:00, 12:00, 22:00 それぞれで mock して US/JP の "T-1" が一意に決まることを assert

### Pitfall 6: Vercel 60s timeout in backfill path
**What goes wrong:** 10 ticker × 100 日 × 3 source（Finnhub news 5 日分割 + financials + yahoo chart）は 60 秒超過確実。
**How to avoid:** バックフィル (100 営業日) は **`scripts/backfill.ts` ローカル CLI 専用**で、cron route 側は絶対に呼ばない。cron route は T-1 増分のみ（30 calls ≈ 10-20 秒）。
**`route.ts` config:** `export const maxDuration = 60` を明示（Vercel Hobby 上限）。
**`[VERIFIED: Vercel docs — Hobby maxDuration 1-60, Fluid Compute up to 300]`**

### Pitfall 7: `date-fns-tz` v3 API breaking change
**What goes wrong:** `date-fns-tz` v2 の `zonedTimeToUtc` / `utcToZonedTime` は v3 で名前が変わった (`fromZonedTime` / `toZonedTime`)。訓練データと現在版で関数名が違う。
**How to avoid:** v3.2.0 の正しい API を使う:
- `formatInTimeZone(utcDate, 'America/New_York', 'yyyy-MM-dd')` — UTC → NY ローカル日付文字列
- `toZonedTime(utcDate, 'America/New_York')` — UTC Date → NY wall clock Date object
- `fromZonedTime(localDate, 'America/New_York')` — NY wall clock → UTC
**`[VERIFIED: date-fns-tz@3.2.0 README + npm registry]`**

### Pitfall 8: Drizzle `numeric` → JS `string` not `number`
**What goes wrong:** Drizzle の `numeric(18,4)` 列は読み取り時 JS `string` として返る（精度損失防止）。`Number()` 変換せずに TA 計算に渡すと `"150.5" + "10.0" = "150.510.0"`。
**How to avoid:** TA 用に読み取るときは `parseFloat()` または zod の `z.coerce.number()` で変換。書き込み時は Drizzle が string を受け入れる。Phase 2 は書き込み専なので大きな影響は少ないが、summary / verification で value 比較する際に注意。
**`[VERIFIED: Drizzle ORM docs — numeric column type returns string]`**

### Pitfall 9: Migration applied but Phase 1 production DB out of sync
**What goes wrong:** Phase 1 で `drizzle-kit push --force` を使ったため migrations/ フォルダに履歴がない。Phase 2 で `drizzle-kit generate` するとベースラインが無く全テーブル diff が出る。
**How to avoid:** Phase 2 マイグレーション戦略は 2 options:
- **Option A (recommended)**: 続行 `drizzle-kit push` で schema を直接同期。migrations フォルダは空のまま。個人プロジェクトなら許容。
- **Option B**: `drizzle-kit generate --name phase2_market_data` で baseline + diff 2 本生成、manually prune baseline。複雑
**Recommend Option A** (Phase 1 方針継続、`package.json` で `db:push` が既に存在)
**`[VERIFIED: drizzle.config.ts + package.json scripts]`**

---

## Code Examples

### Example 1: orchestrator skeleton (main entry logic)

```typescript
// lib/market/orchestrator.ts
// Source: synthesized from D-12/D-13/D-15/D-19/D-26
import 'server-only'
import { TICKERS } from '@/config/tickers'
import { isMarketClosed, lastBusinessDay } from './calendar'
import { fetchOhlcvYahoo } from './yahoo'
import { fetchOhlcvStooq } from './stooq'
import { fetchCompanyNews } from './finnhub/news'
import { fetchBasicFinancials } from './finnhub/fundamentals'
import { fetchUsdJpy } from './fx'
import { upsertPriceSnapshot, upsertNews, upsertFundamentals } from './persist'

export type FetchSummary = {
  ok: string[]
  failed: Array<{ symbol: string; stage: 'ohlcv'|'news'|'fundamentals'|'fx'; reason: string }>
  marketClosed: Array<{ symbol: string; date: string }>
  durationMs: number
}

export async function fetchMarketDataForDate(targetDate: Date): Promise<FetchSummary> {
  const started = Date.now()
  const summary: FetchSummary = { ok: [], failed: [], marketClosed: [], durationMs: 0 }

  // 1. FX first (used by summary row only — Phase 3 writes JPY conversions)
  try {
    const fx = await fetchUsdJpy(targetDate)
    await upsertPriceSnapshot({ symbol: 'JPYUSD', assetClass: 'fx', currency: 'USD', close: fx.close, raw_close: fx.close, priceDate: fx.date, source: 'yahoo', fxRateToJpy: String(1 / fx.close) })
  } catch (e) {
    summary.failed.push({ symbol: 'JPYUSD', stage: 'fx', reason: String(e) })
  }

  // 2. Per-ticker serial loop (10 tickers, no need for p-limit)
  for (const ticker of TICKERS) {
    const localDate = lastBusinessDay(ticker.market, targetDate)
    if (isMarketClosed(ticker.market, localDate)) {
      await upsertPriceSnapshot({ symbol: ticker.symbol, priceDate: localDate, marketClosed: true, source: 'none', /* OHLCV NULL */ })
      summary.marketClosed.push({ symbol: ticker.symbol, date: localDate })
      continue
    }

    // OHLCV — Option A: yahoo primary for both US and JP
    let row
    try {
      row = await fetchOhlcvYahoo(ticker.symbol, localDate, localDate)
    } catch (e) {
      if (ticker.market === 'JP' || ticker.market === 'US') {
        try { row = await fetchOhlcvStooq(ticker.symbol, localDate, localDate) }
        catch (ee) { summary.failed.push({ symbol: ticker.symbol, stage: 'ohlcv', reason: `yahoo:${e}; stooq:${ee}` }); continue }
      }
    }
    await upsertPriceSnapshot({ ...row, symbol: ticker.symbol, priceDate: localDate })

    // News + fundamentals only for US (D-07)
    if (ticker.market === 'US') {
      try {
        const news = await fetchCompanyNews(ticker.symbol, localDate, localDate)
        await upsertNews(ticker.symbol, localDate, news)
      } catch (e) { summary.failed.push({ symbol: ticker.symbol, stage: 'news', reason: String(e) }) }

      try {
        const fin = await fetchBasicFinancials(ticker.symbol)
        await upsertFundamentals(ticker.symbol, localDate, fin)
      } catch (e) { summary.failed.push({ symbol: ticker.symbol, stage: 'fundamentals', reason: String(e) }) }
    }

    summary.ok.push(ticker.symbol)
  }

  summary.durationMs = Date.now() - started
  return summary
}
```

### Example 2: Calendar with TZ-correct "T-1"

```typescript
// lib/market/calendar.ts
import 'server-only'
import { formatInTimeZone } from 'date-fns-tz'
import { isWeekend, subDays, parseISO } from 'date-fns'
import { US_HOLIDAYS_2026, JP_HOLIDAYS_2026 } from '@/config/market-holidays'

const TZ = { US: 'America/New_York', JP: 'Asia/Tokyo' } as const
type Market = keyof typeof TZ

export function toLocalDate(market: Market, utc: Date): string {
  return formatInTimeZone(utc, TZ[market], 'yyyy-MM-dd')
}

export function isMarketClosed(market: Market, isoDate: string): boolean {
  const date = parseISO(isoDate)
  if (isWeekend(date)) return true
  const holidays = market === 'US' ? US_HOLIDAYS_2026 : JP_HOLIDAYS_2026
  return holidays.includes(isoDate)
}

export function lastBusinessDay(market: Market, from: Date, lookback = 7): string {
  // Walk backwards at most `lookback` days
  let d = from
  for (let i = 0; i < lookback; i++) {
    const iso = toLocalDate(market, d)
    if (!isMarketClosed(market, iso)) return iso
    d = subDays(d, 1)
  }
  throw new Error(`no business day found within ${lookback} days of ${from.toISOString()}`)
}
```

### Example 3: 2026 holiday data

```typescript
// config/market-holidays.ts
// Source: [VERIFIED: https://www.calendarlabs.com/nyse-market-holidays-2026/]
//         [VERIFIED: https://www.calendarlabs.com/jpx-market-holidays-2026/]
//         [CITED: https://www.nyse.com/publicdocs/nyse/ICE_NYSE_2026_Yearly_Trading_Calendar.pdf]
//         [CITED: https://www.jpx.co.jp/english/corporate/about-jpx/calendar/index.html]
export const US_HOLIDAYS_2026 = [
  '2026-01-01', // New Year's Day
  '2026-01-19', // MLK Day
  '2026-02-16', // Presidents' Day
  '2026-04-03', // Good Friday
  '2026-05-25', // Memorial Day
  '2026-06-19', // Juneteenth
  '2026-07-03', // Independence Day (observed, July 4 Sat)
  '2026-09-07', // Labor Day
  '2026-11-26', // Thanksgiving
  '2026-12-25', // Christmas Day
] as const

// Note: NYSE 2026-11-27 (Black Friday) and 2026-12-24 (Christmas Eve) are EARLY CLOSE (1pm ET)
// not full holidays. For daily-close data they still produce a close price — do NOT add to this list.

export const JP_HOLIDAYS_2026 = [
  '2026-01-01', // 元日
  '2026-01-02', // 休業日 (exchange closed)
  '2026-01-03', // 休業日
  '2026-01-12', // 成人の日
  '2026-02-11', // 建国記念日
  '2026-02-23', // 天皇誕生日
  '2026-03-20', // 春分の日
  '2026-04-29', // 昭和の日
  '2026-05-03', // 憲法記念日
  '2026-05-04', // みどりの日
  '2026-05-05', // こどもの日
  '2026-05-06', // 振替休日
  '2026-07-20', // 海の日
  '2026-08-11', // 山の日 (Aug 11 approx, verify)
  '2026-09-21', // 敬老の日
  '2026-09-22', // 国民の休日
  '2026-09-23', // 秋分の日
  '2026-10-12', // スポーツの日
  '2026-11-03', // 文化の日
  '2026-11-23', // 勤労感謝の日
  '2026-12-31', // 大納会翌日 / 年末休業
] as const
```

**Note:** JP 祝日は 2026 年は 21 日程度とソースが言っている。Planner は implementation 時に `https://www.jpx.co.jp/english/corporate/about-jpx/calendar/index.html` の公式 PDF と再突き合わせを推奨。`[VERIFIED: calendarlabs.com; CITED: jpx.co.jp official calendar]`

---

## Runtime State Inventory

Phase 2 は greenfield（既存実装への rename/refactor ではない）なので大半は "None"。

| Category | Items Found | Action Required |
|---|---|---|
| Stored data | Phase 1 で作成された `price_snapshots` に既存 close-only 行が入っている可能性（Phase 1 の smoke test で挿入した場合） | Plan 冒頭の migration で新列は NULL 許容 OR default で backfill、既存行は無害。フレッシュな dev DB なら行数 0 |
| Live service config | None — 外部サービスで "invest-simulator" を登録した状態はなし | None |
| OS-registered state | None — Vercel Cron 設定は Phase 5、Phase 2 ではエンドポイント作成のみ | None |
| Secrets / env vars | `FINNHUB_API_KEY` を `lib/env.ts` + `.env.local` + `.env.example` に**新規追加**が必要。`CRON_SECRET` は Phase 1 D-20 で既存 | `lib/env.ts` envSchema に `FINNHUB_API_KEY: z.string().min(1)` 追加、`.env.example` に記載、ローカル `.env.local` に実値 |
| Build artifacts | None — `drizzle/migrations/` に Phase 1 で生成された migration SQL が無い（push 方式のため）。§Pitfall 9 参照 | `db:push` 継続方針で Plan 冒頭に明記 |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| Node.js | Build & test | ✓ (Next.js 16 requires ≥ 20) | — | — |
| `pnpm` / `npm` | Package install | ✓ (scripts use `pnpm tsx`; planner should confirm which one is in use) | — | `npm` works too |
| Neon Postgres | Schema migration + runtime | ✓ (Phase 1 でプロビジョン済、`DATABASE_URL` / `DATABASE_URL_DIRECT` 設定済) | — | — |
| Finnhub free API key | news + basic financials | **✗ (not yet provisioned)** | — | None — user needs to sign up at finnhub.io (free) and paste key into `.env.local` |
| yahoo-finance2 | US + JP OHLCV | ✓ (no key required) | 3.14.0 via npm | Stooq CSV |
| Stooq | Fallback + possibly raw unadjusted source | ✓ (no key required, public CSV endpoint) | — | None — if Stooq is down, ticker skipped per D-15 |
| Internet egress from Vercel fn | Daily cron runtime | ✓ (assumed) | — | — |
| `tsx` | Local backfill CLI | ❓ (not currently in package.json) | — | `node --experimental-strip-types` (Node 22) or add `tsx` as devDep |

**Missing with action needed (NOT blocking):**
- **Finnhub API key sign-up** — 5 分で取れる無料登録。Plan 1 タスク目で human action として提示
- **`tsx` devDep addition** — Plan で `pnpm add -D tsx` を含める

**Missing blocking:** None

---

## Validation Architecture

> `workflow.nyquist_validation: true` が `.planning/config.json` で明示的に有効。本セクションは必須。

### Test Framework

| Property | Value |
|---|---|
| Framework | **Vitest 4.1.4** (already installed per package.json) |
| Config file | `vitest.config.ts` (existing, node environment, `@/*` alias) |
| Quick run command | `npx vitest run lib/__tests__/market --reporter=dot` (once tests exist) |
| Full suite command | `npx vitest run` |
| Coverage command | `npx vitest run --coverage` (requires `@vitest/coverage-v8` install) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|---|
| **DATA-01** | Finnhub news endpoint returns parsed news rows for US ticker | unit | `npx vitest run lib/__tests__/market/finnhub-news.test.ts -x` | ❌ Wave 0 |
| **DATA-01** | Finnhub basicFinancials returns P/E, EPS, market cap for US ticker | unit | `npx vitest run lib/__tests__/market/finnhub-financials.test.ts -x` | ❌ Wave 0 |
| **DATA-01** | yahoo-finance2 `chart()` returns OHLCV for US ticker (replacement for Finnhub candle) | unit | `npx vitest run lib/__tests__/market/yahoo.test.ts -t "US ticker"` | ❌ Wave 0 |
| **DATA-02** | yahoo-finance2 returns OHLCV for JP ticker (7203.T) | unit (fixture) | `npx vitest run lib/__tests__/market/yahoo.test.ts -t "JP ticker"` | ❌ Wave 0 |
| **DATA-02** | Stooq fallback returns OHLCV when yahoo mock throws | unit | `npx vitest run lib/__tests__/market/orchestrator.test.ts -t "fallback"` | ❌ Wave 0 |
| **DATA-02** | Stooq fallback activates on empty yahoo response `[]` (D-13.2) | unit | `npx vitest run lib/__tests__/market/orchestrator.test.ts -t "empty"` | ❌ Wave 0 |
| **DATA-02** | Stooq fallback activates on stale yahoo data (D-13.3) | unit | `npx vitest run lib/__tests__/market/orchestrator.test.ts -t "stale"` | ❌ Wave 0 |
| **DATA-02** | CSV parsing handles Stooq's 7-column format correctly | unit (fixture) | `npx vitest run lib/__tests__/market/stooq.test.ts` | ❌ Wave 0 |
| **DATA-02** | Stooq HTML error response detected and rejected (Pitfall 4) | unit | `npx vitest run lib/__tests__/market/stooq.test.ts -t "HTML response"` | ❌ Wave 0 |
| **DATA-03** | Upsert idempotence on `(symbol, price_date)` | integration (real Neon) | `npx vitest run lib/__tests__/market/persist.test.ts` | ❌ Wave 0 |
| **DATA-03** | Phase 3 read path can SELECT the row written by Phase 2 | integration | `npx vitest run lib/__tests__/market/persist.test.ts -t "roundtrip"` | ❌ Wave 0 |
| **DATA-04** | Weekend skip produces `market_closed=true` row | unit | `npx vitest run lib/__tests__/market/calendar.test.ts -t "weekend"` | ❌ Wave 0 |
| **DATA-04** | 2026 NYSE holiday (e.g., 2026-07-03) skipped correctly | unit | `npx vitest run lib/__tests__/market/calendar.test.ts -t "holiday"` | ❌ Wave 0 |
| **DATA-04** | JP holiday skipped (e.g., 2026-05-05 こどもの日) | unit | `npx vitest run lib/__tests__/market/calendar.test.ts -t "JP holiday"` | ❌ Wave 0 |
| **DATA-04** | TZ lookahead protection — UTC 00:00 cron resolves US "T-1" correctly (Pitfall 5) | unit | `npx vitest run lib/__tests__/market/calendar.test.ts -t "timezone"` | ❌ Wave 0 |
| **DATA-05** | `isWhitelisted('AAPL')` → true, `isWhitelisted('NVDIA')` → false | unit | `npx vitest run lib/__tests__/market/whitelist.test.ts` | ❌ Wave 0 |
| **DATA-05** | `fetchOhlcvYahoo('NVDIA')` throws `WhitelistViolationError` | unit | `npx vitest run lib/__tests__/market/yahoo.test.ts -t "whitelist"` | ❌ Wave 0 |
| **DATA-05** | `/api/cron/fetch-market-data` rejects non-whitelisted ticker in body/query | e2e (fetch) | `npx vitest run app/__tests__/cron.e2e.test.ts` | ❌ Wave 0 |

### Fixture Strategy

| Fixture | Source | Regenerate when |
|---|---|---|
| `fixtures/yahoo-chart-aapl.json` | `yahooFinance.chart('AAPL', {period1:'2026-01-01', period2:'2026-04-10', interval:'1d'})` output recorded | Yahoo schema change (breaking) |
| `fixtures/yahoo-chart-7203t.json` | Same for `7203.T` | Same |
| `fixtures/yahoo-chart-jpyx.json` | Same for `JPY=X` (FX) | Same |
| `fixtures/stooq-7203jp.csv` | `curl https://stooq.com/q/d/l/?s=7203.jp&i=d` | Stooq format change |
| `fixtures/stooq-aapl-us.csv` | `curl https://stooq.com/q/d/l/?s=aapl.us&i=d` | Same |
| `fixtures/stooq-html-error.html` | Hand-crafted HTML error page sample | Never |
| `fixtures/finnhub-news-aapl.json` | `companyNews('AAPL', from, to)` output | Finnhub response schema change |
| `fixtures/finnhub-financials-aapl.json` | `companyBasicFinancials('AAPL', 'all')` output | Same |

**Strategy:** 
1. Commit fixtures to git (small JSON / CSV)
2. Tests use `vi.mock('yahoo-finance2', ...)` / `vi.mock('finnhub', ...)` / `msw` (optional) to intercept
3. **One opt-in "live smoke test"** file `lib/__tests__/market/live-smoke.test.ts` hidden behind `SMOKE=1` env, not run in CI, manually verifies against real APIs (1 call each) — catches upstream format drift
4. Fixtures refresh script `scripts/refresh-fixtures.ts` for periodic re-capture

### Sampling Rate

- **Per task commit:** `npx vitest run lib/__tests__/market --reporter=dot` (< 10 seconds, unit tests only, all mocked)
- **Per wave merge:** `npx vitest run` (full unit + integration; integration tests hit real Neon dev branch)
- **Phase gate:** Full suite green + `SMOKE=1 npx vitest run lib/__tests__/market/live-smoke.test.ts` (manual, requires Finnhub API key)
- **Phase verification (`/gsd-verify-work`):** Run `pnpm tsx scripts/backfill.ts --symbol AAPL --days 5` and manually inspect `price_snapshots` rows in Neon SQL Editor

### Wave 0 Gaps

All test files need to be created. Before implementation:

- [ ] `lib/__tests__/market/` directory + 9 test files listed above
- [ ] `lib/__tests__/market/fixtures/` + 8 fixture files (capture via temporary live script)
- [ ] `scripts/refresh-fixtures.ts` — reusable fixture refresh CLI
- [ ] `scripts/backfill.ts` — 100-day backfill CLI
- [ ] `package.json` devDep: `tsx` for backfill script execution
- [ ] `app/__tests__/cron.e2e.test.ts` — route handler e2e test (mocks orchestrator, asserts auth + summary JSON shape)
- [ ] Update `vitest.config.ts` if needed for fixture path resolution / additional test globs (current config is minimal and should work as-is)

### Known Flakiness Sources & Mitigations

| Source | Why flaky | Mitigation |
|---|---|---|
| **yahoo-finance2 live smoke test** | Yahoo 429 rate limit bursts, DNS | Opt-in only (`SMOKE=1`), retry 1x with 3s backoff in the smoke test itself, never in CI |
| **Stooq live smoke test** | 1-sec implicit throttle, occasional 502 | Same — SMOKE only |
| **Neon cold start** | 5-min scale-to-zero gives 500ms cold start on first query | Integration tests: warmup query in `beforeAll`, expect p95 < 2s |
| **Time-sensitive tests (Pitfall 5)** | `new Date()` changes between tests | Use `vi.useFakeTimers()` + `vi.setSystemTime('2026-04-11T06:00:00Z')` in all calendar tests |
| **Fixture drift** | Captured fixture doesn't match current Yahoo schema | CI job: monthly fixture refresh via `scripts/refresh-fixtures.ts`, diff-review → commit |
| **TZ environment** | CI may run in UTC vs local dev in JST | All tests use explicit `formatInTimeZone`; no `new Date().toLocaleString()` allowed |

### Coverage Target

- **Per file:** ≥ 80% lines (per `~/.claude/rules/testing.md`)
- **Critical modules (whitelist, calendar, orchestrator)**: ≥ 90% lines + all branches
- **Tool:** `@vitest/coverage-v8` (add as devDep)

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| `yahoo-finance2.historical()` | `yahoo-finance2.chart()` | Yahoo removed historical download ~mid-2024; maintainer PR'd switch 2024-2025 | **Must use `chart()`** |
| Finnhub `/stock/candle` on free tier | Premium only (or alternative source) | ~2024 free tier restriction tightening | **Use yahoo for OHLCV instead** |
| `date-fns-tz` v2 `zonedTimeToUtc` / `utcToZonedTime` | v3 `fromZonedTime` / `toZonedTime` / `formatInTimeZone` | date-fns-tz v3 (late 2024) | Function names renamed |
| Alpha Vantage for free US data | Not viable | 500 → 100 → 25 req/day progression | Avoid entirely (D-11) |
| J-Quants free for JP | Not viable for current prices | 12-week delay on free tier | Avoid entirely |
| `middleware.ts` in Next.js ≤15 | `proxy.ts` in Next.js 16 | Next.js 16.0.0 rename | Already handled in Phase 1 |

**Deprecated/outdated (avoid):**
- Finnhub `stock/candle` — §Critical Finding
- Alpha Vantage — 25/day cap (PITFALLS 1)
- J-Quants free — 12-week delay
- `yahoo-finance2.historical()` — auth broken since 2024
- Middleware.ts for auth in Next.js 16

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | yahoo-finance2 `chart()` returns `quotes[i].close` already split-adjusted (no raw_close available from chart) | Pitfall 2, Pattern 2 | raw_close meaning unclear — D-08 semantics need planner decision. Mitigation: SPIKE with AAPL 2020-08-31 4:1 split before heavy implementation, or set `raw_close = close` and document |
| A2 | finnhub-node v2.0.13 uses callback-style API (not promise) | Pattern 4 | Slightly more verbose wrappers needed; consider fetch-direct alternative. Easily verified by reading `node_modules/finnhub/src/api/DefaultApi.js` in plan |
| A3 | Stooq returns HTML 200 on error (not a proper 4xx/5xx status) | Pitfall 4 | If Stooq actually returns non-200, our content-type check is redundant but not harmful |
| A4 | JP holiday list includes 2026-08-11 (山の日) on Tuesday — verify against official JPX PDF | Example 3 | One missing holiday = one false `market_closed=false` day → OHLCV fetch will fail for that date → orchestrator will log to `failed[]` — self-correcting. Mitigation: cross-check JPX official PDF before committing holidays file |
| A5 | 2026-12-24 NYSE early close (1pm ET) still produces a valid daily close — NOT a full holiday | Example 3 | If it IS a full holiday, we'll get one fetch failure on 2026-12-24 which is logged to `failed[]` |
| A6 | yahoo-finance2 `suppressNotices()` API still exists in v3.14.0 | Pitfall 3 | Test output noise only; not functional |
| A7 | `/api/cron/fetch-market-data` route can set `export const maxDuration = 60` in route.ts module scope for Next.js 16 | Pitfall 6 | If maxDuration config moved in Next.js 16, use `vercel.json` functions config instead. Check `node_modules/next/dist/docs/` |
| A8 | Drizzle `.onConflictDoUpdate` syntax unchanged in 0.45 | Pattern 5 | Minor syntax update if API changed — verify in Context7 during plan |

**Resolution plan:** A1 is the most important — Planner should include a "Wave 0 SPIKE" task that calls `yahooFinance.chart('TSLA', {period1:'2022-08-20', period2:'2022-09-10'})` to observe whether pre/post-split values jump or are smoothed, before locking in raw_close semantics. Other assumptions are low-risk and verified in-plan.

---

## Open Questions (RESOLVED)

> All questions resolved during planning. Each item notes where the final
> answer lives in the plan set. No open work remains for the planner.

1. **Should `raw_close` carry same value as `close` (split-adjusted) or be NULL when yahoo is source?**
   - What we know: yahoo `chart()` returns only adjusted close. Stooq returns unadjusted close.
   - What's unclear: Whether to do dual-source for a true "raw vs adjusted" comparison (double the JP load), or accept "raw = same as close" as a nullable slot.
   - Recommendation: Store `raw_close = close` from yahoo (essentially means "we trust the adjusted value; raw slot reserved for future unadjusted source"). Document in schema comment. Revisit if PITFALLS Pitfall 2 verification test fails.
   - **RESOLVED:** Plan 00 Wave 0 SPIKE runs a live AAPL 2020-08-31 split-date experiment and writes `.planning/phases/02-market-data/02-SPIKE-RAW-CLOSE.md`. SPIKE scope is constrained to options (a) "rawClose = close (mirror)" or (b) "rawClose = null unless Stooq fallback fires" — option (c) dual-source is explicitly OUT OF SCOPE for Phase 2 (would require re-planning Plans 04/08). Wave 1 cannot start until SPIKE is committed.

2. **Should news rows be 1:N (multiple rows per ticker/date) or 1:1 with JSONB array?**
   - What we know: D-06 says 1:N rows
   - What's unclear: Nothing — D-06 is locked. Just executing.
   - Recommendation: Follow D-06.
   - **RESOLVED:** D-06 locked; Plan 02 schema and Plan 07 `upsertNewsSnapshots` implement 1:N rows with no unique constraint (duplicates allowed).

3. **How does Phase 2 cron handle "today is a US trading day but not yet closed" scenario?**
   - What we know: D-19 says use 16:30 NY cutoff
   - What's unclear: Whether cron is expected to produce a row for "today-US" at 09:00 UTC (= 05:00 NY, before close) — answer: NO, should produce a row for "T-1" which is NY yesterday close
   - Recommendation: `lastBusinessDay(US, toZonedTime(now,'NY') - 1 day)` always returns the last fully-closed session. Cover with timezone test.
   - **RESOLVED:** Plan 03 `calendar.ts` implements `lastBusinessDay()` with NY/JST timezone conversion, and Plan 03 Task 2 (timezone test) covers the 16:30 NY cutoff boundary (D-19).

4. **Does Finnhub `/company-news` free tier return rate-limited data or full news for past 30 days?**
   - What we know: Free tier is "60 calls/min" + "real-time US company news"
   - What's unclear: Historical window limit for news. `[ASSUMED]` 30 days.
   - Recommendation: In plan Wave 0, run one manual call with `from=2026-03-10, to=2026-04-10` and observe response. Shrink to "last 7 days" if longer windows return empty.
   - **RESOLVED:** Plan 05 Task 1 documents the 30-day assumption as the incremental window and uses 30-day chunks for any backfill (up to 5 chunks = ~150 days) with p-limit throttling to stay under 60 calls/min. Plan 04/05 share the throttle budget. Plan 10 backfill CLI enforces the same budget.

5. **Is `tsx` already installed somewhere or do we need to add it?**
   - What we know: Already resolved — `tsx` was added as a devDep in Phase 1 Plan 01-01 (see `.planning/phases/01-foundation/01-01-SUMMARY.md`).
   - **RESOLVED:** `tsx` is already installed from Phase 1. No `pnpm add -D tsx` call is needed in Phase 2. Plan 00 Task 1 comment and Plan 10 CLI reference this fact. Any earlier "devDep missing" language in this document is obsolete.

---

## Security Domain

> `workflow.security_enforcement` not explicitly set in config — treat as enabled. This phase creates a new route handler and persists external data to DB, so security considerations apply.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | **yes** | `CRON_SECRET` Bearer header on `/api/cron/fetch-market-data` (timing-safe compare — reuse Phase 1 pattern from `lib/auth/`) |
| V3 Session Management | no | N/A (cron route is stateless, bypasses iron-session per proxy.ts) |
| V4 Access Control | **yes** | proxy.ts already exempts `/api/cron/*` from user auth; route handler enforces cron secret |
| V5 Input Validation | **yes** | `zod` schemas for all external API responses (yahoo, Finnhub, Stooq) before DB write |
| V6 Cryptography | **indirect** | `crypto.timingSafeEqual` for CRON_SECRET compare (reuse Phase 1 util) |
| V7 Error Handling | **yes** | Error messages in `summary.failed[].reason` must NOT leak API key or DB connection string |
| V9 Communications | **yes** | All external calls over HTTPS (yahoo-finance2/Finnhub default HTTPS; Stooq URL must use `https://` explicitly) |
| V10 Malicious Code | **partial** | Phase 2 stores raw news — prompt injection is a Phase 3 concern (D-05). But XSS-safe render when dashboard shows raw news in Phase 4. Phase 2 must not interpret/render news. |
| V14 Config | **yes** | `FINNHUB_API_KEY` only in server-only env, never in `NEXT_PUBLIC_*` (Phase 1 D-21) |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unauthenticated cron replay | Spoofing | `CRON_SECRET` timing-safe compare; rate limit via Neon idempotent upsert |
| External API response injection (malicious news) | Tampering → downstream Phase 3 prompt injection | D-05: Phase 2 stores raw, Phase 3 wraps in `<external_news_content>` delimiter. Phase 2 must NOT eval/render news text, only persist it |
| SQL injection via Drizzle ORM | Tampering | Drizzle parameterizes all queries by default — no raw SQL with string interpolation |
| Leaked `FINNHUB_API_KEY` in error messages | Info disclosure | `summary.failed[].reason` uses `error.message` not `error.stack`; strip API key from URL before logging |
| Stooq SSRF (user-controlled URL building) | Tampering / SSRF | Symbol is always from internal whitelist — never user input; URL template is static |
| Whitelist bypass through Unicode normalization | Tampering | `isWhitelisted()` uses strict === comparison against compile-time constants |
| Open redirect via fetch-market-data response | N/A | Route returns JSON only, no redirects |

### Phase 2 Security Checklist (for verifier)

- [ ] `FINNHUB_API_KEY` added to `lib/env.ts` zod schema, NOT prefixed `NEXT_PUBLIC_`
- [ ] `CRON_SECRET` verified with `crypto.timingSafeEqual` (reuse Phase 1 helper)
- [ ] `/api/cron/fetch-market-data` returns 401 without secret — e2e test covers this
- [ ] External API responses parsed with `zod` before DB write (at minimum: yahoo chart, Finnhub news, Finnhub financials, Stooq CSV)
- [ ] `server-only` import at top of every `lib/market/**/*.ts`
- [ ] Stooq URL is always `https://` literal
- [ ] Error messages do not include API key or full response body (use `err.message` only)
- [ ] News persisted as raw text — never interpolated into any template in Phase 2

---

## Sources

### Primary (HIGH confidence)

- [GitHub gadicc/yahoo-finance2 Issue #795](https://github.com/gadicc/yahoo-finance2/issues/795) — `.historical()` deprecated, use `chart()` — maintainer official recommendation
- [GitHub Finnhub-API Issue #534](https://github.com/finnhubio/Finnhub-API/issues/534) — `stock/candle` premium only confirmation (maintainer response)
- [GitHub finnhub-python Issue #58](https://github.com/Finnhub-Stock-API/finnhub-python/issues/58) — 403 errors on stock_candles for free tier 2024
- [calendarlabs.com NYSE 2026 holidays](https://www.calendarlabs.com/nyse-market-holidays-2026/) — 10 full closure dates
- [calendarlabs.com JPX 2026 holidays](https://www.calendarlabs.com/jpx-market-holidays-2026/) — 21 closure dates
- [NYSE 2026 trading calendar PDF](https://www.nyse.com/publicdocs/nyse/ICE_NYSE_2026_Yearly_Trading_Calendar.pdf) — authoritative source
- [Stooq direct URL sample 7203.jp](https://stooq.com/q/d/?s=7203.jp&i=d&d1=20190401&d2=20190920&l=3) — confirmed `.jp` suffix for JP stocks
- [QuantStart Stooq pricing data intro](https://www.quantstart.com/articles/an-introduction-to-stooq-pricing-data/) — CSV format + URL pattern documentation
- [npm view yahoo-finance2 → 3.14.0](https://www.npmjs.com/package/yahoo-finance2) — version confirmed
- [npm view finnhub → 2.0.13](https://www.npmjs.com/package/finnhub) — version confirmed
- [npm view date-fns-tz → 3.2.0](https://www.npmjs.com/package/date-fns-tz) — version confirmed
- [Vercel docs — Maximum Duration](https://vercel.com/docs/functions/configuring-functions/duration) — Hobby 1-60s without Fluid Compute, up to 300s with
- `.planning/phases/02-market-data/02-CONTEXT.md` — locked decisions D-01..D-27
- `.planning/research/PITFALLS.md` — Pitfalls 1-10 (baseline)
- `.planning/research/STACK.md` — original stack research

### Secondary (MEDIUM confidence)

- [JSR @gadicc/yahoo-finance2 chart module docs](https://jsr.io/@gadicc/yahoo-finance2/doc/modules/chart) — `chart()` signature
- [Finnhub free tier feature list (finnhub.io homepage)](https://finnhub.io/) — news, basicFinancials, quote confirmed free; candle not listed
- [JPX official calendar](https://www.jpx.co.jp/english/corporate/about-jpx/calendar/index.html) — confirm JP holidays (cross-check with calendarlabs)
- [Drizzle ORM upserts docs](https://orm.drizzle.team/docs/insert#upserts-and-conflicts) — `onConflictDoUpdate` syntax

### Tertiary (LOW / assumed)

- finnhub-node SDK callback style (A2) — verify by reading installed module
- yahoo-finance2 `suppressNotices()` (A6) — verify in plan
- `raw_close` semantics when yahoo is source (A1) — SPIKE required

---

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — versions verified via npm registry 2026-04-12
- Architecture / patterns: **HIGH** — builds on Phase 1 established patterns, known library APIs
- Critical Finding (Finnhub candle): **HIGH** — multiple GitHub issues + maintainer statement + absence from free tier feature list
- yahoo-finance2 `chart()` replacement path: **HIGH** — maintainer official recommendation via issue #795
- Stooq CSV format: **HIGH** — direct URL test + multiple guides agree
- 2026 holiday dates: **MEDIUM-HIGH** — secondary source (calendarlabs); recommend cross-verify with NYSE/JPX PDFs in plan
- Pitfall 2 (raw_close semantics): **MEDIUM** — assumption A1 needs SPIKE to resolve
- Validation architecture: **HIGH** — vitest + fixtures is standard, test file list derived directly from DATA-01..05

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (30 days — yahoo-finance2 is unofficial and may break, re-verify before planning extension phases)
