# Phase 3: Agent Pipeline - Research

**Researched:** 2026-04-12
**Domain:** Gemini API structured output / 仮想売買執行 / テクニカル指標計算
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**プロンプト設計**
- D-01: システムプロンプトは観察重視型。「なぜそう判断したか」を日本語で説明させることを最優先
- D-02: ニュース圧縮はTypeScript側で事前圧縮（ticker別3ヘッドライン+1行要約）、GeminiにはRAW newsを渡さない
- D-03: 判断理由の言語は日本語。システムプロンプトで明示指定
- D-04: ニュースは `<external_news_content>` XMLタグで囲みプロンプトインジェクション対策

**判断フロー**
- D-05: Function Callingは使わず、構造化JSON出力（responseSchema）方式
- D-06: 全銘柄一括判断。1回のAPIコールでポートフォリオ全体を渡す
- D-07: GeminiのJSONスキーマ: `market_assessment` + `decisions[]`（ticker/action/quantity/confidence/reasoning）

**仮想売買執行ロジック**
- D-08: Geminiが具体的な株数を指定。サーバー側で現金超過チェック→拒否
- D-09: 約定価格はClose価格（price_snapshotsの`close`カラム）
- D-10: JPY換算はprice_snapshotsのFXレート（JPYUSD行）を参照
- D-11: 売却でquantity=0になったpositionsは削除せず`quantity=0`で保持
- D-12: portfolio_snapshotsはdaily-run最後に毎日記録（HOLD-onlyの日も含む）
- D-13: portfolioレコードがない場合に`initial_cash=10000000`で自動作成

**エラー処理と安全装置**
- D-14: Gemini APIエラーは30秒待って1回リトライ。2回目失敗時は失敗レコード保存して終了
- D-15: ホワイトリスト外銘柄・SHORT指示は個別にスキップ、スキップ理由をtranscriptに記録
- D-16: 冪等性は`decisions (portfolio_id, run_date)` UNIQUE制約。INSERT ON CONFLICT DO NOTHING
- D-17: `maxDuration=120`を Route Handler に設定するのみ

### Claude's Discretion
- prompt builderのファイル分割構成（`lib/agent/prompt-builder.ts`, `lib/agent/executor.ts`等）
- TA指標（RSI/MACD/SMA）の計算ライブラリ使い方の詳細
- Geminiのtemperature/topP等のパラメータ調整
- トークンコスト推定のロジック
- テストフィクスチャ（Gemini応答のモック）の構成
- daily-runの実行ログのフォーマット

### Deferred Ideas (OUT OF SCOPE)
- 日本株ファンダメンタル取得と活用
- 複数エージェント並行比較 (v2 REASON-03)
- リスク管理サーキットブレーカー (v2 RISK-01/02)
- バックグラウンドキューフォールバック (Phase 5 OPS-04)
- Geminiモデル切り替え戦略
- TA指標の事前計算キャッシュ

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AGENT-01 | Gemini APIで日次売買判断を実行 | `@google/generative-ai` v0.24.1 実装済み。`generateContent` + `responseSchema`パターン確認済み |
| AGENT-02 | 価格チャート・ファンダメンタル・ニュース・ポジションをAIに入力 | priceSnapshots/newsSnapshots/fundamentalsSnapshotsテーブルからクエリするprompt-builderパターン |
| AGENT-03 | ニュースは事前圧縮（銘柄ごと3ヘッドライン+1行要約） | TypeScript側でnewsSnapshotsから最新3件抽出してconcat圧縮 |
| AGENT-04 | 現物ロングのみ。構造化出力（ticker/action/quantity/confidence/reasoning） | `responseSchema`でzod-compatible SchemaTypeを定義。ホワイトリストバリデーション |
| AGENT-05 | フルトランスクリプトをdecisionsテーブルに保存 | `DecisionTranscript`型が既にschema.tsに定義済み |
| AGENT-06 | プロンプトインジェクション対策XMLデリミタ | `<external_news_content>`タグ + systemプロンプトで「信頼できない入力」を明示 |
| AGENT-07 | トークンコスト推定値をログに記録 | `usageMetadata.promptTokenCount/candidatesTokenCount`から計算。Gemini 2.5 Flash: $0.30/$2.50 per 1M tokens |
| EXEC-01 | 仮想初期資金1,000万円でポートフォリオ初期化 | portfoliosテーブルにレコードなければ自動作成 |
| EXEC-02 | Close価格で仮想売買を執行 | priceSnapshots.closeカラムから取得 |
| EXEC-03 | 現物ロング制限・現金残高不足時は買い拒否 | executorで残高チェック。SELL量>保有量もガード |
| EXEC-04 | 全取引をtradesテーブルに永続化 | tradesテーブル定義確認済み（decisionId FK含む） |
| EXEC-05 | 取引後のポジション・現金残高をpositionsテーブルで追跡 | positionsテーブルのupsertパターン。avgCostは加重平均更新 |

</phase_requirements>

---

## Summary

Phase 3は「Geminiエージェントパイプラインの構築」フェーズ。Phase 1・2で用意されたDB、Geminiクライアント、市場データ取得層を組み合わせ、`/api/cron/daily-run` Route Handlerから毎日1回のGemini呼び出しで sell/buy/hold を判断し、仮想売買を執行してDBに永続化する。

**既存コードの活用範囲は広く、新規実装は4つのモジュール（prompt-builder, gemini-caller, executor, route handler）に集中する。** `lib/ai/client.ts`のGemini singleton、`db/schema.ts`の`DecisionTranscript`型、`config/tickers.ts`の`findTicker()`バリデーション関数は全て再利用できる。既存のcronルートのCRON_SECRET認証パターンも転用可能。

**主な技術課題は2点：** (1) Gemini `responseSchema`による構造化JSON出力の信頼性確保と zodバリデーションの組み合わせ、(2) 現金残高・保有数量・avgCost の正確な更新ロジック（特にBUY時の加重平均コスト計算とJPY/USD混在ポートフォリオの統一計算）。

**Primary recommendation:** `lib/agent/`ディレクトリに `prompt-builder.ts`、`gemini-caller.ts`、`executor.ts` の3モジュールを作成し、`app/api/cron/daily-run/route.ts` がこれらをオーケストレートするシンプルな構成で実装する。

---

## Standard Stack

### Core（インストール済み）

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@google/generative-ai` | 0.24.1 | Gemini API client | Phase 1 SPIKEで動作確認済み。`responseSchema`/`usageMetadata`対応確認 |
| `zod` | ^3.25.76 | Gemini応答バリデーション | 既存パターン（lib/env.ts）と統一。runtime schema validation |
| `drizzle-orm` | ^0.45.2 | DB操作 | 既存パターンと統一 |

### Supporting（インストール要）

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `technicalindicators` | ^3.1.0 | RSI/MACD/SMA計算 | AGENT-02: prompt builderでTA指標計算時 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `technicalindicators` | 手動実装 | 手動計算は精度リスクあり。3.1.0はTypeScript source、vitest環境で動作 |
| `responseSchema` | JSONテキスト解析 | `responseSchema`はGemini側でJSON形式を強制するため、parse失敗リスクが大幅に低下 |

**Installation:**
```bash
npm install technicalindicators
npm install --save-dev @types/technicalindicators
```

**Version verification:**
- `technicalindicators`: 3.1.0 [VERIFIED: npm registry 2026-04-12]
- `@google/generative-ai`: 0.24.1 [VERIFIED: node_modules 2026-04-12]
- `zod`: 3.25.76 [VERIFIED: package.json 2026-04-12]

---

## Architecture Patterns

### Recommended Project Structure

```
lib/agent/
├── prompt-builder.ts    # DB→プロンプト組み立て（市場データ圧縮、TA指標計算）
├── gemini-caller.ts     # Gemini API呼び出し・リトライ・usageMetadata取得
├── executor.ts          # Gemini判断→仮想売買執行（trades/positions/cash更新）
└── types.ts             # GeminiResponse型・ExecutionResult型

app/api/cron/daily-run/
└── route.ts             # オーケストレーター（冪等ガード→build prompt→call→execute→snapshot）
```

### Pattern 1: Gemini responseSchema で構造化JSON出力

**What:** `GenerationConfig.responseSchema` にSchemaTypeオブジェクトを渡すことで、GeminiがJSON文字列ではなくparse済みオブジェクトを返すよう強制できる。

**When to use:** D-05で決定済み。Function Callingなしで1回完結の判断を得る場合。

```typescript
// Source: node_modules/@google/generative-ai/dist/generative-ai.d.ts (verified 2026-04-12)
import { SchemaType } from '@google/generative-ai'

const responseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    market_assessment: { type: SchemaType.STRING },
    decisions: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          ticker:     { type: SchemaType.STRING },
          action:     { type: SchemaType.STRING },  // "BUY" | "SELL" | "HOLD"
          quantity:   { type: SchemaType.INTEGER },
          confidence: { type: SchemaType.STRING },  // "high" | "medium" | "low"
          reasoning:  { type: SchemaType.STRING },
        },
        required: ['ticker', 'action', 'quantity', 'confidence', 'reasoning'],
      },
    },
  },
  required: ['market_assessment', 'decisions'],
}

const model = genAI.getGenerativeModel({
  model: GEMINI_MODEL,
  generationConfig: {
    responseMimeType: 'application/json',
    responseSchema,
    temperature: 0.3,
  },
  systemInstruction: SYSTEM_PROMPT,
})

const result = await model.generateContent(userPrompt)
const raw = result.response.text()
const parsed = JSON.parse(raw)  // responseSchemaがあればparse可能なJSON
const usage = result.response.usageMetadata  // promptTokenCount / candidatesTokenCount
```

**注意:** `responseSchema`を使う場合、`responseMimeType: 'application/json'`を必ず併用する。[VERIFIED: @google/generative-ai v0.24.1 型定義]

### Pattern 2: usageMetadata によるトークンコスト推定（AGENT-07）

```typescript
// Source: node_modules/@google/generative-ai/dist/generative-ai.d.ts (verified 2026-04-12)
const usage = result.response.usageMetadata
// usage.promptTokenCount: number
// usage.candidatesTokenCount: number
// usage.totalTokenCount: number

// Gemini 2.5 Flash pricing [VERIFIED: ai.google.dev/gemini-api/docs/pricing 2026-04-12]
const INPUT_PRICE_PER_TOKEN  = 0.30 / 1_000_000   // $0.30 per 1M input tokens
const OUTPUT_PRICE_PER_TOKEN = 2.50 / 1_000_000   // $2.50 per 1M output tokens

const estimatedCostUsd =
  (usage?.promptTokenCount    ?? 0) * INPUT_PRICE_PER_TOKEN +
  (usage?.candidatesTokenCount ?? 0) * OUTPUT_PRICE_PER_TOKEN
```

### Pattern 3: technicalindicators で RSI/MACD/SMA を計算

```typescript
// Source: github.com/anandanand84/technicalindicators (verified 2026-04-12)
// npm install technicalindicators
import { RSI, MACD, SMA } from 'technicalindicators'

// closePrices: 最低14件以上の数値配列（直近100営業日のclose）
const rsiValues = RSI.calculate({ period: 14, values: closePrices })
const rsiLast = rsiValues.at(-1) ?? null  // 直近値のみpromptに渡す

const macdValues = MACD.calculate({
  values: closePrices,
  fastPeriod: 12,
  slowPeriod: 26,
  signalPeriod: 9,
  SimpleMAOscillator: false,
  SimpleMASignal: false,
})
const macdLast = macdValues.at(-1) ?? null
// macdLast.MACD, macdLast.signal, macdLast.histogram

const sma20Values = SMA.calculate({ period: 20, values: closePrices })
const sma50Values = SMA.calculate({ period: 50, values: closePrices })
```

**注意:** `closePrices`はpriceSnapshotsから取得したnumeric文字列を `parseFloat()` で変換してから渡す。文字列のままだとNaNが発生する。[ASSUMED]

### Pattern 4: 冪等性ガード（D-16）

```typescript
// INSERT ON CONFLICT DO NOTHINGパターン（Phase 2で確立済み）
// Source: db/schema.ts - unique().on(portfolioId, runDate) 確認済み

const inserted = await db
  .insert(decisions)
  .values({ portfolioId, runDate: todayIso, transcript, ... })
  .onConflictDoNothing()  // 同日2回目の発火はスキップ

if (inserted.rowCount === 0) {
  return { skipped: true, reason: 'already_ran_today' }
}
```

### Pattern 5: BUY時のavgCost加重平均更新（EXEC-05）

```typescript
// 既存ポジションがある場合の加重平均コスト更新
const newAvgCost =
  (existingQty * existingAvgCost + buyQty * executedPrice) / (existingQty + buyQty)
```

**注意:** 全計算はJPY建てで行う。USD銘柄の場合は `executedPrice * fxRateToJpy` をJPY約定価格として使用。[ASSUMED - FXレート変換ロジックはD-10より]

### Pattern 6: portfolio_snapshot の計算（D-12）

```typescript
// daily-run最後に全ポジションのJPY換算時価を集計して1行追加
const positionsValueJpy = positions.reduce((sum, pos) => {
  const closeJpy = pos.currency === 'USD'
    ? closePrice * fxRateToJpy
    : closePrice
  return sum + pos.quantity * closeJpy
}, 0)

const totalValueJpy = cashJpy + positionsValueJpy
// portfolio_snapshotsにINSERT ON CONFLICT DO NOTHING（D-16パターン）
```

### Anti-Patterns to Avoid

- **responseSchemaなしでJSON文字列をparse:** GeminiのJSONモード出力は`responseMimeType: 'application/json'`と`responseSchema`の**両方**が必要。片方だけでは不十分
- **technicalindicatorsへの文字列渡し:** Drizzle ORMはnumericカラムを文字列で返す。`parseFloat()`変換を忘れると`NaN`が返る
- **Geminiが返すactionの大文字小文字を信頼する:** zodスキーマで`.toUpperCase()`後にバリデーション、または`z.enum()`の前に変換
- **portfolioId をハードコード:** `portfolios`テーブルから動的に取得する（D-13の自動作成ロジックを含む）

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| RSI/MACD/SMA計算 | 自前のTA計算ロジック | `technicalindicators` | ルックバック期間のoff-by-oneエラー、MACD平滑化係数等の精度リスク |
| Gemini JSON出力の強制 | プロンプト側のみでJSON形式指示 | `responseSchema` + `responseMimeType: 'application/json'` | プロンプトのみでは```json...```の余分なマークダウンが混入することがある |
| 環境変数検証 | if文での手動チェック | 既存の`lib/env.ts` + zodスキーマ | fail-fast検証パターンが確立済み |
| DB接続管理 | 毎回new接続 | 既存の`db/index.ts` singleton | server-only guard + 接続プール管理済み |

**Key insight:** GeminiのJSON出力は`responseSchema`で強制すると信頼性が大幅に上がるが、zodバリデーションは「action値のホワイトリスト確認」と「ティッカーのホワイトリスト確認」のために依然として必要（GeminiはschemaのenumをサポートするがSHORTやマニピュレーション対策は別レイヤーで行う）。

---

## Common Pitfalls

### Pitfall 1: responseSchemaのenumサポート

**What goes wrong:** SchemaTypeにはSTRING/NUMBER/BOOLEAN/ARRAY/OBJECTはあるが、`enum`フィールドが型定義上どう扱われるか不明確。"BUY"/"SELL"/"HOLD"の制約をschema側だけに頼るとGeminiが無効値を返す場合がある。

**Why it happens:** responseSchemaはOpenAPI 3.0 schemaのサブセット。enumは`format`または`description`ヒントとして機能するが、強制力はない。

**How to avoid:** responseSchemaでは`description: 'One of: BUY, SELL, HOLD'`を追加し、zodバリデーション（`z.enum(['BUY','SELL','HOLD'])`）をparse後に必ず適用する。[ASSUMED]

**Warning signs:** Geminiが"buy"や"Buy"と小文字で返すケースが散見される。

### Pitfall 2: Vercel 60秒タイムアウト vs maxDuration=120

**What goes wrong:** Phase 1 SPIKEでGeminiは4-5秒の応答時間を確認済み。しかし`maxDuration=120`はVercel Pro以上または Fluid Compute 有効時のみ有効。Vercel Hobby + 通常のServerless Functionは60秒上限。

**Why it happens:** VercelのHobbyプランでは`maxDuration`の上限が60秒。120を設定しても効果がない場合がある。

**How to avoid:** D-17でmaxDuration=120に設定することを決定済み。現状のSPIKE実測（4-5秒）では60秒以内に十分収まるため実際の問題にはならない見込み。タイムアウトが発生した場合はPhase 5でキュー対応（D-17）。

**Warning signs:** `.planning/STATE.md`に「Vercel タイムアウト矛盾」ブロッカーとして記録済み。

### Pitfall 3: priceSnapshotsのデータが当日未取得の場合

**What goes wrong:** daily-runを手動実行した際、`fetch-market-data`が先に完了していない場合はprice_snapshotsに当日データがない。

**Why it happens:** Phase 2の`fetchMarketData()`とPhase 3のdaily-runは独立したエンドポイント。

**How to avoid:** CONTEXT.md（`03-CONTEXT.md` Phase 2 D-20）に「daily-run開始時に当日データ未取得なら`fetchMarketData()`を内部直接呼び出し」と記載。executorの冒頭でこのチェックを実装する。

### Pitfall 4: numeric文字列→数値変換の忘れ

**What goes wrong:** Drizzle ORMのnumeric(18,4)カラムは文字列として返される。`technicalindicators`や算術演算に直接渡すと`NaN`が発生する。

**Why it happens:** Drizzleはnumericをstring型でマッピングする（Postgresのnumeric精度保証のため）。

**How to avoid:** `const closeNum = parseFloat(snapshot.close ?? '0')`のようにparse後に計算層へ渡す。型定義で明示的に変換ユーティリティを作成することを推奨。

### Pitfall 5: SELL時の保有数量チェック不足

**What goes wrong:** GeminiがSELL 100株を指示しても実際の保有数が50株の場合、素直に実行するとpositions.quantityが負になる。

**Why it happens:** Geminiはprompt時点のpositionデータから判断するが、スキーマバリデーション後に執行するため。

**How to avoid:** executor内で`SELL quantity <= positions.quantity`チェックを必須化。超過分は`min(requested, available)`でクランプするか、その注文全体をスキップする（D-15のスキップ方針に準拠）。[ASSUMED - D-15はショートのスキップを明示するがSELL超過については明記なし]

---

## Code Examples

### daily-run Route Handler の基本構造

```typescript
// Source: app/api/cron/fetch-market-data/route.ts パターンを転用 (verified 2026-04-12)
import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { env } from '@/lib/env'

export const maxDuration = 120  // D-17

export async function POST(request: NextRequest) {
  const header = request.headers.get('authorization') ?? ''
  if (header !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // 1. 冪等ガード（D-16）: todayIsoでUNIQUEチェック
  // 2. portfolio初期化（D-13）: portfoliosレコードなければ作成
  // 3. 市場データ確保: fetch-market-dataが未取得なら呼び出し（Phase 2 D-20）
  // 4. プロンプト構築: buildPrompt()
  // 5. Gemini呼び出し: callGemini() with retry (D-14)
  // 6. バリデーション: zodスキーマ、ティッカーホワイトリスト
  // 7. 売買執行: executeDecisions()
  // 8. decisions保存: INSERT transcript + usage + cost
  // 9. portfolio_snapshot記録（D-12）
}
```

### Gemini呼び出しとリトライ（D-14）

```typescript
// Source: D-14（CONTEXT.md）
async function callGeminiWithRetry(prompt: string): Promise<GeminiRawResponse> {
  try {
    return await callGemini(prompt)
  } catch (e) {
    await new Promise(resolve => setTimeout(resolve, 30_000))  // 30秒待機
    try {
      return await callGemini(prompt)
    } catch (e2) {
      // 2回目も失敗 → 失敗レコードとして返す
      throw new GeminiRetryExhaustedError((e2 as Error).message)
    }
  }
}
```

### zodバリデーションスキーマ（D-07 + D-15）

```typescript
// Source: D-07（CONTEXT.md）+ zod v3 (verified package.json 2026-04-12)
import { z } from 'zod'
import { findTicker } from '@/config/tickers'

const DecisionItemSchema = z.object({
  ticker:     z.string(),
  action:     z.enum(['BUY', 'SELL', 'HOLD']),
  quantity:   z.number().int().nonnegative(),
  confidence: z.enum(['high', 'medium', 'low']),
  reasoning:  z.string(),
})

const GeminiResponseSchema = z.object({
  market_assessment: z.string(),
  decisions: z.array(DecisionItemSchema),
})

// バリデーション後のフィルタリング（D-15）
function filterValid(decisions: z.infer<typeof DecisionItemSchema>[]) {
  return decisions.filter(d => {
    if (!findTicker(d.ticker)) return false  // ホワイトリスト外はスキップ
    if (d.action === 'SELL' && d.quantity < 0) return false  // ショート排除
    return true
  })
}
```

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@google/generative-ai` | AGENT-01〜07 | ✓ | 0.24.1 | — |
| `zod` | バリデーション | ✓ | 3.25.76 | — |
| `drizzle-orm` | DB操作 | ✓ | 0.45.2 | — |
| `technicalindicators` | AGENT-02 TA指標 | ✗ | — | npm install technicalindicators が必要（3.1.0） |
| GEMINI_API_KEY | AGENT-01 | ✓（lib/env.ts検証済み） | — | — |
| DATABASE_URL | 全DB操作 | ✓（lib/env.ts検証済み） | — | — |
| CRON_SECRET | OPS-02 Route認証 | ✓（lib/env.ts検証済み） | — | — |

**Missing dependencies with no fallback:**
- `technicalindicators` — Wave 0でインストール必須（`npm install technicalindicators`）

**Missing dependencies with fallback:**
- なし

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.4 |
| Config file | `vitest.config.ts`（確認済み） |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AGENT-01 | Gemini呼び出しが構造化JSONを返す | unit (mock) | `npx vitest run tests/agent/gemini-caller.test.ts` | ❌ Wave 0 |
| AGENT-02 | prompt-builderがDB値からプロンプトを組み立てる | unit | `npx vitest run tests/agent/prompt-builder.test.ts` | ❌ Wave 0 |
| AGENT-03 | ニュースが3ヘッドライン+1行要約に圧縮される | unit | `npx vitest run tests/agent/prompt-builder.test.ts` | ❌ Wave 0 |
| AGENT-04 | BUY/SELL/HOLDのみが実行され、SHORT等は除外される | unit | `npx vitest run tests/agent/executor.test.ts` | ❌ Wave 0 |
| AGENT-05 | transcript+usage+costがdecisionsテーブルに保存される | unit (mock DB) | `npx vitest run tests/agent/executor.test.ts` | ❌ Wave 0 |
| AGENT-06 | ニュースが`<external_news_content>`タグで囲まれてプロンプトに含まれる | unit | `npx vitest run tests/agent/prompt-builder.test.ts` | ❌ Wave 0 |
| AGENT-07 | usageMetadataからコスト推定値が正しく計算される | unit | `npx vitest run tests/agent/gemini-caller.test.ts` | ❌ Wave 0 |
| EXEC-01 | portfolioレコードがない場合に1000万円で自動作成される | unit (mock DB) | `npx vitest run tests/agent/executor.test.ts` | ❌ Wave 0 |
| EXEC-02 | Close価格で取引が執行される | unit | `npx vitest run tests/agent/executor.test.ts` | ❌ Wave 0 |
| EXEC-03 | 現金超過の買い注文が拒否される | unit | `npx vitest run tests/agent/executor.test.ts` | ❌ Wave 0 |
| EXEC-04 | tradesテーブルにdecisionId FK付きで永続化される | unit (mock DB) | `npx vitest run tests/agent/executor.test.ts` | ❌ Wave 0 |
| EXEC-05 | BUY後にpositionsのquantity・avgCostが更新される | unit | `npx vitest run tests/agent/executor.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/agent/ --reporter=verbose`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `tests/agent/prompt-builder.test.ts` — AGENT-02, AGENT-03, AGENT-06をカバー
- [ ] `tests/agent/gemini-caller.test.ts` — AGENT-01, AGENT-07（Geminiをviモックで差し替え）
- [ ] `tests/agent/executor.test.ts` — AGENT-04, AGENT-05, EXEC-01〜05（DBをviモックで差し替え）

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | CRON_SECRET Bearerヘッダー認証（既存パターン） |
| V3 Session Management | no | Cron endpointはステートレス |
| V4 Access Control | yes | ティッカーホワイトリスト（findTicker）でホワイトリスト外を排除 |
| V5 Input Validation | yes | zod（Geminiレスポンスバリデーションとactionホワイトリスト） |
| V6 Cryptography | no | APIキーは環境変数管理（lib/env.ts確認済み） |

### Known Threat Patterns for Gemini LLM Pipeline

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| プロンプトインジェクション（ニュース経由） | Tampering | `<external_news_content>` XMLデリミタ + systemプロンプトで「信頼できない外部入力」明示（D-04/AGENT-06） |
| ホワイトリスト外銘柄の実行 | Elevation of Privilege | `findTicker()`バリデーション + zodホワイトリストフィルタ（D-15） |
| SHORT/負量による不正執行 | Tampering | `action === 'SELL' && quantity > position.quantity`ガード（D-15 executor） |
| Cron endpoint への不正アクセス | Spoofing | `Authorization: Bearer ${CRON_SECRET}`ヘッダー必須（既存パターン） |
| APIキー露出 | Information Disclosure | `lib/env.ts` server-only + `import 'server-only'` guard（既存パターン） |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Function Calling（ツール呼び出し） | responseSchema + JSONモード | Gemini 1.5〜2.0世代 | 1回のAPIコールで完結、シンプル |
| gemini-2.0-flash | gemini-2.5-flash | 2026-04-11（新規ユーザー） | 同等の無料枠、より高性能。lib/ai/client.tsに既に反映済み |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | technicalindicatorsへの文字列渡しでNaNが発生する | Architecture Patterns P3 | 数値変換なしで動作する場合、余分な変換コードが残るが害はない |
| A2 | zodの`z.enum()`バリデーション前にactionを大文字変換する必要がある | Common Pitfalls P1 | Geminiが常に大文字で返す場合は変換不要だが、ロバスト性のため推奨 |
| A3 | responseSchemaのenum制約はdescriptionヒントとして機能する | Common Pitfalls P1 | enum制約が完全に機能する場合はzodバリデーションが重複するが、二重防衛として維持 |
| A4 | SELL quantity > position.quantity の場合はスキップ（D-15準拠） | Common Pitfalls P5 | クランプ（min）でも可だが、スキップの方がD-15の方針に近い |
| A5 | USD銘柄のavgCostはJPY建てで保持 | Architecture Patterns P5 | USD建てで保持する場合はFX変換タイミングが異なる。D-10の「trade実行時にFXレート参照」がJPY建て保持を示唆 |

---

## Open Questions

1. **responseSchemaのenum制約の強制力**
   - What we know: SchemaTypeにSTRING型でdescriptionでヒント可能
   - What's unclear: Gemini側でenumを完全強制できるか（型定義上`enum`フィールドがResponseSchemaに存在するか未確認）
   - Recommendation: zodバリデーションを必ず適用して二重防衛する

2. **日本株と米株の市場休場日が異なる日のdaily-run挙動**
   - What we know: Phase 2のorchestrator.tsで市場休場を`market_closed`フラグで記録している
   - What's unclear: 片方の市場が休場の日、GeminiにはHOLDオンリーの指示を出すべきか、または休場銘柄を除いて判断させるか
   - Recommendation: price_snapshotsの`marketClosed=true`行をpromptに「休場中」として含め、GeminiがHOLDを自然に選択するよう誘導する

3. **positions.avgCostの通貨単位**
   - What we know: D-10でtrade実行時にFXレートを参照してJPY変換。positions.currencyカラムがある
   - What's unclear: avgCostはUSD建てで保持（positions.currency='USD'）かJPY建てか
   - Recommendation: schema.tsのpositions.currencyを参照し、通貨ごとのavgCostを保持するのが整合的。ただしportfolio_snapshotsのtotal計算でFX変換が必要

---

## Sources

### Primary (HIGH confidence)
- `node_modules/@google/generative-ai/dist/generative-ai.d.ts` v0.24.1 — responseSchema, UsageMetadata, SchemaType型定義を直接確認
- `db/schema.ts` — DecisionTranscript型、全テーブル定義確認
- `lib/ai/client.ts` — GEMINI_MODEL='gemini-2.5-flash'確認
- `app/api/cron/fetch-market-data/route.ts` — CRON_SECRET認証パターン確認
- `vitest.config.ts` — テストフレームワーク設定確認

### Secondary (MEDIUM confidence)
- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing) — 2026-04-12確認: input $0.30/1M, output $2.50/1M（Gemini 2.5 Flash）
- [technicalindicators GitHub](https://github.com/anandanand84/technicalindicators) — RSI/MACD/SMA APIパターン確認

### Tertiary (LOW confidence)
- npm registry: technicalindicators v3.1.0（WebSearch経由）

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — インストール済みパッケージのソース直接確認
- Gemini API: HIGH — 型定義ファイル直接確認 + 公式料金ページ確認
- Architecture: HIGH — 既存コードパターン（cron route, schema, client）から明確に導出
- technicalindicators API: MEDIUM — GitHub README確認（直接npmページアクセス不可）
- Pitfalls: MEDIUM — 一部ASSUMEDあり（Assumptions Log参照）

**Research date:** 2026-04-12
**Valid until:** 2026-05-12（technicalindicators API安定、Gemini料金は変動可能性あり）
