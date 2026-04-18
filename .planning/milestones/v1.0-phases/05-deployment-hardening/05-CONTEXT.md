# Phase 5: Deployment & Hardening - Context

**Gathered:** 2026-04-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Vercel本番環境にデプロイし、Cronが毎日1回自動で日次AIエージェントサイクルを実行し、全エンドポイントがCRON_SECRET/iron-sessionで保護され、セキュリティ検証チェックリストを通過した状態で公開される。

スコープ内:
- `vercel.json` で cron スケジュール宣言
- 本番環境変数の投入（手動）
- セキュリティチェックリストの作成と実行
- 初回デプロイ〜cron自動稼働までのロールアウト手順確立
- Fluid Compute 実測（`maxDuration=120` が妥当か検証）

スコープ外（Phase 5 では扱わない）:
- Inngest/QStash/Trigger.dev などの外部キュー導入（120s 超過が実測された場合のみ将来対応）
- Vercel Deployment Protection 設定（iron-session のみで運用）
- Slack/Discord 通知連携（手動ログ監視で運用）
- 自動 E2E セキュリティテスト（手動検証）
- Neon branch による Preview DB 分離（Production と Preview で同一 DB を共有）

</domain>

<decisions>
## Implementation Decisions

### Cron スケジュール
- **D-01:** Cron は `daily-run` の1本のみ定義する。Hobby プランの「1日1回制約」と整合。既存の `ensureMarketData(today)` が daily-run 内で fetch を走らせるため追加実装不要。`fetch-market-data` エンドポイントは手動トリガ/デバッグ用に残置する。
- **D-02:** 発火時刻は `UTC 22:00`（JST 07:00 相当）。前日US市場クローズ後かつ本日JP市場オープン前の朝タイミングで、US は前日終値・JP は前営業日終値で判断する。朝にログを読む個人運用と合致。
- **D-03:** Cron スケジュールは `vercel.json` の `crons` 配列で宣言する（`vercel.ts` は採用しない）。シンプルでドキュメント豊富。
- **D-04:** Cron 認証は現状の手動 Bearer 検証を維持。Vercel が自動付与する `Authorization: Bearer ${CRON_SECRET}` を既存 route.ts がそのまま検証する。`x-vercel-cron-signature` 二重ロックは追加しない。

### 環境変数と Preview 保護
- **D-05:** Production のみ本番運用。Preview デプロイは同一 Neon DB を共有する。Neon free tier 1 branch 制約の都合で Preview 用 branch は切らない。Preview は手動で意図的に作成しない限り影響はゼロと割り切る。
- **D-06:** Preview URL の保護層は `iron-session` のみ（`SESSION_PASSWORD` を全環境で同値として Vercel Env に投入）。Vercel Deployment Protection は有効化しない。個人プロジェクトのため iron-session の Cookie 保護で十分。
- **D-07:** 必須環境変数:
  - `DATABASE_URL` (Neon Production branch)
  - `GEMINI_API_KEY`
  - `CRON_SECRET` (Vercel Cron 自動付与と一致)
  - `SESSION_PASSWORD` (iron-session v8, 32文字以上)
  - `FINNHUB_API_KEY`
  - `ALPHA_VANTAGE_API_KEY`（存在すれば）
  - Phase 2-3 で追加された他の API キー（実装を確認して網羅する）
- **D-08:** 環境変数は Vercel ダッシュボード UI から手動登録する。CLI (`vercel env add`) は使わない。`.env.example` に必須変数リストをコミットしておき、Plan フェーズで網羅性をチェック。
- **D-09:** `SESSION_PASSWORD` のローテーションは手動のみ（インシデント発生時または定期目安の年1回）。2キーローテーション機構は実装しない。

### タイムアウトと Fluid Compute
- **D-10:** `daily-run` の本番実行時間は初回 cron 発火後 Vercel Function Logs の Duration 欄で実測する。追加計装は入れない。
- **D-11:** 本番で120s超過が発生した場合の対応は後回し。Phase 5 のスコープでは実測のみ。超過が実際に起きた時点でインシデントとして対応（`maxDuration=300` 引き上げ、または Inngest/QStash 導入を別フェーズで検討）。
- **D-12:** 既存の `maxDuration = 120` を維持する（Phase 03 D-17）。変更しない。

### デプロイ前検証とロールアウト
- **D-13:** `SECURITY-CHECKLIST.md` を Phase 5 成果物として作成し、手動で全項目を実行する。最低限の項目:
  1. `.env*` が `.gitignore` に入っている
  2. 全認証必須ルート（`/`, `/api/dashboard/*`, `/api/cron/*` など）を curl で叩き、401 を返すことを確認
  3. `CRON_SECRET` を不一致値で送信し 401 を確認
  4. `proxy.ts` matcher が `/_next/static` `/favicon.ico` 以外をカバーしていることを確認
  5. Vercel Function Logs に secret/PII が出ていないことを確認（grep チェック）
  6. Neon DB ユーザーが最小権限（必要なテーブルへの SELECT/INSERT/UPDATE のみ）
  7. CSP / security ヘッダ（`Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`）が返っているか確認
- **D-14:** 自動 E2E セキュリティテストは Phase 5 スコープ外。将来検討。
- **D-15:** 初回ロールアウト手順:
  1. Vercel プロジェクトリンク（`vercel link` 同等、ダッシュボード経由）
  2. 環境変数を Production に手動登録
  3. `vercel.json` コミット → git push → Production デプロイ
  4. デプロイ直後に `curl -H "Authorization: Bearer $CRON_SECRET" -X POST https://<domain>/api/cron/daily-run` で手動実行し、`decisions` テーブルに行が入り trades が記録されることを検証（冪等 ON CONFLICT が効くので同日2回目は安全にスキップされる）
  5. SECURITY-CHECKLIST.md の全項目を手動実行
  6. UTC 22:00 到達時に cron が自動発火することを Vercel Logs で確認
  7. 翌日 UTC 22:00 に自動で2回目の決定レコードが生成されたことを確認（冪等→新規INSERT）
- **D-16:** Cron 失敗時の検知は Vercel Logs の手動監視のみ。Slack/Discord 通知連携や Dashboard 上の「last cron run」インジケーターは Phase 5 スコープ外。

### Claude's Discretion
- `vercel.json` の他のフィールド（`headers`, `rewrites`, `redirects`）の具体構成は Plan/Research フェーズで決定。
- セキュリティヘッダの配線方法（`next.config.ts` の `headers()` vs `proxy.ts` での付与 vs `vercel.json` の `headers`）は Plan フェーズで決定。
- Vercel プロジェクト名、デプロイ URL は任意。

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Prior phase context (locked decisions that carry forward)
- `.planning/phases/01-foundation/01-CONTEXT.md` — iron-session v8 + proxy.ts 構成、SEC-01〜SEC-03 の環境変数/DB権限決定
- `.planning/phases/01-foundation/01-VERIFICATION.md` — Phase 01 で確定したセキュリティ境界
- `.planning/phases/03-agent-pipeline/03-CONTEXT.md` — D-16 (冪等INSERT), D-17 (maxDuration=120)
- `.planning/phases/04-dashboard/04-SECURITY.md` — Phase 04 完了時点のセキュリティ脅威モデル

### Requirements
- `.planning/REQUIREMENTS.md` §OPS-01〜04, §Security — 本フェーズの受け入れ基準
- `.planning/ROADMAP.md` §Phase 5 Success Criteria — 4項目の完了条件

### Existing code to reference
- `app/api/cron/daily-run/route.ts` — Cron エンドポイント（CRON_SECRET 認証、maxDuration=120、冪等INSERT 実装済み）
- `app/api/cron/fetch-market-data/route.ts` — 手動トリガ用に残置される市場データ取得エンドポイント
- `proxy.ts` — 認証ゲート。`/login`, `/api/auth/*`, `/api/cron/*` バイパス、それ以外は iron-session 必須
- `lib/session.ts` — iron-session v8 の `sessionOptions` と `SessionData` 型
- `lib/env.ts` — 環境変数ロード層（新しい変数追加時はここに型追加）
- `.env.example` — 必須環境変数のドキュメント

### External docs (read before implementing)
- https://vercel.com/docs/cron-jobs — Vercel Cron 仕様（Hobby 1日1回制約、自動 Authorization ヘッダ付与、vercel.json crons 配列）
- https://vercel.com/docs/functions/configuring-functions/duration — Fluid Compute maxDuration 設定（デフォルト300s、Hobbyも対応）
- https://vercel.com/docs/projects/environment-variables — 環境変数の Production/Preview/Development スコープ
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` — Next.js 16 の `proxy.ts`（`middleware.ts` からリネーム済み）

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`/api/cron/daily-run` route.ts**: CRON_SECRET 認証、maxDuration=120、ensureMarketData（fetch統合）、Gemini呼び出し、executor、portfolio_snapshot まで一気通貫で実装済み。Phase 5 では「エンドポイントの配線と検証」のみで、ロジック追加は不要。
- **`/api/cron/fetch-market-data` route.ts**: 既存の CRON_SECRET 認証パターン。daily-run が内包する形になるため本番cronでは呼ばれないが、手動デバッグで使えるように残す。
- **`proxy.ts`**: 認証ゲート完成品。`/api/cron/*` と `/api/auth/*` のバイパスが実装済み。Phase 5 では matcher の妥当性チェックのみ。
- **`.env.example`**: 必須環境変数リストがあるはず。Phase 5 ではここに記載されたもの全てを Vercel に投入することを検証。

### Established Patterns
- **CRON_SECRET Bearer 検証**: 両 cron route で `request.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}` → 401` のパターン。Vercel Cron が自動付与するヘッダ形式と完全一致するため追加実装不要。
- **冪等 INSERT (`ON CONFLICT DO NOTHING`)**: 同日2回目の実行は自動スキップされる。本番で手動 curl → cron 自動発火の重複実行も安全。
- **iron-session v8 + proxy.ts**: 全ページとAPIを`SESSION_PASSWORD`で保護。Phase 5 では設定変更なし。
- **`maxDuration` per-route export**: Next.js Route Handler で `export const maxDuration = N` を定義。Phase 5 では `daily-run` の 120 を維持。

### Integration Points
- `vercel.json` (新規作成) — ルート直下。`crons` 配列のみのシンプルな構成でよい。
- `SECURITY-CHECKLIST.md` (新規作成) — Phase 5 ドキュメント。`.planning/phases/05-deployment-hardening/` 配下に置くか、ルート docs に置くかは Plan で決定。
- `.env.example` (既存) — 追加環境変数があれば更新。

</code_context>

<specifics>
## Specific Ideas

- Cron 発火時刻 `UTC 22:00` = `0 22 * * *` (cron expression)
- 本番動作確認は curl + Vercel Logs の目視のみ。E2E 自動化はしない。
- `SECURITY-CHECKLIST.md` は「毎回のデプロイで再利用するチェックリスト」として書く（単発の成果物ではなく）

</specifics>

<deferred>
## Deferred Ideas

以下は Phase 5 スコープ外。将来の別フェーズで検討。

- **Preview 用 Neon DB branch 分離** — Vercel×Neon integration で自動化可能だが、Phase 5 では実施しない。Preview を実運用で使うフェーズが来たら導入。
- **Vercel Deployment Protection** — iron-session で十分と判断。有料機能化された場合や、外部共有が必要になったら再考。
- **Inngest / QStash / Trigger.dev 等のバックグラウンドキュー** — 120s 超過の実測結果次第。超過が実際に起きたら別フェーズで導入検討。
- **`maxDuration` の 300s 引き上げ** — 同上。超過実測後の対応オプション。
- **Slack / Discord 失敗通知** — 個人プロジェクトなので手動Logs監視で十分。頻度や運用負荷が上がったら Log Drains 連携を検討。
- **Dashboard への「last cron run」インジケーター** — フロント改修が必要。Phase 4 は完了しているため、将来の改善タスクとして記録。
- **自動 E2E セキュリティ回帰テスト (Playwright)** — 個人プロジェクトには過剰。マルチユーザー化するなら検討。
- **SESSION_PASSWORD の2キーローテーション機構** — iron-session v8 は password 配列対応だが、実装コストと個人運用での必要性が釣り合わない。

</deferred>

---

*Phase: 05-deployment-hardening*
*Context gathered: 2026-04-13*
