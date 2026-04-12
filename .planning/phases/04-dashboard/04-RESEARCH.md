# Phase 4: Dashboard - Research

**Researched:** 2026-04-12
**Domain:** Next.js App Router UI / Financial Charts / Performance Metrics
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**ページ構成とレイアウト**
- D-01: 1ページスクロール構成。タブ・サイドバーナビなし
- D-02: セクション配置（上→下）: パフォーマンス指標カード → ポートフォリオ推移チャート → ポジション一覧 + 配分パイチャート → トレードタイムライン
- D-03: ダークテーマ採用。`dark:` クラスなしでベース自体をダーク配色で設計
- D-04: ヘッダーにアプリ名 + Sign out ボタン。既存 `app/dashboard/page.tsx` を拡張

**チャート**
- D-05: ポートフォリオ推移 = lightweight-charts のラインチャート（`"use client"`）。3系列: ポートフォリオ / SPY / TOPIX ETF
- D-06: 3系列を **%リターンで正規化**して重ね表示（初日=0%）
- D-07: ベンチマーク = SPY + TOPIX ETF (1306.T)。1306.T を `config/tickers.ts` に `assetClass: 'etf'` で追加
- D-08: 期間切替なし（全期間のみ）
- D-09: 配分比率 = Recharts のパイ/ドーナツチャート
- D-10: `lightweight-charts`, `lightweight-charts-react-wrapper`, `recharts` を新規インストール

**トレードタイムライン**
- D-11: 日付単位。各日ヘッダーに `market_assessment`、その下にBUY/SELL銘柄カード
- D-12: HOLD銘柄は非表示。全HOLDの日は "取引なし" 表示
- D-13: 判断理由（reasoning）はデフォルト展開。アコーディオンで折りたたみ可能
- D-14: 確信度 high=緑 / medium=黄・オレンジ / low=赤。バッジとして銘柄カードに配置
- D-15: 直近20日分を初期表示 + "もっと見る" ボタンで追加読み込み

**パフォーマンス指標カード**
- D-16: 指標計算はサーバーサイド（Server Component または Route Handler）
- D-17: 3×2 グリッドレイアウト。1行目: 累計リターン / vs SPY差分 / シャープレシオ。2行目: 最大DD / 勝率 / 取引数
- D-18: シャープレシオ = 日次リターン系列から計算。リスクフリーレート0%。最大DDはピーク比最大下落率。勝率はSELL取引のうちプラスの比率

### Claude's Discretion
- コンポーネント分割構成（`app/dashboard/components/` 配下のファイル名・構成）
- lightweight-charts の具体的なスタイリング（色コード、ラインの太さなど）
- ダークテーマの具体的な配色パレット
- ポジションテーブルのカラム幅・ソート可否
- パイチャートのカラーパレット
- "もっと見る" の追加読み込み件数
- レスポンシブ対応の具体的なブレイクポイント
- API Route のエンドポイント設計（`/api/dashboard/*` など）

### Deferred Ideas (OUT OF SCOPE)
- 期間切替（1M/3M/6M/1Y/ALL）
- ライトテーマ切替
- 銘柄単位タイムライン表示モード
- HOLD判断の展開表示オプション
- キャンドルスティックチャート（個別銘柄）
- フルテキスト検索（reasoning検索）— v2 REASON-01
- 複数エージェント比較 — v2 REASON-03

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DASH-01 | ポートフォリオ総資産の時系列グラフをベンチマーク（SPY/TOPIX）と比較表示 | lightweight-charts v5 + LineSeries 複数系列 + %正規化ロジック |
| DASH-02 | 現在ポジション一覧（保有数・取得価格・現在価格・損益・配分比率） | Drizzle: positions + priceSnapshots JOIN + Recharts PieChart |
| DASH-03 | 取引履歴タイムライン（Geminiの判断理由デフォルト展開） | decisions.transcript JSONB解析 + アコーディオンUI |
| DASH-04 | パフォーマンス指標カード（累計リターン・差分・シャープレシオ・最大DD・勝率・取引数） | portfolioSnapshots日次集計 + サーバーサイド計算 |
| DASH-05 | 確信度（high/medium/low）の色分け表示 | GeminiDecisionItem.confidence フィールド活用 |

</phase_requirements>

---

## Summary

Phase 4はデータ書き込みパイプライン（Phase 1–3）の成果を「読む」UIフェーズ。DB内に蓄積された `portfolioSnapshots`・`positions`・`trades`・`decisions` をNext.js Server Componentでクエリし、クライアントチャートに渡すパターンが基本設計。

核心的な実装判断は2点。(1) `lightweight-charts` v5はReact公式ラッパーを持たないため、`lightweight-charts-react-wrapper` v2.1.1（`Chart` + `LineSeries`コンポーネント）を使うか、TradingViewの公式advanced exampleにあるコンテキストベース自作ラッパーを使う。(2) パフォーマンス指標（シャープレシオ・最大DD・勝率）はDBから読んだ `portfolioSnapshots` をServer Component内で計算し、クライアントに計算済みの値を渡す。計算ロジック自体は小さくhand-rollが現実的（外部ライブラリ不要）。

**Primary recommendation:** Server Component でDBをクエリ → シリアライズ可能なデータ（数値・文字列）を props として `"use client"` チャートコンポーネントに渡す。チャートはlazyでインポートして初期ロードのJSを抑制する。

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `lightweight-charts` | 5.1.0 | ポートフォリオ推移ラインチャート | CONTEXT.md D-05 で確定。45KB gzip、財務時系列特化、Canvas描画 |
| `lightweight-charts-react-wrapper` | 2.1.1 | Reactコンポーネントラッパー | CONTEXT.md D-10 で確定。`Chart` + `LineSeries` コンポーネントを提供 |
| `recharts` | 3.8.1 | 配分パイ/ドーナツチャート | CONTEXT.md D-09 で確定。10セグメント以下のカテゴリチャートに適切 |
| Next.js App Router | 16.2.3 | Server Component + Route Handler | 既インストール。DB直接クエリ + `"use client"` 境界管理 |
| Drizzle ORM | 0.45.2 | DBクエリ | 既インストール。`db.select()` でServer Componentから直接クエリ可能 |
| Tailwind CSS | v4 | スタイリング | 既インストール。`@import "tailwindcss"` のみ、設定ファイル不要 |

**注意:** `lightweight-charts-react-wrapper` の最新npm公開バージョンは `2.1.1` [VERIFIED: npm registry]。CLAUDE.md に `^3` と記載があるが、npm上で `3.x` は存在しない。`2.1.1` が最新安定版として使用する。

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `date-fns` | 4.1.0 | 日付フォーマット | 既インストール。タイムラインの日付表示 |
| `zod` | 3.25.x | `decisions.transcript` JSONB のランタイム検証 | 既インストール。GeminiResponseSchema 転用可能 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `lightweight-charts-react-wrapper` | 自作Contextラッパー（TradingView公式exampleベース） | 自作はカスタマイズ自由度が高いが実装コスト大。ラッパーライブラリを優先 |
| Recharts PieChart | lightweight-charts (カスタムシリーズ) | PieはRecharts の得意領域。lightweight-chartsはOHLCV特化で不適切 |
| Server Componentのみ | Route Handler + fetch | ダッシュボードはSSR専用ページなのでServer Componentで直接DBクエリが最もシンプル |

**Installation:**
```bash
npm install lightweight-charts lightweight-charts-react-wrapper recharts
```

**Version verification:** [VERIFIED: npm registry 2026-04-12]
- `lightweight-charts`: 5.1.0
- `lightweight-charts-react-wrapper`: 2.1.1
- `recharts`: 3.8.1

---

## Architecture Patterns

### Recommended Project Structure
```
app/
├── dashboard/
│   ├── page.tsx                    # Server Component (DBクエリ + データ変換)
│   └── components/
│       ├── DashboardHeader.tsx     # Server Component (静的ヘッダー)
│       ├── PerformanceGrid.tsx     # Server Component (計算済み指標表示)
│       ├── PortfolioChart.tsx      # "use client" (lightweight-charts)
│       ├── PositionsTable.tsx      # Server Component (テーブル)
│       ├── AllocationChart.tsx     # "use client" (Recharts PieChart)
│       └── TradeTimeline.tsx       # Client Component (アコーディオン状態管理)
├── api/
│   └── dashboard/
│       ├── portfolio-chart/
│       │   └── route.ts            # GET: チャートデータ (任意。Server Componentで代替可)
│       └── timeline/
│           └── route.ts            # GET: タイムライン追加読み込み（"もっと見る"用）
lib/
└── dashboard/
    ├── queries.ts                  # Drizzle クエリ (server-only)
    └── metrics.ts                  # シャープレシオ・最大DD・勝率計算 (server-only)
```

### Pattern 1: Server Component でDBをクエリ → Client Componentにシリアライズ可能データを渡す

**What:** Next.js App Router の基本パターン。`page.tsx` でDBをawait、計算済みデータをpropsとしてClient Componentに渡す
**When to use:** ダッシュボード全体（初期ロード）

```typescript
// Source: node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md
// app/dashboard/page.tsx — Server Component
import 'server-only'
import { db } from '@/db'
import { portfolioSnapshots, positions } from '@/db/schema'
import { PortfolioChart } from './components/PortfolioChart'
import { calculateMetrics } from '@/lib/dashboard/metrics'

export default async function DashboardPage() {
  // DBクエリはサーバーサイドで実行される
  const snapshots = await db.select().from(portfolioSnapshots).orderBy(...)
  const metrics = calculateMetrics(snapshots)

  // シリアライズ可能な数値・文字列のみをClient Componentに渡す
  return (
    <main>
      <PortfolioChart data={snapshots.map(s => ({
        time: s.snapshotDate,
        value: Number(s.totalValueJpy)
      }))} />
    </main>
  )
}
```

### Pattern 2: lightweight-charts v5 — 複数LineSeries（%正規化）

**What:** `"use client"` コンポーネントで `Chart` + `LineSeries` を使い、3系列を%リターンで正規化して重ね表示
**When to use:** DASH-01 ポートフォリオ推移チャート

```typescript
// Source: github.com/trash-and-fire/lightweight-charts-react-wrapper (verified 2026-04-12)
// Source: tradingview.github.io/lightweight-charts/tutorials/react/advanced
'use client'
import { Chart, LineSeries } from 'lightweight-charts-react-wrapper'

type ChartPoint = { time: string; value: number }

interface Props {
  portfolio: ChartPoint[]  // %正規化済み (初日=0)
  spy: ChartPoint[]        // %正規化済み
  topix: ChartPoint[]      // %正規化済み
}

export function PortfolioChart({ portfolio, spy, topix }: Props) {
  return (
    <Chart
      width={800}
      height={400}
      layout={{
        background: { color: '#0f172a' },  // slate-900
        textColor: '#cbd5e1',               // slate-300
      }}
      grid={{
        vertLines: { color: '#1e293b' },
        horzLines: { color: '#1e293b' },
      }}
    >
      <LineSeries
        data={portfolio}
        color="#60a5fa"   // blue-400 (ポートフォリオ主線)
        lineWidth={2}
      />
      <LineSeries
        data={spy}
        color="#64748b"   // slate-500 (SPYグレー系)
        lineWidth={1}
      />
      <LineSeries
        data={topix}
        color="#475569"   // slate-600 (TOPIXグレー系別色)
        lineWidth={1}
      />
    </Chart>
  )
}
```

**%正規化計算（サーバーサイドで実行）:**
```typescript
// lib/dashboard/metrics.ts
function normalizeToPercent(series: { date: string; value: number }[]): { time: string; value: number }[] {
  if (series.length === 0) return []
  const base = series[0].value
  return series.map(s => ({
    time: s.date,
    value: base > 0 ? ((s.value - base) / base) * 100 : 0
  }))
}
```

### Pattern 3: Recharts DonutChart — 配分比率

**What:** `PieChart` + `Pie` + `Cell` で innerRadius を設定してドーナツ形式
**When to use:** DASH-02 配分比率表示

```typescript
// Source: WebSearch verified - recharts official pattern (2026-04-12)
'use client'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

const COLORS = ['#60a5fa','#34d399','#f59e0b','#f87171','#a78bfa','#fb923c']

interface AllocationSlice {
  name: string
  value: number  // 時価評価額 JPY
}

export function AllocationChart({ data }: { data: AllocationSlice[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          cx="50%"
          cy="50%"
          outerRadius={100}
          innerRadius={55}
        >
          {data.map((_, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(v: number) => `¥${v.toLocaleString()}`} />
      </PieChart>
    </ResponsiveContainer>
  )
}
```

### Pattern 4: タイムライン — decisions.transcript からのデータ抽出

**What:** `decisions.transcript.decisions[]` から action が BUY/SELL の項目のみフィルタ。`trades` と JOIN して実際に執行されたものだけ表示
**When to use:** DASH-03 トレードタイムライン

```typescript
// lib/dashboard/queries.ts (server-only)
import 'server-only'
import { db, schema } from '@/db'
import { eq, desc } from 'drizzle-orm'
import type { GeminiResponse } from '@/lib/agent/types'

export async function getTimelineData(portfolioId: string, limit = 20) {
  const rows = await db
    .select()
    .from(schema.decisions)
    .where(eq(schema.decisions.portfolioId, portfolioId))
    .orderBy(desc(schema.decisions.runDate))
    .limit(limit)

  return rows.map(row => {
    const transcript = row.transcript as { decisions?: GeminiResponse['decisions']; market_assessment?: string }
    const activeTrades = (transcript.decisions ?? []).filter(
      d => d.action === 'BUY' || d.action === 'SELL'
    )
    return {
      date: row.runDate,
      marketAssessment: transcript.market_assessment ?? '',
      trades: activeTrades,  // { ticker, action, quantity, confidence, reasoning }[]
    }
  })
}
```

### Pattern 5: パフォーマンス指標計算（サーバーサイド）

```typescript
// lib/dashboard/metrics.ts
export function calculateMetrics(snapshots: { totalValueJpy: string; snapshotDate: string }[]) {
  const values = snapshots.map(s => Number(s.totalValueJpy))
  if (values.length < 2) return null

  // 累計リターン
  const totalReturn = ((values[values.length - 1] - values[0]) / values[0]) * 100

  // 日次リターン系列
  const dailyReturns = values.slice(1).map((v, i) => (v - values[i]) / values[i])

  // シャープレシオ（リスクフリーレート=0、年率換算）
  const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length
  const variance = dailyReturns.reduce((a, r) => a + (r - mean) ** 2, 0) / dailyReturns.length
  const stddev = Math.sqrt(variance)
  const sharpe = stddev > 0 ? (mean / stddev) * Math.sqrt(252) : 0

  // 最大ドローダウン
  let peak = values[0]
  let maxDrawdown = 0
  for (const v of values) {
    if (v > peak) peak = v
    const dd = (peak - v) / peak
    if (dd > maxDrawdown) maxDrawdown = dd
  }

  return {
    totalReturn,
    sharpe,
    maxDrawdown: maxDrawdown * 100,
  }
}
```

### Anti-Patterns to Avoid
- **Client Componentでdb直接クエリ:** `db/index.ts` は `server-only` ガード済み。`"use client"` コンポーネントからimportするとビルドエラー
- **非シリアライズ可能な値をpropsに渡す:** `Date` オブジェクト、`BigInt`、Drizzleのモデルオブジェクトはそのままではpropとして渡せない。`Number()`・`.toISOString()` で変換してから渡す
- **lightweight-charts をSSRで使用:** Canvas APIを使うため必ず `"use client"` が必要。SSR時にエラーになる
- **recharts を大量時系列データに使用:** CONTEXT.md の "What NOT to Use" で明示。ラインチャートはlightweight-chartsを使う
- **TickerホワイトリストなしでSPY/1306.Tの価格を取得:** `priceSnapshots` は `config/tickers.ts` のホワイトリスト銘柄のみ蓄積される。1306.Tがホワイトリストにない場合、データがない

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 財務時系列チャート | カスタムSVGチャート | `lightweight-charts` | Canvasベース高性能、日次1年以上のデータも快適 |
| パイ/ドーナツチャート | カスタムSVG計算 | `recharts` PieChart | SVG計算・ラベル配置・Tooltipが複雑 |
| チャートのレスポンシブ対応 | ResizeObserverの手実装 | `ResponsiveContainer`（recharts）/ `container.clientWidth`（lightweight-charts） | ウィンドウリサイズ処理のエッジケースが多い |
| 確信度バッジ | CSS+ロジック自作 | Tailwindクラス条件分岐 | `high/medium/low` の3値はif文で十分。ライブラリ不要 |

**Key insight:** シャープレシオ・最大DD・勝率の計算は標準的な算術で実装可能。外部ライブラリは不要（`portfolio_analytics_js` 等は過剰）。

---

## Common Pitfalls

### Pitfall 1: lightweight-charts-react-wrapperのSSRエラー
**What goes wrong:** `Chart` コンポーネントを `"use client"` なしでimportするとSSRでCanvas APIが見つからずクラッシュ
**Why it happens:** lightweight-chartsはブラウザのCanvas APIに依存。Node.jsサーバーサイドでは利用不可
**How to avoid:** `PortfolioChart.tsx` の先頭に `'use client'` を必ず記述。または `next/dynamic` でSSRを無効化してlazyインポート
**Warning signs:** ビルドエラー or 実行時 `ReferenceError: document is not defined`

```typescript
// 安全なパターン: dynamic import で SSR 無効化
import dynamic from 'next/dynamic'
const PortfolioChart = dynamic(() => import('./PortfolioChart'), { ssr: false })
```

### Pitfall 2: Drizzle numeric型の文字列返却
**What goes wrong:** `portfolioSnapshots.totalValueJpy` は `numeric(18,4)` 型。Drizzleは文字列として返す。チャートデータに数値が必要なのに文字列を渡してしまう
**Why it happens:** PostgreSQLのnumeric型はJavaScriptのNumberでは精度が失われるため、Drizzleは意図的に文字列で返す
**How to avoid:** サーバーサイドで必ず `Number(row.totalValueJpy)` に変換してからpropを渡す
**Warning signs:** チャートが空白 / `NaN` 表示

### Pitfall 3: decisions.transcriptのJSONB型解析
**What goes wrong:** `decisions.transcript` はJSONBカラム。Drizzleは `$type<DecisionTranscript>()` でキャストしているが、`transcript.decisions[]` の中の個別銘柄データは `GeminiResponse` スキーマとの整合確認が必要
**Why it happens:** JSONB列は型安全ではなく、Phase 3でのデータ書き込み形式を信頼する
**How to avoid:** `GeminiResponseSchema.safeParse(transcript)` でランタイム検証。パースエラーはスキップして表示しない

### Pitfall 4: SPYはUSD建て・1306.TはJPY建て の混在
**What goes wrong:** `priceSnapshots.close` はSPYがUSD、1306.TがJPY。絶対値で比較すると単位が異なる
**Why it happens:** ベンチマーク比較を絶対値で試みるとスケールが崩れる
**How to avoid:** CONTEXT.md D-06 の通り、各系列の初日を0%として%変化率で正規化。通貨差はこの手法で解消される（[ASSUMED] 通貨正規化の検証はPhase 4実装時に実データで確認）

### Pitfall 5: 1306.Tのホワイトリスト未追加
**What goes wrong:** `config/tickers.ts` に 1306.T が存在しないと `priceSnapshots` にデータが蓄積されていない
**Why it happens:** Phase 2の市場データ取得パイプラインはホワイトリスト銘柄のみを処理する
**How to avoid:** Phase 4の最初のタスクで 1306.T を `TICKERS` 配列に追加し、バックフィルスクリプトを実行してから開発を進める
**Warning signs:** ベンチマーク系列が空でチャートに表示されない

### Pitfall 6: Tailwind v4 でのカスタムカラー定義方法の変更
**What goes wrong:** Tailwind v4は `tailwind.config.js` が存在しない。`@theme` ブロックで CSS変数を定義する
**Why it happens:** Tailwind v4は設定ファイルレスアーキテクチャ
**How to avoid:** `app/globals.css` の `@theme inline { }` ブロックにカスタムカラーを追加する

```css
/* app/globals.css — Tailwind v4 カスタムカラー定義 */
@theme inline {
  --color-slate-950: #020617;
  /* ダークテーマ追加カラーなど */
}
```

---

## Code Examples

### ダークテーマ基本設定（globals.css Tailwind v4）

```css
/* Source: node_modules/next/dist/docs/01-app/01-getting-started/11-css.md (verified) */
/* app/globals.css */
@import "tailwindcss";

@theme inline {
  --color-background: #0f172a;    /* slate-900 */
  --color-surface: #1e293b;       /* slate-800 (カード背景) */
  --color-border: #334155;        /* slate-700 */
  --color-text-primary: #f1f5f9;  /* slate-100 */
  --color-text-muted: #94a3b8;    /* slate-400 */
  --color-accent-green: #4ade80;  /* green-400 (high confidence / プラス) */
  --color-accent-yellow: #facc15; /* yellow-400 (medium confidence) */
  --color-accent-red: #f87171;    /* red-400 (low confidence / マイナス) */
  --color-accent-blue: #60a5fa;   /* blue-400 (ポートフォリオライン) */
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

body {
  background-color: var(--color-background);
  color: var(--color-text-primary);
}
```

### タイムラインの "もっと見る" ページング（Route Handler パターン）

```typescript
// Source: node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md
// app/api/dashboard/timeline/route.ts
import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { sessionOptions } from '@/lib/session'
import { getTimelineData } from '@/lib/dashboard/queries'

export async function GET(request: NextRequest) {
  const session = await getIronSession(await cookies(), sessionOptions)
  if (!session.isAuthenticated) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const offset = Number(searchParams.get('offset') ?? '0')
  const limit = 20

  const data = await getTimelineData(portfolioId, limit, offset)
  return NextResponse.json(data)
}
```

### 確信度バッジの色分け（Tailwind v4）

```typescript
// Source: CONTEXT.md D-14 (verified pattern)
function ConfidenceBadge({ confidence }: { confidence: 'high' | 'medium' | 'low' }) {
  const styles = {
    high: 'bg-green-400/10 text-green-400 border border-green-400/20',
    medium: 'bg-yellow-400/10 text-yellow-400 border border-yellow-400/20',
    low: 'bg-red-400/10 text-red-400 border border-red-400/20',
  }
  const labels = { high: '高確信', medium: '中確信', low: '低確信' }

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[confidence]}`}>
      {labels[confidence]}
    </span>
  )
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Next.js `middleware.ts` | `proxy.ts` (リネーム) | Next.js 16.0.0 | ファイル名変更のみ。API同一 |
| Tailwind v3 `tailwind.config.js` | Tailwind v4 `@theme` CSS変数 | Tailwind v4.0 | 設定ファイル廃止。globals.cssで直接設定 |
| `lightweight-charts` v3 `addLineSeries()` | v5 `addSeries(LineSeries, options)` | v5.0 | API変更。v5はTreeshake可能な関数を直接import |
| Recharts v2 | Recharts v3 | 2025 | APIはほぼ互換。最新は3.8.1 |

**Deprecated/outdated:**
- `addLineSeries()`: lightweight-charts v5では削除。`addSeries(LineSeries, opts)` を使う
- `tailwind.config.js`: Tailwind v4では不要（このプロジェクトでは既に存在しない）
- Next.js `middleware.ts`: v16では `proxy.ts` にリネーム（既に対応済み）

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `lightweight-charts-react-wrapper` の最新安定版が `2.1.1` であり、CLAUDE.md記載の `^3` は誤記または将来版 | Standard Stack | `^3` が存在する場合はそちらを使うべき。実装前にnpm確認必須 |
| A2 | SPY/1306.Tの%正規化でUSD/JPY通貨差が解消される | Code Examples / Pitfalls | 為替レートの大きな変動期には%変化率でも通貨効果が残る可能性がある（個人学習用途では許容範囲） |
| A3 | `decisions.transcript` の `decisions[]` フィールドが `GeminiResponse.decisions[]` の構造と一致している | Code Examples | Phase 3の実装が異なる構造で保存していた場合、タイムライン表示が壊れる。Phase 3コードの読み込みが必要 |
| A4 | Phase 2のバックフィルスクリプトで 1306.T を追加後に実行すれば `priceSnapshots` データが取得できる | Pitfalls | Phase 2のバックフィルスクリプト実装が1306.T対応していない場合は別途実行が必要 |

**確認済み（VERIFIED）の主要事項:**
- `lightweight-charts`: 5.1.0 [VERIFIED: npm registry]
- `lightweight-charts-react-wrapper`: 2.1.1 [VERIFIED: npm registry]
- `recharts`: 3.8.1 [VERIFIED: npm registry]
- Next.js 16.2.3 で `proxy.ts` が正式なmiddlewareファイル名 [VERIFIED: node_modules/next/dist/docs]
- Tailwind v4 は `@theme` CSS変数ブロックで設定 [VERIFIED: project globals.css + node_modules/next/dist/docs]
- Drizzle numeric型は文字列で返却 [VERIFIED: db/schema.ts + Drizzle docs pattern]
- `db/index.ts` は `server-only` ガード済み [VERIFIED: source code]
- `decisions.transcript` は `DecisionTranscript` 型のJSONBカラム [VERIFIED: db/schema.ts]
- `GeminiDecisionItem.confidence` は `'high' | 'medium' | 'low'` のenum [VERIFIED: lib/agent/types.ts]

---

## Open Questions

1. **`lightweight-charts-react-wrapper` のバージョン不一致**
   - What we know: CLAUDE.md は `^3` と記載。npm registryの最新は `2.1.1`。CLAUDE.md作成当時は `^3` が予告されていた可能性がある
   - What's unclear: `3.x` が既にリリースされているか、開発中か
   - Recommendation: `npm install lightweight-charts-react-wrapper` でインストールし、インストールされたバージョンを確認。`2.1.1` がインストールされた場合は `Chart` / `LineSeries` のimportを `lightweight-charts-react-wrapper` から行う。代替として公式advancedexampleのコンテキストパターンを自作する

2. **"もっと見る" のオフセット管理をClient Componentで行うか、Route Handlerに任せるか**
   - What we know: 初期20件はServer Componentで取得。追加読み込みはインタラクティブなので Client Componentが必要
   - What's unclear: Route Handler `/api/dashboard/timeline?offset=N` を作るか、Server Actionsを使うか
   - Recommendation: Route Handler パターン（既存の `/api/cron/*` と同じ）が既確立のため採用。Server Actionsはフォーム用途向きで、GETデータフェッチには不適切

3. **positions テーブルの現在価格取得**
   - What we know: `positions.avgCost` は取得平均。現在価格は `priceSnapshots` から最新日の `close` を引く必要がある
   - What's unclear: JPとUSで最終営業日が異なる場合の最新日選択方法
   - Recommendation: `marketClosed = false` でフィルタし、各銘柄ごとに最新の `priceDate` を1件取得するサブクエリまたはウィンドウ関数を使う

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Next.js build | ✓ | (existing) | — |
| `lightweight-charts` | DASH-01 | ✗ (未インストール) | — | なし（要インストール）|
| `lightweight-charts-react-wrapper` | DASH-01 | ✗ (未インストール) | — | なし（要インストール）|
| `recharts` | DASH-02 | ✗ (未インストール) | — | なし（要インストール）|
| Neon DB (DATABASE_URL) | 全DBクエリ | ✓ (Phase 1確認済み) | — | — |

**Missing dependencies with no fallback (must install before implementation):**
- `npm install lightweight-charts lightweight-charts-react-wrapper recharts`

---

## Validation Architecture

> workflow.nyquist_validation の設定は確認できていないため、デフォルト有効として記載。

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.4 |
| Config file | (vitest.config.ts 要確認) |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DASH-01 | %正規化ロジック (normalizeToPercent) | unit | `npx vitest run lib/dashboard/metrics.test.ts` | ❌ Wave 0 |
| DASH-02 | 含み損益計算 (unrealizedPnl) | unit | `npx vitest run lib/dashboard/metrics.test.ts` | ❌ Wave 0 |
| DASH-03 | transcript解析・BUY/SELLフィルタ | unit | `npx vitest run lib/dashboard/queries.test.ts` | ❌ Wave 0 |
| DASH-04 | シャープレシオ・最大DD・勝率計算 | unit | `npx vitest run lib/dashboard/metrics.test.ts` | ❌ Wave 0 |
| DASH-05 | confidence → CSS class マッピング | unit | `npx vitest run app/dashboard/components/*.test.tsx` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run lib/dashboard/`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `lib/dashboard/metrics.ts` — 計算ロジック実装
- [ ] `lib/dashboard/metrics.test.ts` — 正規化・指標計算のユニットテスト
- [ ] `lib/dashboard/queries.ts` — DBクエリ関数実装
- [ ] `lib/dashboard/queries.test.ts` — transcript解析のユニットテスト（モックDB使用）

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | iron-session（既実装 Phase 1）|
| V3 Session Management | yes | iron-session cookie（既実装）|
| V4 Access Control | yes | proxy.ts の認証ゲート（既実装）|
| V5 Input Validation | yes | Route Handlerのoffsetパラメータは `Number()` + 範囲チェック |
| V6 Cryptography | no | データ表示のみ、暗号化は不要 |

### Known Threat Patterns for Dashboard Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| 未認証ユーザーのダッシュボードアクセス | Spoofing | proxy.ts の iron-session 認証ゲート（既実装）|
| `/api/dashboard/*` Route Handlerへの未認証アクセス | Spoofing | Route Handler内で `getIronSession(await cookies(), sessionOptions)` で認証確認 |
| クライアントバンドルへのDBクレデンシャル漏洩 | Information Disclosure | `db/index.ts` の `server-only` ガード + Server Componentでのみクエリ実行 |
| timelineのoffsetパラメータへのインジェクション | Tampering | `Number(searchParams.get('offset'))` で数値変換 + Drizzle ORM のパラメタライズドクエリ |

**注意:** `/api/dashboard/*` はCRON_SECRETによる保護は不要（ユーザー向けのRead-only API）。iron-sessionによる認証チェックのみで十分。

---

## Sources

### Primary (HIGH confidence)
- [VERIFIED] `node_modules/next/dist/docs/01-app/` — Next.js 16.2.3 公式ドキュメント（ローカル）
  - `01-getting-started/05-server-and-client-components.md` — Server/Client Component パターン
  - `01-getting-started/06-fetching-data.md` — DB直接クエリパターン
  - `01-getting-started/15-route-handlers.md` — Route Handler 仕様
  - `01-getting-started/11-css.md` — Tailwind v4 設定方法
  - `03-api-reference/03-file-conventions/proxy.md` — proxy.ts 仕様
- [VERIFIED] npm registry — `lightweight-charts@5.1.0`, `lightweight-charts-react-wrapper@2.1.1`, `recharts@3.8.1`
- [VERIFIED] Project source — `db/schema.ts`, `lib/agent/types.ts`, `config/tickers.ts`, `app/globals.css`, `db/index.ts`

### Secondary (MEDIUM confidence)
- [CITED: tradingview.github.io/lightweight-charts/tutorials/react/advanced] — advanced React example（ChartContainer + Series コンテキストパターン）
- [CITED: github.com/trash-and-fire/lightweight-charts-react-wrapper] — Chart / LineSeries コンポーネントAPI

### Tertiary (LOW confidence)
- WebSearch: recharts PieChart + Cell パターン（GeeksforGeeks / Recharts公式examples） — 基本パターンは複数ソースで一致、HIGH相当

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — npm registryでバージョン確認済み、CONTEXT.md確定済み
- Architecture: HIGH — Next.js 16ローカルドキュメント + 既存コードベース確認済み
- Pitfalls: HIGH — ソースコード直接検証（server-only、numeric文字列、DBスキーマ）
- Chart API: MEDIUM — 公式サンプルコード確認済みだが、`lightweight-charts-react-wrapper` のバージョン不一致が未解消

**Research date:** 2026-04-12
**Valid until:** 2026-05-12（stable libraries、ただし `lightweight-charts-react-wrapper` v3リリース状況は要確認）
