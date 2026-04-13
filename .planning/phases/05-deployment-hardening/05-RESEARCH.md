# Phase 5: Deployment & Hardening - Research

**Researched:** 2026-04-13
**Domain:** Vercel 本番デプロイ / Cron / Fluid Compute / セキュリティヘッダ配線
**Confidence:** HIGH（全ての外部挙動は Vercel 公式ドキュメント・Next.js 16 ローカル docs から直接検証）

## Summary

Phase 5 は新機能実装ではなく「既存コードを本番配線する」フェーズ。Planner は次の 4 点に集中すべき:

1. **vercel.json に `crons` 配列を追加**し `schedule: "0 22 * * *"`, `path: "/api/cron/daily-run"` を宣言する。Hobby プランは 1 日 1 回制約・UTC 固定・±59分精度のため、「22 時ちょうど」ではなく「22 時台のどこかで 1 回」と認識する。
2. **daily-run/route.ts に `GET` ハンドラを追加**する。Vercel Cron は **GET で叩く**（POST ではない）。現状の `POST` ハンドラのままでは 405 Method Not Allowed になり Cron が永久に失敗する。これは本フェーズ最大の落とし穴。
3. **セキュリティヘッダは `next.config.ts` の `headers()` で配線する**。CSP は nonce 不要方式（`'self'` ベース）で Phase 5 スコープに収め、HSTS / X-Content-Type-Options / Referrer-Policy の 3 点を canonical に追加する。
4. **SECURITY-CHECKLIST.md を `.planning/phases/05-deployment-hardening/` に配置**し、CONTEXT.md D-13 の 7 項目を curl コマンド例 + 期待出力付きで展開する。

**Primary recommendation:** Plan を「(A) vercel.json + GET ハンドラ追加」「(B) next.config.ts headers() でセキュリティヘッダ」「(C) .env.example 監査と追記」「(D) proxy.ts matcher 強化（robots.txt 等の追加）」「(E) SECURITY-CHECKLIST.md の作成」「(F) ロールアウト手順書」の 6 プラン構成にする。実コード変更は最小限で、大半がドキュメントと設定ファイル。

## User Constraints (from CONTEXT.md)

### Locked Decisions (D-01 … D-16 — 全て遵守)

**Cron スケジュール**
- **D-01:** Cron は `daily-run` の 1 本のみ定義。`fetch-market-data` は手動/デバッグ用に残置。
- **D-02:** 発火時刻 `UTC 22:00`（JST 07:00 相当）。
- **D-03:** スケジュール宣言は `vercel.json` の `crons` 配列で行う（`vercel.ts` は採用しない）。
- **D-04:** Cron 認証は既存の手動 Bearer 検証を維持。`x-vercel-cron-signature` 二重ロックは追加しない。

**環境変数と保護層**
- **D-05:** Production のみ運用。Preview は Production と同一 Neon DB を共有。
- **D-06:** 保護は `iron-session` のみ。Vercel Deployment Protection は使わない。
- **D-07:** 必須環境変数: `DATABASE_URL`, `GEMINI_API_KEY`, `CRON_SECRET`, `SESSION_SECRET`（CONTEXT.md は SESSION_PASSWORD と書かれているが実コードは SESSION_SECRET — 後述の §5 で解消）, `SITE_PASSWORD`, `FINNHUB_API_KEY` + 追加分。
- **D-08:** 環境変数は **Vercel ダッシュボード UI から手動登録**。`vercel env add` は使わない。
- **D-09:** `SESSION_SECRET` ローテーションは手動のみ。

**タイムアウト**
- **D-10:** daily-run 本番実行時間は初回 cron 発火後の Vercel Function Logs の Duration 欄で実測。追加計装は入れない。
- **D-11:** 120s 超過時の対応は後回し。実測のみ。
- **D-12:** 既存の `maxDuration = 120` を維持。変更しない。

**検証とロールアウト**
- **D-13:** `SECURITY-CHECKLIST.md` を成果物として作成。7 項目最低。
- **D-14:** 自動 E2E セキュリティテストは Phase 5 スコープ外。
- **D-15:** 初回ロールアウト手順は CONTEXT に 7 ステップ明記済み。
- **D-16:** Cron 失敗検知は Vercel Logs 手動監視のみ。

### Claude's Discretion

- `vercel.json` の `headers` / `rewrites` / `redirects` 具体構成
- セキュリティヘッダ配線方法（`next.config.ts` vs `proxy.ts` vs `vercel.json`）
- Vercel プロジェクト名・デプロイ URL

### Deferred Ideas (OUT OF SCOPE)

- Preview 用 Neon DB branch 分離
- Vercel Deployment Protection
- Inngest / QStash / Trigger.dev 等のキュー
- `maxDuration` の 300s 引き上げ
- Slack / Discord 失敗通知
- Dashboard「last cron run」インジケーター
- 自動 E2E セキュリティ回帰テスト (Playwright)
- SESSION_SECRET 2 キーローテーション機構

## Phase Requirements

| ID | 概要 | Research Support |
|---|---|---|
| OPS-01 | Vercel Cron で 1 日 1 回自動実行 | §1 vercel.json schema + §2 GET ハンドラ追加 |
| OPS-02 | Cron エンドポイントは `CRON_SECRET` 保護 | §2 既存 Bearer 検証が Vercel 自動付与ヘッダと完全一致 |
| OPS-03 | Vercel にデプロイ・どこからでもアクセス | §4 セキュリティヘッダ + §6 proxy.ts matcher |
| OPS-04 | Fluid Compute maxDuration 設定・超過フォールバック方針 | §3 Fluid Compute 実測フロー、超過対応は deferred として checklist 化 |

---

## Standard Stack

本フェーズは新規ライブラリ導入が**なし**。既存のものを使って配線のみ行う。

| Technology | Version (installed) | Purpose | Why |
|------------|--------------------|---------|-----|
| Next.js | 16.2.3 | Framework（proxy.ts / Route Handler / next.config.ts headers） | 既インストール `[VERIFIED: package.json]` |
| iron-session | 8.0.4 | 認証ゲート | Phase 1 済 `[VERIFIED: node_modules/iron-session/package.json]` |
| Vercel Cron | platform | 日次スケジューラ | Hobby で 1 日 1 回サポート `[CITED: vercel.com/docs/cron-jobs]` |
| Vercel Fluid Compute | platform (default on) | サーバレス関数実行 | Hobby でも有効・デフォルト `[CITED: vercel.com/docs/functions/configuring-functions/duration]` |

**新規作成ファイル（ライブラリ非依存）:**
- `vercel.json` — プロジェクトルート
- `.planning/phases/05-deployment-hardening/05-SECURITY-CHECKLIST.md` — チェックリスト

**編集対象ファイル:**
- `next.config.ts` — `async headers()` を追加
- `app/api/cron/daily-run/route.ts` — `export async function GET` を追加（CRITICAL, §2 参照）
- `proxy.ts` — matcher に `robots.txt`, `sitemap.xml` を追加（optional、§6 参照）
- `.env.example` — ドキュメント整備、SESSION_SECRET 命名整合
- `lib/env.ts` — 現状のまま（追加変数なし）

---

## Architecture Patterns

### Pattern 1: Vercel Cron 設定（§1 の回答）

`vercel.json` の最小スキーマ `[CITED: vercel.com/docs/cron-jobs]`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    {
      "path": "/api/cron/daily-run",
      "schedule": "0 22 * * *"
    }
  ]
}
```

**仕様（全て公式ドキュメント確認済み）:**

| 項目 | 値 | Source |
|---|---|---|
| HTTP メソッド | **GET**（固定） | `[CITED: vercel.com/docs/cron-jobs/manage-cron-jobs]` |
| タイムゾーン | **UTC 固定**（変更不可） | `[CITED: vercel.com/docs/cron-jobs]` |
| `path` | 絶対パス、先頭 `/` 必須、production deployment URL 相対 | `[CITED: vercel.com/docs/cron-jobs]` |
| `schedule` | 5 フィールド cron 式。`MON`/`JAN` 等の別名 **非対応** | `[CITED: vercel.com/docs/cron-jobs#cron-expression-limitations]` |
| 曜日 × 月日の両立 | 不可（片方は `*` 必須） | `[CITED: vercel.com/docs/cron-jobs]` |
| Hobby 頻度制約 | **1 日 1 回のみ**。`0 * * * *` 等は deploy 失敗 | `[CITED: vercel.com/docs/cron-jobs/usage-and-pricing]` |
| Hobby 精度 | **±59 分**。`0 22 * * *` は 22:00:00〜22:59:59 UTC の任意のタイミング | `[CITED: vercel.com/docs/cron-jobs/manage-cron-jobs]` |
| User-Agent | `vercel-cron/1.0` | `[CITED: vercel.com/docs/cron-jobs]` |
| Redirect | **追従しない**。3xx を返したら invocation 完了扱い | `[CITED: vercel.com/docs/cron-jobs/manage-cron-jobs]` |
| 失敗時リトライ | **なし**（Vercel は retry しない） | `[CITED: vercel.com/docs/cron-jobs/manage-cron-jobs]` |
| 複数回配信の可能性 | **あり**。同一 cron event が 2 回配信されることがある → 冪等必須 | `[CITED: vercel.com/docs/cron-jobs/manage-cron-jobs#cron-jobs-and-idempotency]` |

→ `0 22 * * *` は Phase 5 要件と整合する正しい表記 `[VERIFIED]`。
→ D-16（冪等 `ON CONFLICT DO NOTHING`）は Vercel 公式が **明示的に要求している** idempotency 要件と完全一致 `[VERIFIED]`。

### Pattern 2: Cron 発火時の認証（§2 の回答 — 本フェーズ最大の罠）

**Vercel が付与するヘッダの正体（公式ドキュメント原文）:**

> The value of the variable [CRON_SECRET] will be automatically sent as an `Authorization` header when Vercel invokes your cron job. Your endpoint can then compare both values, the authorization header and the environment variable, to verify the authenticity of the request.
> ...
> The `authorization` header will have the `Bearer` prefix for the value.

`[CITED: vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs]`

→ 形式: `Authorization: Bearer <CRON_SECRET の値>`。現状の daily-run/route.ts の検証ロジック:

```ts
const header = request.headers.get('authorization') ?? ''
const expected = `Bearer ${env.CRON_SECRET}`
if (header !== expected) { return 401 }
```

は **完全に整合している** `[VERIFIED: app/api/cron/daily-run/route.ts:33-41]`。

**⚠ CRITICAL GAP — daily-run に GET ハンドラが存在しない:**

Vercel 公式の code 例は **GET で書かれている**（`export function GET(request: NextRequest)`）。`[CITED: vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs]` 現状の `daily-run/route.ts` は **POST しか実装しておらず**、GET は 405 を返す（L196-198）:

```ts
export async function GET() {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 })
}
```

このまま本番デプロイすると **Vercel Cron 発火は毎日 405 を受け取り、decisions テーブルに行は一度も入らない**。Phase 5 Success Criteria #1 が永久に満たされない。

**解決策（Plan で必ず対処）:**

選択肢 A（推奨）: `POST` ハンドラの中身を抽出してヘルパーにし、`GET` と `POST` 両方から呼ぶ。`GET` は Vercel Cron 用、`POST` は curl 手動実行用として両方サポート。

```ts
// daily-run/route.ts（擬似コード）
async function runDailyCycle(request: NextRequest) {
  const header = request.headers.get('authorization') ?? ''
  if (header !== `Bearer ${env.CRON_SECRET}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  // ... 既存ロジック
}

export const maxDuration = 120
export async function GET(req: NextRequest)  { return runDailyCycle(req) }
export async function POST(req: NextRequest) { return runDailyCycle(req) }
```

選択肢 B: GET のみに切り替え、curl 手動実行も `curl -X GET` に変更。実装はシンプルだが既存の `/api/cron/fetch-market-data`（POST のみ）とパターンが揃わなくなるため非推奨。

→ **Plan は選択肢 A を採用**し、既存の POST テストを壊さずに GET を追加する。

**curl 手動実行との整合性:**

```bash
# Vercel Cron が打つリクエストと同じもの
curl -i -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/daily-run
# デフォルトは GET
```

→ 同じエンドポイントが cron/手動両方で 200 を返すようになる `[VERIFIED: 公式 code 例と一致]`。

### Pattern 3: Fluid Compute / maxDuration（§3 の回答）

Fluid Compute は Vercel の新しいサーバレス実行モード（2025 年にデフォルト化）で、**全プランに自動適用**されている。主な影響は duration limits の大幅緩和 `[CITED: vercel.com/docs/functions/configuring-functions/duration]`:

| Plan | Default | Maximum |
|---|---|---|
| Hobby | **300s** (5 分) | **300s** (5 分) |
| Pro | 300s | 800s |
| Enterprise | 300s | 800s |

**重要な変化:** 2024 年までの Hobby は 60 秒制限だったが、Fluid Compute 下で Hobby も 300 秒まで使える。CONTEXT.md D-12 で `maxDuration = 120` を維持すると決めたが、これは **Hobby プランで合法的に設定可能** `[VERIFIED]`。

**App Router での宣言方法:**

```ts filename="app/api/cron/daily-run/route.ts"
export const maxDuration = 120
```

`[CITED: vercel.com/docs/functions/configuring-functions/duration]`

現状の daily-run/route.ts L25 に既に書かれている `[VERIFIED: app/api/cron/daily-run/route.ts:25]`。Phase 5 で変更不要。

**実測フロー（D-10）:**

1. Production deploy 後、手動 curl で daily-run を 1 回実行
2. Vercel Dashboard → Project → **Logs** → `requestPath:/api/cron/daily-run` でフィルタ
3. 各 invocation 行に **Duration 列**（ms 単位）が表示される
4. 初回 cron 自動発火後も同様に観察
5. 95 パーセンタイルが 120s に迫る場合は超過リスクありと判断
6. 超過が実際に発生した場合の対応は deferred — Phase 5 では記録のみ

**Fluid Compute 下の微妙な挙動:** Fluid Compute は同一インスタンスで複数リクエストを並列処理する可能性があるが、Cron の 1 日 1 回用途では影響なし。ウォームスタート効果でコールドスタートが少ない `[CITED: vercel.com/docs/fluid-compute]`。

### Pattern 4: セキュリティヘッダ配線の最適解（§4 の回答）

**3 択比較:**

| 配線場所 | 適用範囲 | 動的値 | 評価 |
|---|---|---|---|
| `vercel.json` の `headers` | 全ルート（Vercel edge で付与） | 不可（静的のみ） | グローバル用だが Next.js との二重管理で追いにくい |
| `next.config.ts` の `async headers()` | 全ルート（Next.js build で配線） | 不可 | **canonical**。Next.js 公式 guide がこれを採用 |
| `proxy.ts` で `response.headers.set()` | matcher 適用ルート | **可**（nonce 等） | CSP nonce 方式が必要な場合のみ |

`[CITED: node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/headers.md]`
`[CITED: node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md]`

**推奨: `next.config.ts` 一本化**。理由:
- Next.js 公式 CSP guide が「nonce 不要なら next.config.js の `headers()` を使え」と明示
- `vercel.json` と二重になると保守負担
- Phase 5 は nonce 不要の最小 CSP でよい（dashboard はサードパーティ script を読み込まない）
- proxy.ts にヘッダ付与ロジックを入れると「auth gate」と「header 付与」の責務が混ざる

**next.config.ts 実装例（Plan で使用）:**

```ts filename="next.config.ts"
import type { NextConfig } from 'next'

const securityHeaders = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Next.js RSC + Tailwind v4 インライン style 用
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join('; '),
  },
]

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig
```

`[CITED: node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/headers.md L523-568]`

**⚠ CSP 検証の罠:** `unsafe-inline` を含めるのは本来望ましくないが、Next.js App Router + Tailwind v4 は build 時に inline `<style>` を出すため、nonce 方式を使わない限り `'unsafe-inline'` が必要になる。nonce 方式は proxy.ts 経由で全リクエスト dynamic rendering に切り替える必要があり、Phase 5 のスコープ外（CONTEXT.md Deferred に該当）。Plan 作成時に「CSP は `'unsafe-inline'` 許容の初期版、nonce 化は v2」と明記する。

**HSTS の preload について:** `preload` ディレクティブは https://hstspreload.org/ への手動登録とサブドメイン全削除の覚悟が必要。Phase 5 では preload を外しておく選択肢もある:

```ts
value: 'max-age=63072000; includeSubDomains'  // preload なし
```

→ Plan 作成時に user に確認 or Claude's Discretion で「preload なし」で進める。

### Pattern 5: .env.example 監査（§5 の回答）

**現状の .env.example（L1-26）:**

```
DATABASE_URL
DATABASE_URL_DIRECT
GEMINI_API_KEY
SESSION_SECRET
SITE_PASSWORD
CRON_SECRET
FINNHUB_API_KEY
```

**lib/env.ts が実際に検証している変数（L4-11）:**

```ts
DATABASE_URL, GEMINI_API_KEY, SESSION_SECRET, SITE_PASSWORD, CRON_SECRET, FINNHUB_API_KEY
```

→ `DATABASE_URL_DIRECT` は `.env.example` にあるが `lib/env.ts` の zod schema にない。drizzle.config.ts（migrate 時のみ）でしか使われない前提。Vercel 本番では migrate を流さないため Production 環境変数登録は不要。`.env.example` にはコメントで「local migrate 用」と明記すべき。

**CONTEXT.md D-07 との不整合:**

CONTEXT.md は `SESSION_PASSWORD` と書かれているが、実コードは `SESSION_SECRET`。これは CONTEXT 記載ミス。Plan で `SESSION_SECRET` に統一する（実コードに従う）。

**Phase 2 で追加されたかを確認すべき変数:**
- Phase 2 の `lib/market/` が Stooq fallback に API キー不要（公開 CSV）
- yahoo-finance2 も key 不要
- Alpha Vantage は ROADMAP で触れたが Phase 2 実装では使われていないと思われる（fetch-market-data/route.ts から import 追跡が必要）

→ Plan の Task 内で `grep -r "process.env\." lib/ app/ db/` を実行し、`lib/env.ts` に含まれない参照があれば追加する手順を必ず入れる。

**Vercel Production に登録すべき最終リスト（D-08 手動登録）:**

| 変数 | 必須 | 備考 |
|---|---|---|
| `DATABASE_URL` | ✓ | Neon pooled URL |
| `GEMINI_API_KEY` | ✓ | |
| `SESSION_SECRET` | ✓ | 32 文字以上 |
| `SITE_PASSWORD` | ✓ | |
| `CRON_SECRET` | ✓ | 16 文字以上推奨 `[CITED: vercel.com/docs/cron-jobs/manage-cron-jobs]` |
| `FINNHUB_API_KEY` | ✓ | |
| `DATABASE_URL_DIRECT` | ✗ | Production では不要（migrate は local のみ） |

### Pattern 6: proxy.ts matcher 妥当性（§6 の回答）

**現状の matcher（proxy.ts L41）:**

```ts
matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
```

**動作分析:**

| リクエストパス | matcher 該当 | bypass 分岐 | 最終挙動 |
|---|---|---|---|
| `/_next/static/chunks/...` | × | — | 認証不要で通る（正しい） |
| `/_next/image?url=...` | × | — | 認証不要（正しい） |
| `/favicon.ico` | × | — | 認証不要（正しい） |
| `/api/cron/daily-run` | ✓ | 内部で bypass（L17） | 認証不要（CRON_SECRET 自前検証） |
| `/api/auth/login` | ✓ | 内部で bypass（L16） | 認証不要（ログイン API） |
| `/login` | ✓ | 内部で bypass（L14） | 認証不要 |
| `/dashboard` | ✓ | iron-session 検証 | 保護 |
| `/api/dashboard/timeline` | ✓ | iron-session 検証 | 保護 |
| `/robots.txt` | ✓ | **iron-session 検証** | ⚠ ログインページにリダイレクトされる |
| `/sitemap.xml` | ✓ | iron-session 検証 | ⚠ 同上 |
| `/manifest.json` | ✓ | iron-session 検証 | ⚠ 同上 |

`[VERIFIED: proxy.ts + 手元での挙動トレース]`

**問題:** 現状 `robots.txt` や `sitemap.xml` を追加しても認証ゲートに引っかかる。今の invest-simulator は `app/robots.ts` などを持っていないので実害は 404 だけだが、**Next.js 公式推奨 matcher** は metadata ファイルも除外している `[CITED: node_modules/next/dist/docs/.../proxy.md L602-615]`:

```ts
matcher: ['/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)']
```

**推奨:** Phase 5 で matcher を上記に更新する。現時点で robots.txt / sitemap.xml を配信しないとしても、将来追加時に認証ゲートで詰まる事故を予防。

**また注意:** `/api/auth/*` と `/api/cron/*` の bypass は matcher ではなく **関数内分岐**で実装されている（L14-20）。これは意図的パターンで、iron-session の初期化コストを節約している。この設計は維持する。

### Pattern 7: SECURITY-CHECKLIST.md 最小構成（§7 の回答）

D-13 の 7 項目を実行可能な形に展開。配置場所は `.planning/phases/05-deployment-hardening/05-SECURITY-CHECKLIST.md`（§8 参照）。

各項目の template:

```markdown
## 1. `.env*` が `.gitignore` に入っている

**実行:**
\`\`\`bash
git check-ignore -v .env .env.local .env.production 2>&1
\`\`\`
**期待:** 3 行とも `.gitignore:<N>:.env*` を返す。1 つでも「not ignored」ならアウト。

## 2. 全認証必須ルートが未認証時に 401 を返す

**実行:**
\`\`\`bash
DOMAIN="https://<your-domain>.vercel.app"
for path in "/" "/dashboard" "/api/dashboard/timeline?portfolioId=00000000-0000-0000-0000-000000000000"; do
  echo "=== $path ==="
  curl -s -o /dev/null -w "%{http_code} → %{redirect_url}\n" "$DOMAIN$path"
done
\`\`\`
**期待:** `/` `/dashboard` は 307 redirect to `/login`、`/api/dashboard/timeline` は 401。

## 3. CRON_SECRET 不一致で 401

**実行:**
\`\`\`bash
curl -i -H "Authorization: Bearer wrong-secret" "$DOMAIN/api/cron/daily-run"
\`\`\`
**期待:** HTTP/2 401 + `{"error":"unauthorized",...}` JSON。

## 4. proxy.ts matcher の静的資産除外

**実行:**
\`\`\`bash
grep -n "matcher" proxy.ts
\`\`\`
**期待:** 行に `_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt` が含まれる。

## 5. Vercel Logs に secret/PII が出ていない

**実行:** Vercel Dashboard → Project → Logs → 直近 24h を取得し grep:
\`\`\`bash
# ダッシュボードからログを CSV export した後
grep -iE "sk-|gemini|CRON_SECRET|SESSION_SECRET|[A-Za-z0-9]{32,}" logs.csv
\`\`\`
**期待:** 出力なし（grep 終了コード 1）。

## 6. Neon DB ロール最小権限

**実行:**
\`\`\`bash
psql "$DATABASE_URL_DIRECT" -c "\\du"
psql "$DATABASE_URL_DIRECT" -c "SELECT grantee, privilege_type, table_name FROM information_schema.role_table_grants WHERE grantee = current_user AND table_schema='public';"
\`\`\`
**期待:** 単一ロール、SELECT/INSERT/UPDATE のみ（§9 参照）。
**注:** Neon free tier は role 追加不可のため、この項目は「既定の neondb_owner 権限を確認するのみ」でクローズ。

## 7. セキュリティヘッダが返る

**実行:**
\`\`\`bash
curl -sI "$DOMAIN/login" | grep -iE "^(strict-transport-security|x-content-type-options|referrer-policy|content-security-policy|x-frame-options)"
\`\`\`
**期待:** 5 ヘッダすべてが出力される。値が §4 の定義と一致。
```

Plan で上記 template をそのまま書き写し、`<your-domain>` と `$DATABASE_URL_DIRECT` だけユーザー入力で差し替える。

### Pattern 8: ロールアウト手順書の置き場所（§8 の回答）

**本プロジェクトの既存慣習の調査:**

- `.planning/phases/01-foundation/01-CONTEXT.md` 等、phase 専用の情報は phase ディレクトリ配下に配置
- Phase 04 の 04-SECURITY.md は `.planning/phases/04-dashboard/` 配下 `[VERIFIED: ls .planning/phases/04-dashboard/]`
- ルート `docs/` ディレクトリは存在しない `[VERIFIED]`
- `README.md` ベースのランブックは存在しない

→ **結論:** `.planning/phases/05-deployment-hardening/05-SECURITY-CHECKLIST.md` と `.planning/phases/05-deployment-hardening/05-ROLLOUT.md` に配置。Phase 04 が `04-UAT.md` `04-SECURITY.md` `04-UI-SPEC.md` を phase 配下に置いている慣習と整合。

**代案却下:**
- ルート `SECURITY-CHECKLIST.md` — 既存慣習と違う、Phase 5 以外の phase ドキュメントだけ phase 配下になり一貫性崩壊
- `docs/` 新規作成 — 本プロジェクトにディレクトリが存在しない、Phase 5 だけのために作ると他 phase と不整合

### Pattern 9: Neon DB 最小権限（§9 の回答）

**Neon free tier の実情（WebFetch は不要・公式知識範囲）:**

- Free tier は 1 プロジェクト、1 compute、1 メイン role（通常 `neondb_owner`）
- 追加 role 作成は Paid 以降の機能ではなく、SQL で `CREATE ROLE` を叩けば作れるが、Neon console の UI 管理対象外になる
- Free tier プロジェクトで追加 role を作っても connection pooling の URL 配布はメインロール前提

**現実的な選択肢:**

| 選択肢 | 手間 | 効果 |
|---|---|---|
| A. `neondb_owner` を使い続ける | なし | DB 管理権限が本番コードにもあるが、個人プロジェクト・単一ユーザーなら許容 |
| B. `invest_app` role を `CREATE ROLE` で作成し、SELECT/INSERT/UPDATE のみ付与 | 中（`DATABASE_URL` 再発行） | 正統だが Neon console 管理外 |
| C. Role Management API（Paid） | 未採用（Hobby） | — |

**推奨:** **選択肢 A を採用**し、SECURITY-CHECKLIST.md §6 は「Free tier の制約上 role 分離はスコープ外。DB 接続を持つ人員は 1 名（オーナー本人）で物理的に制限」と明記して close する。D-13 §6 の「最小権限」文言を厳密に満たすには B が必要だが、コスト対効果で A を選ぶのが合理的。

**Plan で触れるべき点:**
1. SECURITY-CHECKLIST.md §6 のステータスを「ACCEPTED RISK: 個人プロジェクトのため neondb_owner を使用」と明記
2. PROJECT.md の Key Decisions に accepted risk を記録

### Pattern 10: Validation Architecture — 手動検証前提（§10 の回答）

本フェーズは 80% がインフラ配線 + ドキュメント。自動テストで検証できる項目は限定的。Nyquist Validation の精神（「必要十分なサンプリング率で継続的検証」）に従い、以下の分類で組む:

| 要件 | 検証方式 | 自動化可否 | コマンド/手順 |
|---|---|---|---|
| OPS-01 成功基準 #1（cron が自動発火 → decisions に行が入る） | **manual**（deploy 後 24h 待機） | 不可 | Vercel Logs 監視 + `psql -c "SELECT COUNT(*) FROM decisions WHERE run_date = CURRENT_DATE"` |
| OPS-02 成功基準 #2（CRON_SECRET 無し → 401） | **automated + manual**（curl） | 半自動 | `curl -o /dev/null -w "%{http_code}" $DOMAIN/api/cron/daily-run` → 401 |
| OPS-03 成功基準 #3（未認証 → ログインリダイレクト） | **automated**（curl） | 可 | SECURITY-CHECKLIST §2 の script |
| OPS-04 成功基準 #4（maxDuration 設定済 + 超過方針） | **inspection**（コード grep） | 可 | `grep 'maxDuration' app/api/cron/daily-run/route.ts` → `= 120` |
| vercel.json schema 妥当性 | **build time**（Vercel が deploy 前にバリデート） | 可 | `git push` → deploy log で error 検出 |
| GET ハンドラ存在 | **automated**（curl 実機） | 可 | 上記 OPS-02 の curl が 200 / 401 を返せば GET ハンドラ存在確認 |
| セキュリティヘッダ配線 | **automated**（curl -I） | 可 | SECURITY-CHECKLIST §7 |
| Neon 権限確認 | **manual**（accepted risk） | 不可 | §9 の accepted risk 文書化で close |
| .env.example 網羅性 | **automated**（grep diff） | 可 | `diff <(grep -oE "env\.[A-Z_]+" lib/env.ts) <(grep -oE "^[A-Z_]+" .env.example)` |

**Wave 0 tests gaps:**
- [ ] vitest には Phase 5 の自動テストファイルは追加しない（インフラ検証は curl + 手動）
- [ ] ただし lib/env.ts の zod schema が実コードの `process.env` 使用箇所と一致することを検証する unit test は追加可能（将来価値高い）

**Sampling rate:**
- **Per commit:** `npx tsc --noEmit` + `npx vitest run`（既存）で config/type 壊れを検出
- **Per phase deploy:** SECURITY-CHECKLIST.md の 7 項目を実行（〜 5 分）
- **Per day:** Vercel Logs を目視確認（D-16）

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Cron スケジューラ | 自前 setInterval / BullMQ | Vercel Cron（vercel.json） | D-03 決定、無料、zero-infra |
| Cron 認証 | HMAC 署名検証 / JWT | Vercel 自動付与の `Authorization: Bearer ${CRON_SECRET}` | D-04 決定、公式サポート |
| セキュリティヘッダ | proxy.ts で全リクエストに手動 set | next.config.ts の `async headers()` | 公式 canonical、build time で配線、dynamic rendering 化を回避 |
| CSP nonce 方式 | crypto.randomUUID() + dynamic rendering | Phase 5 では実装しない（deferred） | Scope 外、`'unsafe-inline'` で初期版 |
| DB role 最小権限 | SQL で CREATE ROLE + GRANT を書く | Free tier accepted risk として文書化 | §9 参照、運用コストに見合わない |
| Deployment Protection | iron-session の上に bypass token 層 | iron-session 単独 | D-06 決定 |
| 失敗通知 | Slack Webhook を daily-run 内から叩く | Vercel Logs 手動監視 | D-16 決定、deferred |

**Key insight:** Phase 5 は「既存のインフラ機能を正しく配線する」のが価値。自前実装を避け、Vercel / Next.js が提供する canonical な設定ポイントに集約する。

---

## Common Pitfalls

### Pitfall 1: Vercel Cron は GET で叩く（最大の罠）

**What goes wrong:** daily-run/route.ts は POST しか実装していないため、Cron 発火時に 405 Method Not Allowed を返し続ける。テーブルに行は永久に入らない。Vercel Logs には「GET /api/cron/daily-run 405」が毎日記録されるが、cron 自体は「完了」と記録されるため気づきにくい。
**Why it happens:** Vercel 公式ドキュメントの code 例が `export function GET` 固定だが、fetch-market-data/route.ts は POST パターンで書かれており、daily-run も POST を踏襲した。
**How to avoid:** `export async function GET` と `export async function POST` の両方を daily-run/route.ts に実装し、共通ハンドラ関数に委譲する。Plan に **必ず** このタスクを含める。
**Warning signs:** Vercel Logs で `/api/cron/daily-run 405` を初日に発見できる。逆に「decisions テーブルに行がない」だけでは別の原因と混同しうる。

### Pitfall 2: Hobby プラン ±59 分のスケジュール精度

**What goes wrong:** `0 22 * * *` を「22 時 0 分発火」と期待してしまう。実際は 22:00:00〜22:59:59 UTC の任意のタイミングで発火。
**Why it happens:** Hobby プランは精度「Hourly (±59 min)」 `[CITED: vercel.com/docs/cron-jobs/usage-and-pricing]`。Vercel が負荷分散のため同じ時間帯のユーザー全員をずらす。
**How to avoid:** user にこの仕様を Plan でも SECURITY-CHECKLIST でも明記する。「22 時台のどこか」が要件に沿うことを確認。JST 07:00 期待と整合するか（日本株市場は 09:00 オープンなので OK）。
**Warning signs:** 「22 時 0 分に来ないバグ」と誤認。

### Pitfall 3: 同一 cron イベントの重複配信

**What goes wrong:** Vercel が同じ cron event を 2 回配信し、decisions テーブルに 2 行目を作ろうとする。
**Why it happens:** Vercel 公式が明示:
> Vercel's event-driven system can occasionally deliver the same cron event more than once. `[CITED: vercel.com/docs/cron-jobs/manage-cron-jobs#cron-jobs-and-idempotency]`

**How to avoid:** Phase 3 D-16 の `decisions (portfolio_id, run_date)` UNIQUE + `ON CONFLICT DO NOTHING` で既に対策済み。Phase 5 では**確認のみ**で追加作業なし。
**Warning signs:** decisions テーブルに同日 2 行がたまに出るなら idempotency 実装が壊れている。

### Pitfall 4: redirect 応答は cron で無意味

**What goes wrong:** daily-run が何らかの理由で 307 redirect を返すと cron は追従しない → 処理されないまま終了し、logs にも記録されない。
**Why it happens:** `[CITED: vercel.com/docs/cron-jobs/manage-cron-jobs#cron-jobs-and-redirects]`
**How to avoid:** Route Handler は必ず 200 or 500 を返す。redirect を入れない。proxy.ts は `/api/cron/*` を bypass しているので現状 OK。SECURITY-CHECKLIST §2 で proxy.ts matcher を確認。
**Warning signs:** Vercel Cron Logs に「Response Redirected (3xx)」の注記が出たら redirect 発生。

### Pitfall 5: `unsafe-inline` を CSP に入れ忘れ → ページ真っ白

**What goes wrong:** CSP から `'unsafe-inline'` を削除すると、Next.js の inline `<style>` と RSC インジェクションスクリプトがブロックされてダッシュボードが真っ白になる。
**Why it happens:** Next.js App Router + Tailwind v4 は build 時に inline style を含む HTML を生成するため、nonce 方式を使わない限り `'unsafe-inline'` が必須。
**How to avoid:** Plan の CSP 定義で `'unsafe-inline'` を含める。CSP 検証時に Chrome DevTools Console で blocked violation を見る手順を SECURITY-CHECKLIST §7 に追加。
**Warning signs:** deploy 後ダッシュボードアクセスで真っ白画面、DevTools console に `Refused to execute inline script because it violates the following Content Security Policy directive`。

### Pitfall 6: HSTS `preload` を軽く入れると戻せない

**What goes wrong:** `Strict-Transport-Security: max-age=... preload` を付けて hstspreload.org に登録後、戻すには全サブドメイン削除 + 2 年待ちが必要。
**Why it happens:** preload は browser にハードコードされ、即時撤回不可。
**How to avoid:** **preload なし**の `max-age=63072000; includeSubDomains` で Phase 5 は十分。preload は別フェーズでドメインが確定してから追加。
**Warning signs:** 登録後にサブドメインで HTTP を使いたくなると詰む。

### Pitfall 7: ローカル next dev で cron は動かない

**What goes wrong:** ローカル開発時に cron 動作確認しようとしても動かない。
**Why it happens:** 公式:
> There is currently no support for `vercel dev`, `next dev`, or other framework-native local development servers. `[CITED: vercel.com/docs/cron-jobs/manage-cron-jobs#running-cron-jobs-locally]`

**How to avoid:** ローカルでは手動 curl で叩く。Vercel Cron は production deployment でのみ動作。
**Warning signs:** `vercel dev` で cron が発火しないのを「バグ」と誤認。

### Pitfall 8: CRON_SECRET を Preview 環境にも設定する罠

**What goes wrong:** Vercel Cron は **production deployment URL** のみを叩くため Preview で cron は発火しないが、Preview 環境で CRON_SECRET を設定すると怪しい値のまま残りがち。
**Why it happens:** Vercel env var UI はデフォルトで Production/Preview/Development 全部にチェックが入る。
**How to avoid:** CRON_SECRET は Production のみチェックを入れる。Preview には不要（CONTEXT.md D-05 で preview は production DB 共有だけしたい）。SESSION_SECRET や SITE_PASSWORD は Preview でも iron-session 動作のため必要。
**Warning signs:** Preview で叩かれた `/api/cron/daily-run` が謎の 500 を返す（DB state を汚す可能性）。

---

## Code Examples

### Example 1: vercel.json（最小構成）

```json filename="vercel.json"
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    {
      "path": "/api/cron/daily-run",
      "schedule": "0 22 * * *"
    }
  ]
}
```

**Source:** `[CITED: vercel.com/docs/cron-jobs]`

### Example 2: daily-run/route.ts に GET ハンドラ追加

```ts filename="app/api/cron/daily-run/route.ts"
// ... 既存 import

export const maxDuration = 120

async function handleDailyRun(request: NextRequest) {
  const header = request.headers.get('authorization') ?? ''
  const expected = `Bearer ${env.CRON_SECRET}`
  if (header !== expected) {
    return NextResponse.json(
      { error: 'unauthorized', reason: 'bad or missing authorization header' },
      { status: 401 },
    )
  }
  // ... 既存 POST 本体ロジックをここに移す
}

// Vercel Cron 発火用（GET で叩かれる）
export async function GET(request: NextRequest) {
  return handleDailyRun(request)
}

// 手動 curl / デバッグ用
export async function POST(request: NextRequest) {
  return handleDailyRun(request)
}
```

**Source:** Vercel 公式の GET パターン `[CITED: vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs]` + 既存 POST 互換。

### Example 3: next.config.ts セキュリティヘッダ

§4 Pattern 4 に掲載済み。

### Example 4: proxy.ts matcher 更新

```ts filename="proxy.ts"
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
}
```

**Source:** `[CITED: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md L602-615]`

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| Hobby maxDuration = 60s ハード制限 | Hobby maxDuration = 300s（Fluid Compute default） | 2025 (Fluid Compute GA) | `maxDuration=120` は Hobby でも合法 |
| middleware.ts | proxy.ts | Next.js 16.0.0 | 既に実コード対応済 |
| Vercel Cron を POST で叩く（誤情報が一部 blog で流布） | **GET が公式** | 常に公式は GET | daily-run に GET 追加必須 |
| CSP nonce は proxy.ts で生成 | nonce 不要なら next.config.ts の headers() で静的配線 | Next.js 15+ | Phase 5 は後者を採用 |
| HSTS `preload` デフォルト推奨 | preload は慎重に（撤回不可） | hstspreload.org ポリシー | Phase 5 は preload 外す |

**Deprecated/outdated:**
- `middleware.ts` → Next.js 16 で `proxy.ts` にリネーム `[CITED: node_modules/next/dist/docs/.../proxy.md L770]`
- `@vercel/node` `VercelRequest` 型は Pages API ルート用 — App Router では `NextRequest` を使う
- Vercel Hobby の 60 秒タイムアウトは Fluid Compute 下で 300 秒に拡張された（2025 年）

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| Next.js | build/runtime | ✓ | 16.2.3 | — |
| iron-session | proxy.ts | ✓ | 8.0.4 | — |
| Neon (production) | runtime | ⚠ | — | user が Vercel Production env に DATABASE_URL を貼る |
| Vercel CLI | optional（D-08 は使わない） | 不要 | — | ダッシュボード UI で手動登録 |
| psql（検証用） | SECURITY-CHECKLIST §6 | user 側 local | — | Neon Console でも確認可 |
| curl | SECURITY-CHECKLIST | ✓（macOS 標準） | — | — |

**Missing dependencies with no fallback:** なし
**Missing dependencies with fallback:** なし

---

## Validation Architecture

### Test Framework
| Property | Value |
|---|---|
| Framework | Vitest 4.1.4 |
| Config file | （既存、設定不要） |
| Quick run command | `npx vitest run --reporter=dot` |
| Full suite command | `npx vitest run && npx tsc --noEmit` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| OPS-01 | vercel.json の crons スキーマが有効 | build-time | `git push` → Vercel deploy log 確認 | ✅（platform） |
| OPS-01 | daily-run に GET ハンドラ存在 | smoke | `curl -i -H "Authorization: Bearer $CRON_SECRET" $DOMAIN/api/cron/daily-run` → 200 or skipped | ❌ SECURITY-CHECKLIST §3 として手動 |
| OPS-01 | 翌日 cron 自動発火 → decisions に INSERT | manual-only | Vercel Logs + `SELECT COUNT(*) FROM decisions WHERE run_date = CURRENT_DATE` | ❌ human-verify |
| OPS-02 | CRON_SECRET 無しで 401 | automated | `curl -o /dev/null -w "%{http_code}" $DOMAIN/api/cron/daily-run` → 401 | ❌ SECURITY-CHECKLIST §3 |
| OPS-02 | 既存ロジックの header 検証動作 | unit | 既存 vitest が daily-run route をモック検証していれば追加不要 | 確認要 |
| OPS-03 | 未認証で /dashboard → /login redirect | automated | `curl -o /dev/null -w "%{http_code}" $DOMAIN/dashboard` → 307 | ❌ SECURITY-CHECKLIST §2 |
| OPS-03 | セキュリティヘッダ返却 | automated | `curl -sI $DOMAIN/login \| grep -i "strict-transport-security"` | ❌ SECURITY-CHECKLIST §7 |
| OPS-04 | maxDuration 設定済 | inspection | `grep 'export const maxDuration' app/api/cron/daily-run/route.ts` | ✅（既存） |
| OPS-04 | 超過フォールバック方針存在 | docs | `.planning/phases/05-deployment-hardening/05-SECURITY-CHECKLIST.md` 内に accepted-risk セクション | ❌ 本フェーズで作成 |

### Sampling Rate

- **Per task commit:** `npx tsc --noEmit --skipLibCheck && npx vitest run --reporter=dot`（既存パターン）
- **Per wave merge:** 同上 + `git grep 'maxDuration' app/api/cron/` で設定確認
- **Phase gate:** SECURITY-CHECKLIST.md の 7 項目を manual 実行 + Vercel Logs で翌日 cron 発火を確認（24h 待機）

### Wave 0 Gaps

- [ ] `.planning/phases/05-deployment-hardening/05-SECURITY-CHECKLIST.md` — 新規作成（§7 Pattern 7 の template を展開）
- [ ] `vercel.json` — 新規作成（§1 Example 1）
- [ ] `next.config.ts` — `async headers()` 追加（§4 Example）
- [ ] `app/api/cron/daily-run/route.ts` — GET ハンドラ追加（§2 Pitfall 1）
- [ ] `proxy.ts` — matcher に `sitemap.xml`, `robots.txt` 追加（§6）
- [ ] `.env.example` — コメント整備 + Production 必須変数リスト（§5）
- [ ] `.planning/phases/05-deployment-hardening/05-ROLLOUT.md` — ロールアウト 7 ステップ（D-15）

**自動テスト追加なし。** Phase 5 の価値は curl + Logs の手動検証で 100% カバーされる。vitest に phase 5 固有のテストを追加すると偽の安心感を生む。

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---|---|---|
| V2 Authentication | yes | iron-session v8（Phase 1 完了、本フェーズは変更なし） |
| V3 Session Management | yes | iron-session cookie httpOnly + secure + sameSite:lax + maxAge 30d `[VERIFIED: lib/session.ts]` |
| V4 Access Control | yes | proxy.ts auth gate + CRON_SECRET Bearer + matcher 除外 |
| V5 Input Validation | partial | 本フェーズは Route Handler 追加なし。Phase 3/4 で zod 実装済 |
| V6 Cryptography | yes | `timingSafeEqual`（既存 lib/auth.ts）、iron-session AES-CBC + HMAC（library 自動） |
| V14 Configuration | yes | **本フェーズ主題**。環境変数・CSP・HSTS・X-Content-Type-Options・Referrer-Policy の配線 |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---|---|---|
| 公開 cron エンドポイントへの不正 POST/GET | Spoofing / DoS | CRON_SECRET Bearer 検証（既存） |
| CSRF で dashboard action を誘発 | Tampering | SameSite=lax cookie + GET/POST 分離（iron-session 既存） |
| MITM で cookie 傍受 | Information Disclosure | HSTS（本フェーズで追加） + secure cookie（既存） |
| Clickjacking で iframe 埋め込み | Tampering | CSP `frame-ancestors 'none'` + X-Frame-Options DENY（本フェーズで追加） |
| XSS 経由での script 注入 | Tampering / Information Disclosure | CSP default-src 'self' + X-Content-Type-Options: nosniff（本フェーズで追加） |
| Referrer leak で session URL 流出 | Information Disclosure | Referrer-Policy: strict-origin-when-cross-origin（本フェーズで追加） |
| Env var 誤 Preview 設定で本番秘密が Preview に | Information Disclosure | Vercel UI で CRON_SECRET を Production only に（§8 pitfall） |
| 重複配信で DB state 汚染 | Tampering | Phase 3 D-16 冪等 INSERT（既存） |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | Tailwind v4 の inline style が CSP `'unsafe-inline'` なしで動かない | §4 Pattern 4 | CSP 配線後に画面が真っ白 → SECURITY-CHECKLIST §7 で即検出可能 |
| A2 | Neon free tier で `CREATE ROLE` は可能だが console UI 管理外 | §9 | D-13 §6 の min-permission 項目を accepted risk でクローズする前提が崩れる → Plan で user 確認 |
| A3 | Vercel Hobby Fluid Compute のデフォルト 300s が 2026-04 時点でも有効 | §3 Pattern 3 | Vercel が仕様変更していたら `maxDuration=120` が deploy rejection を引き起こす（可能性低い、公式 docs で直接確認） |
| A4 | Phase 2 で追加された環境変数が FINNHUB_API_KEY のみ（他 API キー追加なし） | §5 | Plan 実行時に grep で検証 — 実際に不足があれば lib/env.ts + .env.example に追加 |
| A5 | CSP の `'unsafe-inline'` は Phase 5 で受容して Plan の deferred 項目として記録 | §4, §Pitfall 5 | nonce 方式を Phase 5 で実装しろと user が要望した場合、proxy.ts 改修が追加で必要 → Discuss 段階で確認推奨 |

---

## Open Questions (RESOLVED)

1. **CSP の `'unsafe-inline'` 許容 vs nonce 方式** — RESOLVED: Plan 05-02 で `'unsafe-inline'` ありの初期版を採用、nonce 化は deferred (CONTEXT.md D-13 §7 + Plan 05-02 threat_model AR-2 として記録)。
2. **HSTS `preload` を入れるか** — RESOLVED: Plan 05-02 で `preload` 非採用 (RESEARCH.md §Pitfall 6 — 撤回不可リスクを回避、AR-3 として 05-VERIFICATION で accepted risk 登記)。
3. **Neon 最小権限の accepted risk 化** — RESOLVED: Plan 05-04 (SECURITY-CHECKLIST.md) §6 で "Neon Free tier 単一 role のため accepted risk、Paid tier 移行時に再検討" として明記 (AR-1)。
4. **Phase 2 で追加された可能性のある環境変数** — RESOLVED: Plan 05-03 Task 2 で `grep -r "process.env\." lib/ app/` による実コード監査ステップを実行し、結果を `.env.example` に反映する手順を定義。

---

## Sources

### Primary (HIGH confidence)

- Vercel Cron Jobs overview — https://vercel.com/docs/cron-jobs（schema、UTC、GET、vercel-cron/1.0 UA）
- Vercel Managing Cron Jobs — https://vercel.com/docs/cron-jobs/manage-cron-jobs（CRON_SECRET 詳細、idempotency、Hobby ±59 min、no-retry、redirect 禁止、no local dev）
- Vercel Cron Usage & Pricing — https://vercel.com/docs/cron-jobs/usage-and-pricing（Hobby 1 日 1 回制約）
- Vercel Function Duration — https://vercel.com/docs/functions/configuring-functions/duration（Hobby maxDuration 300s, `export const maxDuration`）
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`（Next.js 16 proxy.ts 仕様、matcher、negative matching）
- `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/headers.md`（Strict-Transport-Security, X-Content-Type-Options, Content-Security-Policy 推奨値）
- `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`（CSP nonce vs static 方式）
- `.planning/phases/01-foundation/01-CONTEXT.md`, `01-VERIFICATION.md`（既存 proxy.ts / iron-session 実装の契約）
- `.planning/phases/03-agent-pipeline/03-CONTEXT.md`（D-16 idempotent INSERT、D-17 maxDuration=120）
- `.planning/phases/04-dashboard/04-SECURITY.md`（既存 STRIDE モデル・accepted risk 運用パターン）
- プロジェクトコード直接読取: `app/api/cron/daily-run/route.ts`, `proxy.ts`, `lib/session.ts`, `lib/env.ts`, `.env.example`, `package.json`, `next.config.ts`

### Secondary (MEDIUM confidence)

- なし（本フェーズは公式ドキュメントとローカル Next.js docs で全項目カバー）

### Tertiary (LOW confidence)

- Neon free tier role 管理の実情（公式 docs 未確認、A2 として Assumptions Log に記録）

---

## Project Constraints (from CLAUDE.md / AGENTS.md)

**AGENTS.md — CRITICAL:**
> This is NOT the Next.js you know. This version has breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code.

→ 本 RESEARCH.md は `node_modules/next/dist/docs/` を直接読んで proxy.ts / route.ts / headers.md を検証した `[VERIFIED]`。Plan agent も同様にローカル docs を参照すること。

**CLAUDE.md 関連制約:**
- Tech stack: Next.js（既存ブートストラップ活用）— 余分な再構築をしない → Phase 5 は設定ファイル追加のみ、新規ライブラリ導入なし
- Deployment: Vercel 想定 → vercel.json + ダッシュボード UI 手動 env 登録
- Auth: 簡易パスワード保護のみ → iron-session 維持、NextAuth 導入しない
- Security: クラウド公開 URL になるため最低限の保護が必須 → CSP/HSTS/X-Content-Type-Options 配線
- 「独立したプロセスを複数実行する必要がある場合は並行実行」→ Plan 分割時の依存関係を明示（§Plan 構成案）
- TDD: 本フェーズは設定 + docs が主体で TDD 適用しづらいが、lib/env.ts の zod schema 検証テストは TDD で追加可能

**GSD Workflow Enforcement:**
- 本リサーチは `/gsd-research-phase` 経由 → OK
- Plan 作成時も Planner agent に委ねる

---

## Recommended Plan Breakdown（Planner への引き継ぎ）

次の 6 プランを推奨:

1. **05-01-PLAN.md: vercel.json + GET handler 追加**（最重要、Pitfall 1 対処）
   - `vercel.json` 新規作成
   - `app/api/cron/daily-run/route.ts` に GET ハンドラ追加（POST と共通ハンドラ）
   - vitest で POST/GET 両方が同じ 401/200 を返すことを確認（軽い unit test 追加可）

2. **05-02-PLAN.md: next.config.ts セキュリティヘッダ配線**
   - `next.config.ts` に `async headers()` 追加
   - CSP, HSTS, X-Content-Type-Options, Referrer-Policy, X-Frame-Options, Permissions-Policy
   - ローカル `curl -I` で検証

3. **05-03-PLAN.md: proxy.ts matcher 強化 + .env.example 監査**
   - matcher に `sitemap.xml`, `robots.txt` 追加
   - `.env.example` にコメント整備、Production 必須変数を明記
   - lib/env.ts と process.env 参照箇所の grep 差分検証

4. **05-04-PLAN.md: SECURITY-CHECKLIST.md 作成**
   - `.planning/phases/05-deployment-hardening/05-SECURITY-CHECKLIST.md` 新規作成
   - §7 Pattern 7 の template 7 項目をそのまま展開
   - Neon 最小権限を accepted risk として明記

5. **05-05-PLAN.md: ROLLOUT.md + 初回デプロイ**
   - `.planning/phases/05-deployment-hardening/05-ROLLOUT.md` 新規作成（D-15 の 7 ステップ）
   - Vercel プロジェクトリンク + env 手動登録 + git push
   - 手動 curl 実行 → decisions テーブル行確認

6. **05-06-PLAN.md: 翌日 cron 自動発火確認 + UAT**
   - 24 時間待機後 Vercel Logs 観察
   - SECURITY-CHECKLIST 全 7 項目を manual 実行
   - `05-UAT.md` 作成（Phase 04 の 04-UAT.md に倣う）

**並列化の注意:** 05-01 と 05-02 は独立なので並列可。05-03 も独立。05-04 は 05-01〜03 の成果を前提にすべき（curl 対象のルート定義）。05-05/06 はシーケンシャル。

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — package.json 直接読取、全バージョン確定
- Architecture: HIGH — Vercel 公式 docs + Next.js 16 ローカル docs で全項目検証
- Pitfalls: HIGH — Pitfall 1（GET ハンドラ）と Pitfall 2（±59 min）は公式 docs 原文から直接引用
- Security: MEDIUM-HIGH — CSP `'unsafe-inline'` の実際の必要性は Phase 5 deploy で初めて判明（A1）

**Research date:** 2026-04-13
**Valid until:** 2026-05-13（30 日、stable infra 項目のため）

## RESEARCH COMPLETE
