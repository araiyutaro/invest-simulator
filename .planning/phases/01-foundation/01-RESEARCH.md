# Phase 1: Foundation - Research

**Researched:** 2026-04-11
**Domain:** Drizzle ORM + Neon Postgres + iron-session v8 + Next.js 16 Proxy + Anthropic SDK
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**DB Schema**
- D-01: Claudeトランスクリプトは `decisions.transcript jsonb not null` の単一カラムに格納
- D-02: 価格・金額は `numeric(18,4)` 型
- D-03: 多通貨なし。USD→JPY換算後の単一ポートフォリオ
- D-04: `decisions (portfolio_id, run_date)` にUNIQUE制約で冪等性担保
- D-05: 6テーブル構成: `portfolios`, `positions`, `trades`, `decisions`, `price_snapshots`, `portfolio_snapshots`
- D-06: `trades.decision_id` FK で判断追跡

**AI Layer Selection**
- D-07: `@anthropic-ai/claude-agent-sdk` と `@anthropic-ai/sdk` 両方のHello World SPIKEを実装
- D-08: ローカル + Vercel Preview 両環境で動作確認
- D-09: 判定基準: Vercel動作可否（go/no-go）→ コード量の少なさ
- D-10: 採用決定後 PROJECT.md Key Decisionsに記録、不採用コード削除
- D-11: SPIKE結果は `.planning/research/AI-LAYER-SPIKE.md` に記録

**Auth UX**
- D-12: `/login` はパスワード単一入力のみ
- D-13: セッション有効期間30日（`maxAge = 60*60*24*30`）
- D-14: 保護範囲はダッシュボード＋API全域。`/login` と `/api/cron/*` のみ除外
- D-15: 誤入力時401＋「パスワードが違います」表示。レートリミットなし
- D-16: `crypto.timingSafeEqual` による定数時間比較（平文env）

**Secret / Env Management**
- D-17: 開発と本番を完全分離（別Neon DB/ブランチ、別APIキー、別SESSION_SECRET）
- D-18: ローカルは `.env.local` のみ。`.env.example` にキー名一覧（値なし）
- D-19: Vercel environment は Production のみ設定（Preview env未設定でよい）
- D-20: 必須環境変数: `DATABASE_URL`, `ANTHROPIC_API_KEY`, `SESSION_SECRET`（32バイト以上）, `SITE_PASSWORD`, `CRON_SECRET`
- D-21: `NEXT_PUBLIC_*` プレフィックス禁止。全シークレットはサーバーサイドのみ

### Claude's Discretion

- Drizzleのマイグレーションファイル名・構成
- テーブルのtimestampカラム名（`created_at`/`inserted_at` 等）
- iron-sessionのcookie名
- ログインページのスタイリング詳細（Tailwindでシンプルに）
- エラー表示コンポーネントの実装方法

### Deferred Ideas (OUT OF SCOPE)

- Neonブランチを使ったpreview環境 — Phase 5
- パスワードローテーションポリシー — 自分専用のため当面不要
- bcryptハッシュベース認証 — 複数人利用になったら
- エージェントログ検索UI — v2 REASON-01
- Rate limiting — 公開ツール化するときに実装
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SEC-01 | iron-sessionベースの簡易パスワード保護でダッシュボード全体を覆う | iron-session v8 API + Next.js 16 proxy.ts パターンで対応可能 |
| SEC-02 | AnthropicとFinnhubのAPIキーは環境変数で管理しクライアントに露出させない | `server-only` パッケージ + `NEXT_PUBLIC_` 禁止で対応 |
| SEC-03 | DBセッションと平文のAPIキーをSSRで漏らさない | Data Access Layer パターン + server-only パッケージで対応 |
</phase_requirements>

---

## Summary

Phase 1は後続4フェーズ全ての土台となる。DBスキーマ・認証ミドルウェア・AI Layer選択という3つの独立した技術ドメインを1フェーズで確定させる。

**最重要発見：Next.js 16では`middleware.ts`が`proxy.ts`にリネームされた（v16で非推奨→廃止）。** export関数名も`middleware`から`proxy`に変更が必要。既存のトレーニングデータやサンプルコードは全て古いファイル名を参照しているため注意必須。

Vercel Fluid Compute有効時のタイムアウト矛盾については解決済み：**Hobbyプランでも300秒（5分）**が上限。PITFALLS.mdの「60秒制限」は古い情報（Fluid Compute非有効時の旧制限値）。今のデフォルトは全プランで300秒。

AI Layer SPIKEについては、`@anthropic-ai/claude-agent-sdk`の実装を確認した結果、このSDKは**Claude Code CLIをサブプロセスとしてスポーン**するアーキテクチャであり、1GiB RAM・5GiBディスクのコンテナ環境が必要。Vercel Hobbyのサーバーレスとは根本的に非互換。SPIKEの結論はほぼ確実に`@anthropic-ai/sdk`採用になるが、D-08の実測確認は手順として実施する。

**Primary recommendation:** `proxy.ts`（旧`middleware.ts`）でcookieを読んでrequest.cookiesを渡すiron-sessionパターンを使い、Drizzle neon-httpドライバーで接続する。AI Layerは`@anthropic-ai/sdk` `beta.messages.toolRunner`を使う。

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | 0.45.2 | DB ORM + クエリビルダー | バイナリなし、Neon HTTP対応、型安全なSQL |
| drizzle-kit | 0.31.10 | マイグレーションCLI | generate/migrate コマンドでスキーマ管理 |
| @neondatabase/serverless | 1.0.2 | Neon HTTP/WS ドライバー | サーバーレス関数から接続プールなしで安全接続 |
| iron-session | 8.0.4 | 暗号化セッションcookie | App Router対応、stateless、DB不要 |
| @anthropic-ai/sdk | 0.88.0 | Claude API クライアント | tool_use + toolRunnerでサーバーレス対応 |
| server-only | latest | サーバー専用モジュール保護 | クライアントバンドルへの誤インポートをビルドエラーで防止 |
| zod | ^3.24 | 入力バリデーション | Claude出力・フォーム入力のランタイム検証 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @next/env | bundled | envファイル読み込み（ORM設定外） | drizzle.config.tsでprocess.envを読む際 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@anthropic-ai/sdk` toolRunner | `@anthropic-ai/claude-agent-sdk` | Agent SDKはサブプロセス/コンテナ必須。Vercel Hobby非対応 |
| neon-http driver | node-postgres (pg) | pg はTCP接続でサーバーレス非推奨。neon-httpはHTTP経由で安全 |
| iron-session | JWT手実装 | JWTはシークレットローテーション・失効管理が複雑。iron-sessionは30行で同等機能 |
| proxy.ts | middleware.ts | Next.js 16で非推奨。codemodで移行可能: `npx @next/codemod@canary middleware-to-proxy .` |

### Installation

```bash
npm install drizzle-orm @neondatabase/serverless iron-session @anthropic-ai/sdk server-only zod
npm install -D drizzle-kit
```

**Version verification:** [VERIFIED: npm registry 2026-04-11]
- drizzle-orm: 0.45.2
- drizzle-kit: 0.31.10
- @neondatabase/serverless: 1.0.2
- iron-session: 8.0.4
- @anthropic-ai/sdk: 0.88.0

---

## Architecture Patterns

### Recommended Project Structure

```
invest-simulator/
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   └── login/route.ts       # POST: パスワード検証 + session.save()
│   │   └── cron/
│   │       └── daily-run/route.ts   # GET: CRON_SECRET検証 + パイプライン起動
│   ├── login/
│   │   └── page.tsx                 # パスワード単一入力フォーム
│   └── dashboard/
│       └── page.tsx                 # 保護ページ（Server Component）
├── db/
│   ├── schema.ts                    # 全テーブル定義
│   └── index.ts                     # drizzle client singleton
├── lib/
│   ├── session.ts                   # iron-session 設定 + SessionData 型
│   ├── auth.ts                      # timingSafeEqual パスワード検証
│   └── ai/                          # SPIKEフォルダ
│       ├── _spikes/
│       │   ├── agent-sdk/           # claude-agent-sdk Hello World
│       │   └── standard-sdk/        # @anthropic-ai/sdk Hello World
│       └── (採用側がここに昇格)
├── proxy.ts                         # 認証ガード（旧 middleware.ts）
├── drizzle.config.ts
├── drizzle/                         # マイグレーションファイル出力先
│   └── migrations/
└── .env.example                     # キー名一覧（値なし）
```

### Pattern 1: Drizzle Schema DSL — numeric(18,4), JSONB, UNIQUE composite

```typescript
// Source: [VERIFIED: orm.drizzle.team/docs/column-types/pg 2026-04-11]
// db/schema.ts
import { pgTable, uuid, numeric, jsonb, text, date, timestamp, boolean, integer, unique } from 'drizzle-orm/pg-core'

export const portfolios = pgTable('portfolios', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  baseCurrency: text('base_currency').notNull().default('JPY'),
  initialCash: numeric('initial_cash', { precision: 18, scale: 4 }).notNull(),
  cash: numeric('cash', { precision: 18, scale: 4 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const positions = pgTable('positions', {
  id: uuid('id').primaryKey().defaultRandom(),
  portfolioId: uuid('portfolio_id').notNull().references(() => portfolios.id),
  symbol: text('symbol').notNull(),
  exchange: text('exchange').notNull(),
  quantity: integer('quantity').notNull().default(0),
  avgCost: numeric('avg_cost', { precision: 18, scale: 4 }).notNull(),
  currency: text('currency').notNull(),
  openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique().on(t.portfolioId, t.symbol),  // composite UNIQUE
])

export const decisions = pgTable('decisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  portfolioId: uuid('portfolio_id').notNull().references(() => portfolios.id),
  runDate: date('run_date').notNull(),
  transcript: jsonb('transcript').notNull(),  // Claude全ログ
  summary: text('summary'),
  tokenCostEstimate: numeric('token_cost_estimate', { precision: 18, scale: 4 }),
  confidence: text('confidence'),
  modelUsed: text('model_used'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique().on(t.portfolioId, t.runDate),  // D-04: 冪等性制約
])
```

**JSONBのTypeScript型付け:**
```typescript
// transcript JSONB の型定義
type DecisionTranscript = {
  system_prompt: string
  user_prompt: string
  tool_calls: Array<{
    id: string
    name: string
    input: Record<string, unknown>
    output: unknown
  }>
  response: string
  raw_messages: unknown[]  // Claude API messages配列まるごと
  input_data_snapshot: Record<string, unknown>
}

export const decisions = pgTable('decisions', {
  // ...
  transcript: jsonb('transcript').$type<DecisionTranscript>().notNull(),
})
```

### Pattern 2: Neon + Drizzle 接続パターン（Route Handler / Server Component）

```typescript
// Source: [VERIFIED: neon.com/docs/guides/drizzle 2026-04-11]
// db/index.ts
import 'server-only'  // クライアントへの誤エクスポート防止
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

const sql = neon(process.env.DATABASE_URL!)
export const db = drizzle({ client: sql, schema })
```

```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './db/schema.ts',
  out: './drizzle/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
```

**重要:** マイグレーション実行時は pooled connection URL ではなく **direct (non-pooled) connection URL** を使用すること。Neon接続文字列の区別:
- Pooled: `postgresql://user:pass@ep-xxx.pooler.neon.tech/db` (通常クエリ用)
- Direct: `postgresql://user:pass@ep-xxx.neon.tech/db` (マイグレーション用)

### Pattern 3: drizzle-kit マイグレーション ワークフロー

```bash
# ローカル開発: スキーマ変更後にSQLファイル生成
DATABASE_URL=<direct-url> npx drizzle-kit generate

# 生成されたSQLを確認し、DBに適用
DATABASE_URL=<direct-url> npx drizzle-kit migrate

# 差分を直接プッシュ（プロトタイプ中のみ。SQLファイル生成なし）
DATABASE_URL=<direct-url> npx drizzle-kit push
```

package.jsonスクリプト推奨:
```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio"
  }
}
```

**generate + migrate vs push の使い分け:**
- `generate + migrate`: マイグレーションファイルをgit管理したい場合（本番推奨）
- `push`: 開発初期のスキーマ試行錯誤中（ファイルを残さない）

### Pattern 4: iron-session v8 — Route Handler と proxy.ts での使い方

```typescript
// Source: [VERIFIED: github.com/vvo/iron-session README 2026-04-11]
// lib/session.ts
import 'server-only'

export type SessionData = {
  isAuthenticated: boolean
}

export const sessionOptions = {
  password: process.env.SESSION_SECRET!,  // 32バイト以上必須
  cookieName: 'invest-sim-session',
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30,  // D-13: 30日
    sameSite: 'lax' as const,
  },
}
```

```typescript
// app/api/auth/login/route.ts — Route Handlerでの使用
import { cookies } from 'next/headers'
import { getIronSession } from 'iron-session'
import { sessionOptions, type SessionData } from '@/lib/session'
import { verifyPassword } from '@/lib/auth'

export async function POST(request: Request) {
  const { password } = await request.json()

  if (!verifyPassword(password)) {
    return Response.json({ error: 'パスワードが違います' }, { status: 401 })
  }

  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  session.isAuthenticated = true
  await session.save()

  return Response.json({ success: true })
}
```

```typescript
// proxy.ts — 認証ガード（旧 middleware.ts）
// Source: [VERIFIED: Next.js 16 node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md]
// 重要: iron-sessionはproxy内でrequest.cookiesを直接渡す必要あり
// cookies()はasync storageコンテキストが必要なため proxy内では使えない
import { NextResponse, type NextRequest } from 'next/server'
import { getIronSession } from 'iron-session'
import { sessionOptions, type SessionData } from '@/lib/session'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // /login と /api/cron/* は除外
  if (pathname.startsWith('/login') || pathname.startsWith('/api/cron/')) {
    return NextResponse.next()
  }

  // proxy内ではrequest.cookiesを直接渡す（cookies()はNG）
  // Source: [CITED: github.com/vvo/iron-session/issues/694]
  const session = await getIronSession<SessionData>(
    request.cookies as any,
    sessionOptions
  )

  if (!session.isAuthenticated) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    // _next/static, _next/image, favicon.ico を除外
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
```

> **BREAKING CHANGE in Next.js 16:** ファイル名 `middleware.ts` → `proxy.ts`、export関数名 `middleware` → `proxy` に変更必須。
> 移行codemod: `npx @next/codemod@canary middleware-to-proxy .`

### Pattern 5: パスワード検証 — timingSafeEqual

```typescript
// lib/auth.ts
import 'server-only'
import { timingSafeEqual } from 'crypto'

export function verifyPassword(input: string): boolean {
  const sitePassword = process.env.SITE_PASSWORD
  if (!sitePassword) throw new Error('SITE_PASSWORD not configured')

  const inputBuf = Buffer.from(input)
  const passwordBuf = Buffer.from(sitePassword)

  // 長さが異なる場合は timingSafeEqual が throw するため要対処
  if (inputBuf.length !== passwordBuf.length) return false

  return timingSafeEqual(inputBuf, passwordBuf)
}
```

### Pattern 6: @anthropic-ai/sdk tool_use ループ (SPIKE用: standard-sdk)

```typescript
// Source: [VERIFIED: code.claude.com/docs/en/agent-sdk/overview 比較表 2026-04-11]
// + [CITED: github.com/anthropics/anthropic-sdk-typescript/blob/main/helpers.md]
// app/_spikes/standard-sdk/route.ts
import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ダミーツール: 価格取得
const getPriceTool = betaZodTool({
  name: 'get_price',
  description: 'Get current price for a stock symbol',
  inputSchema: z.object({ symbol: z.string() }),
  run: async (input) => {
    // SPIKE: 固定値を返す
    return JSON.stringify({ symbol: input.symbol, price: 150.00, currency: 'USD' })
  },
})

// ダミーツール: 売買注文
const placeOrderTool = betaZodTool({
  name: 'place_order',
  description: 'Place a virtual buy or sell order',
  inputSchema: z.object({
    symbol: z.string(),
    action: z.enum(['BUY', 'SELL', 'HOLD']),
    quantity: z.number().int().min(0),
    reasoning: z.string(),
  }),
  run: async (input) => {
    return JSON.stringify({ success: true, executedPrice: 150.00, ...input })
  },
})

export async function GET() {
  // beta.messages.toolRunnerが内部でtool_useループを自動管理
  const finalMessage = await client.beta.messages.toolRunner({
    model: 'claude-opus-4-5',
    max_tokens: 1024,
    system: 'You are a virtual fund manager. Analyze AAPL and make a buy/sell/hold decision.',
    messages: [{ role: 'user', content: 'What should we do with AAPL today?' }],
    tools: [getPriceTool, placeOrderTool],
  })

  return Response.json({ result: finalMessage.content })
}
```

### Pattern 7: @anthropic-ai/claude-agent-sdk (SPIKE用: agent-sdk)

```typescript
// app/_spikes/agent-sdk/route.ts
// NOTE: このパターンはVercel Hobby非対応の可能性大
// Claude Code CLIをサブプロセスとしてスポーンするため
// 1GiB RAM + 5GiBディスク + 永続シェル環境が必要
import { query } from '@anthropic-ai/claude-agent-sdk'

export async function GET() {
  const messages = []

  for await (const message of query({
    prompt: 'What should we do with AAPL today? Use get_price tool to check, then place_order.',
    options: {
      allowedTools: [],  // カスタムツール: MCPまたはagents定義が必要
    }
  })) {
    messages.push(message)
  }

  return Response.json({ messages })
}
```

**SPIKEの判断基準（D-09）:**
1. Vercel Preview にデプロイして両方が動くか確認
2. 動く方が複数 → コード量が少ない方を採用
3. agent-sdk が動かない場合 → standard-sdk を自動採用

### Anti-Patterns to Avoid

- **`middleware.ts`ファイルをそのまま使う**: Next.js 16では非推奨。`proxy.ts`にリネームし`proxy`関数をエクスポートすること
- **`cookies()`をproxy内で使う**: async storageコンテキストが必要なため動作しない。`request.cookies as any`を使う
- **マイグレーション時にpooled URLを使う**: connection pool経由のマイグレーションはエラーが出る。direct URLを使う
- **`NEXT_PUBLIC_`プレフィックスをシークレットに使う**: ビルド時にクライアントバンドルに埋め込まれる。**絶対禁止**
- **server-onlyなしでDB接続ファイルをエクスポートする**: クライアントコンポーネントへの誤インポートを防ぐため必須

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| セッション暗号化 | 独自JWT実装 | `iron-session` v8 | seal/unsealのsidechannel攻撃、有効期限管理の実装ミスが多発 |
| ツール実行ループ | while(stop_reason==='tool_use')手書き | `beta.messages.toolRunner` | メッセージ履歴管理・エラーハンドリングを全自動化 |
| タイムスタンプ管理 | `new Date()` + 手動UTC変換 | Postgresの `timestamptz` + `.defaultNow()` | サーバー側で一貫したUTC保証 |
| UUID生成 | `crypto.randomUUID()` | `uuid().defaultRandom()` (Drizzle) | DB側の`gen_random_uuid()`でindex効率向上 |
| マイグレーション差分検出 | スキーマ比較スクリプト | `drizzle-kit generate` | カラム追加・削除・型変更の差分を自動SQL化 |

**Key insight:** iron-sessionのseal/unseal処理は暗号的に正しい実装が難しく、自前実装では timing attack が発生しやすい。

---

## Common Pitfalls

### Pitfall 1: middleware.ts を proxy.ts に移行し忘れる

**What goes wrong:** Next.js 16でビルドは通るが動作しない（後方互換ありだが将来削除予定）。
**Why it happens:** AGENTS.mdに「Next.js 16は破壊的変更あり」と記載されているが見落とされる。
**How to avoid:** ファイルを `proxy.ts` で新規作成し、`export function proxy(request)` でエクスポートする。
**Warning signs:** 認証保護が効かず、ログインなしでdashboardにアクセスできる。

### Pitfall 2: iron-session を proxy.ts 内で cookies() と一緒に使う

**What goes wrong:** `Invariant: Method expects to have requestAsyncStorage, none available` エラー
**Why it happens:** `cookies()`はNext.jsのasync storage contextが必要だが、proxyはedgeランタイムに近い環境で実行される
**How to avoid:** proxy内では `request.cookies as any` を `getIronSession` の第1引数に渡す
**Warning signs:** proxy関数が実行時エラーで落ちてリダイレクトループになる

### Pitfall 3: マイグレーション時に pooled connection URL を使う

**What goes wrong:** `drizzle-kit migrate` が `prepared statement already exists` 等のエラーで失敗
**Why it happens:** NeonのPgBouncerがトランザクションモードで動作するため、マイグレーションに必要なセッションが維持できない
**How to avoid:** Neon Dashboardから direct connection URL (poolerなし) を取得して `DATABASE_URL` に設定してからマイグレーション実行
**Warning signs:** `drizzle-kit push`は通るが`migrate`がエラー

### Pitfall 4: @anthropic-ai/claude-agent-sdk が Vercel Hobby でサブプロセス起動に失敗する

**What goes wrong:** `query()` 呼び出し時に `ENOENT: no such file or directory, spawn claude-code` エラー
**Why it happens:** claude-agent-sdkはClaude Code CLIをサブプロセスとしてスポーンする。Vercelのサーバーレス環境にはNode.jsランタイム以外の実行ファイルが存在しない
**How to avoid:** SPIKEでローカル動作確認 → Vercel Preview確認。失敗したら即`@anthropic-ai/sdk`採用
**Warning signs:** ローカルでは動くがVercel Previewでのみ500エラー

### Pitfall 5: timingSafeEqual で長さ違いの比較をする

**What goes wrong:** `timingSafeEqual` は長さが異なる引数を受け取ると例外をスローする
**Why it happens:** Buffer長チェックを入れずにそのまま呼び出す
**How to avoid:** 比較前に `inputBuf.length !== passwordBuf.length` を確認して早期returnする（ただし早期returnも定数時間にはならないが、パスワード長自体が秘密情報でない場合はリスクなし）
**Warning signs:** 空パスワード入力時やパスワード長が違う時にランタイムエラー

---

## Code Examples

### Drizzle numeric + JSONB 型付きスキーマ全体像

```typescript
// Source: [VERIFIED: orm.drizzle.team/docs/column-types/pg 2026-04-11]
import {
  pgTable, uuid, numeric, jsonb, text, date,
  timestamp, boolean, integer, unique
} from 'drizzle-orm/pg-core'

// Transcript型（JSONB用）
export type DecisionTranscript = {
  system_prompt: string
  user_prompt: string
  tool_calls: Array<{ id: string; name: string; input: unknown; output: unknown }>
  raw_messages: unknown[]
  input_data_snapshot: Record<string, unknown>
}

export const portfolios = pgTable('portfolios', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  baseCurrency: text('base_currency').notNull().default('JPY'),
  initialCash: numeric('initial_cash', { precision: 18, scale: 4 }).notNull(),
  cash: numeric('cash', { precision: 18, scale: 4 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const positions = pgTable('positions', {
  id: uuid('id').primaryKey().defaultRandom(),
  portfolioId: uuid('portfolio_id').notNull().references(() => portfolios.id),
  symbol: text('symbol').notNull(),
  exchange: text('exchange').notNull(),
  quantity: integer('quantity').notNull().default(0),
  avgCost: numeric('avg_cost', { precision: 18, scale: 4 }).notNull(),
  currency: text('currency').notNull(),
  openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique().on(t.portfolioId, t.symbol),
])

export const trades = pgTable('trades', {
  id: uuid('id').primaryKey().defaultRandom(),
  portfolioId: uuid('portfolio_id').notNull().references(() => portfolios.id),
  decisionId: uuid('decision_id').references(() => decisions.id),  // D-06
  symbol: text('symbol').notNull(),
  action: text('action').notNull(),  // 'BUY' | 'SELL'
  quantity: integer('quantity').notNull(),
  executedPrice: numeric('executed_price', { precision: 18, scale: 4 }).notNull(),
  commission: numeric('commission', { precision: 18, scale: 4 }).notNull(),
  currency: text('currency').notNull(),
  fxRateToJpy: numeric('fx_rate_to_jpy', { precision: 12, scale: 6 }),
  executedAt: timestamp('executed_at', { withTimezone: true }).notNull().defaultNow(),
})

export const decisions = pgTable('decisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  portfolioId: uuid('portfolio_id').notNull().references(() => portfolios.id),
  runDate: date('run_date').notNull(),
  summary: text('summary'),
  transcript: jsonb('transcript').$type<DecisionTranscript>().notNull(),
  tokenCostEstimate: numeric('token_cost_estimate', { precision: 18, scale: 4 }),
  confidence: text('confidence'),
  modelUsed: text('model_used'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique().on(t.portfolioId, t.runDate),  // D-04 冪等性
])

export const priceSnapshots = pgTable('price_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  symbol: text('symbol').notNull(),
  priceDate: date('price_date').notNull(),
  close: numeric('close', { precision: 18, scale: 4 }).notNull(),
  currency: text('currency').notNull(),
  fxRateToJpy: numeric('fx_rate_to_jpy', { precision: 12, scale: 6 }),
  marketClosed: boolean('market_closed').notNull().default(false),
  assetClass: text('asset_class').notNull().default('equity'),  // D-03: 'equity' | 'fx'
  source: text('source'),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique().on(t.symbol, t.priceDate),
])

export const portfolioSnapshots = pgTable('portfolio_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  portfolioId: uuid('portfolio_id').notNull().references(() => portfolios.id),
  snapshotDate: date('snapshot_date').notNull(),
  totalValueJpy: numeric('total_value_jpy', { precision: 18, scale: 4 }).notNull(),
  cashJpy: numeric('cash_jpy', { precision: 18, scale: 4 }).notNull(),
  positionsValueJpy: numeric('positions_value_jpy', { precision: 18, scale: 4 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique().on(t.portfolioId, t.snapshotDate),
])
```

### decisions.transcript JSONB 設計（v2 REASON-01 全文検索対応）

```typescript
// JSONB内にGIN indexを将来追加可能な形にしておく
// v2でPostgresのjsonb_path_query等で検索可能
type DecisionTranscript = {
  // Claude APIメッセージ配列（tool_useブロック含む全ターン）
  raw_messages: Array<{
    role: 'user' | 'assistant'
    content: string | Array<{
      type: 'text' | 'tool_use' | 'tool_result'
      id?: string
      name?: string
      input?: unknown
      content?: string
    }>
  }>

  // 検索・表示用に正規化したサマリーフィールド
  system_prompt: string          // プロンプト全文（REASON-01で検索対象）
  input_data_snapshot: {         // エージェント実行時の入力データ
    portfolio: unknown
    positions: unknown[]
    prices: unknown[]
  }
  usage: {                       // トークン使用量
    input_tokens: number
    output_tokens: number
  }
}

// INSERT ON CONFLICT DO NOTHING で冪等性担保（D-04）
await db.insert(decisions)
  .values({ portfolioId, runDate, transcript, ... })
  .onConflictDoNothing()  // unique(portfolio_id, run_date) に引っかかった場合スキップ
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `middleware.ts` + `export function middleware()` | `proxy.ts` + `export function proxy()` | Next.js 16.0 | 全既存サンプルが古い。codemodで移行可能 |
| Vercel 60s timeout (Hobby) | Fluid Compute で 300s (Hobby含む全プラン) | 2024年後半 | PITFALLS.mdの60秒警告は旧情報。現在は300秒 |
| while(stop_reason==='tool_use') 手書きループ | `beta.messages.toolRunner` + `betaZodTool` | @anthropic-ai/sdk ^0.88 | ボイラープレート排除、Zod型安全ツール定義 |

**Deprecated/outdated:**
- `middleware.ts`: Next.js 16で非推奨（廃止予定）。`proxy.ts`を使うこと
- `withIronSessionApiRoute`: Next.js Pages Router専用。App RouterではgetIronSessionを使う
- drizzle `references()` に `onDelete`/`onUpdate` を書かない: 明示しないと制約なし（意図的なら問題なし）

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `@anthropic-ai/claude-agent-sdk` は Vercel Hobby のサーバーレス関数内でサブプロセス起動に失敗する | Standard Stack / Pattern 7 | 万が一動く場合、SPIKE結果によっては`@anthropic-ai/sdk`よりコード量が少ない可能性があり採用候補になる |
| A2 | drizzle-orm 0.45.2 の `onConflictDoNothing()` の構文が正しい | Code Examples | 構文が異なる場合、D-04冪等性実装でエラーが発生する |

---

## Open Questions

1. **`@anthropic-ai/claude-agent-sdk` + カスタムツールの実装パターン（SPIKE用）**
   - What we know: SDK自体のquery()は確認済み。MCP経由でカスタムツールを登録できる
   - What's unclear: MCPなしでインラインカスタムツール（get_price等）を定義する方法が公式ドキュメントに明示されていない
   - Recommendation: `allowedTools: []` で組み込みツールを全無効にし、hooksでresponseをインターセプトするか、MCPローカルサーバーを使う。SPIKE中に実測で確認

2. **Vercel PreviewへのSPIKEデプロイ（D-08, D-19）**
   - What we know: D-19でPreviewはenv未設定でよい（Productionのみ設定）
   - What's unclear: Previewにenv設定しないとSPIKEのANTHROPIC_API_KEY参照がnullになりSPIKEテスト不能
   - Recommendation: SPIKEテスト用にPreviewのみ一時的にenv設定し、確認後に削除する

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All | ✓ | (project uses Next.js 16) | — |
| npm | Package install | ✓ | (devDependencies管理済み) | — |
| Neon DB | DB layer | ✗ (未プロビジョニング) | — | .env.local設定後に利用可能 |
| Anthropic API Key | AI SPIKE | ✗ (env未設定) | — | .env.localに設定後に利用可能 |

**Missing dependencies with no fallback:**
- Neon DB: `DATABASE_URL` を取得するためにNeon Dashboardでプロジェクト作成が必要
- Anthropic API Key: `ANTHROPIC_API_KEY` をAnthropic Consoleから取得が必要

**Missing dependencies with fallback:**
- なし

---

## Validation Architecture

> workflow.nyquist_validationが.planning/config.jsonに設定されていないため有効として扱う

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (推奨) または Jest |
| Config file | `vitest.config.ts` — Wave 0で作成 |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEC-01 | iron-sessionが正しくセッションを暗号化・復号する | unit | `npx vitest run tests/lib/session.test.ts` | ❌ Wave 0 |
| SEC-01 | proxy.tsが未認証リクエストを/loginにリダイレクトする | unit | `npx vitest run tests/proxy.test.ts` (unstable_doesProxyMatch) | ❌ Wave 0 |
| SEC-02 | `NEXT_PUBLIC_`プレフィックスのシークレットが存在しない | lint/static | `grep -r "NEXT_PUBLIC_" lib/ db/` | ❌ Wave 0 |
| SEC-03 | db/index.tsが`server-only`インポートを持つ | unit | ビルド時チェック（server-onlyパッケージが保証） | ❌ Wave 0 |
| SEC-03 | timingSafeEqualが長さ違いのパスワードで例外スローしない | unit | `npx vitest run tests/lib/auth.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/lib/session.test.ts` — iron-session暗号化/復号をカバー (SEC-01)
- [ ] `tests/proxy.test.ts` — プロキシルーティングロジックをカバー (SEC-01)
- [ ] `tests/lib/auth.test.ts` — timingSafeEqualのエッジケースをカバー (SEC-03)
- [ ] `vitest.config.ts` — テストフレームワーク設定
- [ ] Framework install: `npm install -D vitest @vitest/ui`

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | iron-session v8 + timingSafeEqual |
| V3 Session Management | yes | iron-session `maxAge=30日`, `httpOnly=true`, `secure=true(prod)` |
| V4 Access Control | yes | proxy.ts matcher で全ルートをデフォルト保護 |
| V5 Input Validation | yes | zod（ログインフォーム入力）|
| V6 Cryptography | yes | iron-session の seal/unseal（@hapi/ironを内部使用）、crypto.timingSafeEqual |

### Known Threat Patterns for this Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| クライアントへのシークレット漏洩 | Information Disclosure | `server-only`パッケージ + `NEXT_PUBLIC_`禁止 |
| セッションcookieの盗用 | Spoofing | `httpOnly=true`, `secure=true(prod)`, `sameSite=lax` |
| Timing Attack on password compare | Information Disclosure | `crypto.timingSafeEqual` + 長さチェック |
| Proxy(middleware)バイパス | Elevation of Privilege | matcher で `_next/data` も保護（Next.js 16は自動で適用） |
| API keyのクライアントバンドル混入 | Information Disclosure | `server-only` import + `NEXT_PUBLIC_`禁止をコードレビューで強制 |

---

## Sources

### Primary (HIGH confidence)

- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` — Next.js 16 proxy.ts API（middleware→proxy移行の公式確認）
- `node_modules/next/dist/docs/01-app/02-guides/data-security.md` — server-only, DAL パターン
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/maxDuration.md` — maxDuration設定
- `vercel.com/docs/functions/limitations` — Fluid Compute 300s (Hobby) 確認 [VERIFIED]
- `github.com/vvo/iron-session README` (raw) — getIronSession v8 API [VERIFIED]
- `orm.drizzle.team/docs/column-types/pg` — numeric/jsonb/uuid型 [VERIFIED]
- `orm.drizzle.team/docs/indexes-constraints` — unique composite, FK [VERIFIED]
- `code.claude.com/docs/en/agent-sdk/overview` — claude-agent-sdk vs @anthropic-ai/sdk比較 [VERIFIED]
- `code.claude.com/docs/en/agent-sdk/hosting` — コンテナ要件(1GiB RAM, 5GiB disk) [VERIFIED]
- `npm registry` — drizzle-orm@0.45.2, drizzle-kit@0.31.10, iron-session@8.0.4, @anthropic-ai/sdk@0.88.0, @neondatabase/serverless@1.0.2 [VERIFIED]

### Secondary (MEDIUM confidence)

- `github.com/vvo/iron-session/issues/694` — proxy内でのrequest.cookies直接渡しパターン [CITED]
- `neon.com/docs/guides/drizzle-migrations` — direct URL vs pooled URL for migrations [CITED]
- `github.com/anthropics/anthropic-sdk-typescript/blob/main/helpers.md` — betaZodTool, toolRunner API [CITED]

### Tertiary (LOW confidence)

- なし

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — npm registry で全バージョン確認済み
- Architecture (proxy.ts): HIGH — Next.js 16 ソースdocs直接確認
- Drizzle schema patterns: HIGH — 公式docsで全型確認
- iron-session proxy統合: MEDIUM — GitHub issueでworkaroundを確認（公式ドキュメント未記載）
- AI SPIKE結論（claude-agent-sdk Vercel非対応）: HIGH — 公式hostingドキュメントでコンテナ要件確認
- Vercel timeout: HIGH — 公式limitationsページで確認

**Research date:** 2026-04-11
**Valid until:** 2026-07-11（Next.js 17リリースまでは安定）
