# Phase 5: Deployment & Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-13
**Phase:** 05-deployment-hardening
**Areas discussed:** Cronスケジュール設計, 環境変数・Preview保護, タイムアウト実測と fallback, デプロイ前検証とロールアウト手順

---

## Cron スケジュール設計

### Q: fetch-market-data と daily-run の2つを Hobby の1日1回制約でどう配線するか

| Option | Description | Selected |
|--------|-------------|----------|
| 連続実行（daily-run のfetch内包） | daily-run の ensureMarketData が既に fetch を起動。cron は daily-run 1本のみ。fetch-market-data は手動/デバッグ用に残す | ✓ |
| cronを2本定義し Pro プランへ | 月$20 で完全分離 | |
| GitHub Actions で fetch を先行発火 | 無料で分離できるが secret管理二重 | |

**User's choice:** 連続実行（daily-run のfetch内包）

### Q: daily-run の発火時刻

| Option | Description | Selected |
|--------|-------------|----------|
| JST 07:00 相当（UTC 22:00） | 前日US市場クローズ後、本日JPオープン前。朝にログを読める | ✓ |
| JST 16:00 相当（UTC 07:00） | JPクローズ直後、JP当日終値で判断 | |
| UTC 00:00 (JST 09:00) | シンプルな暗黙日境 | |

**User's choice:** JST 07:00 相当（UTC 22:00）

### Q: Cron スケジュールの宣言方法

| Option | Description | Selected |
|--------|-------------|----------|
| vercel.json | 標準的でシンプル、ドキュメント豊富 | ✓ |
| vercel.ts | TypeScript 型付きだが新しく情報少 | |
| Claude に任せる | Plan フェーズで決定 | |

**User's choice:** vercel.json

### Q: Vercel Cron が自動付与する Authorization ヘッダの扱い

| Option | Description | Selected |
|--------|-------------|----------|
| 現状まま（手動 Bearer 検証） | 既に route.ts で `Bearer ${CRON_SECRET}` 検証済み。追加実装不要 | ✓ |
| x-vercel-cron-signature 二重ロック | Vercel 署名も検証。既存認証を書き換える必要あり | |

**User's choice:** 現状まま

---

## 環境変数・Preview保護

### Q: Production / Preview / Development の環境分離

| Option | Description | Selected |
|--------|-------------|----------|
| Production のみ本番、Preview も同DB共有 | Neon free tier 1 branch 制約を活用。Preview は手動で出さない限り影響ゼロ | ✓ |
| Preview は Neon branch で分離 | Vercel×Neon integration で自動化 | |
| Preview を完全に無効化 | main のみ Production、シンプルだが検証経路喪失 | |

**User's choice:** Production のみ本番、Preview も同DB共有

### Q: Preview Deployment URL が外部漏洩した場合の保護層

| Option | Description | Selected |
|--------|-------------|----------|
| iron-session だけ（Preview も同SESSION_PASSWORD） | 追加設定なし、proxy.ts が全環境で動作 | ✓ |
| Vercel Deployment Protection を有効化 | Hobby 無料で owner 認証 | |
| 両方（二重ロック） | 過剰 | |

**User's choice:** iron-session だけ

### Q: 環境変数の初期投入手段

| Option | Description | Selected |
|--------|-------------|----------|
| Vercel ダッシュボードから手動登録 | 一回きりなので UI で十分。.env.example にリスト | ✓ |
| vercel env add / pull | CLI 未インストール、初期コストあり | |

**User's choice:** Vercel ダッシュボードから手動登録

### Q: SESSION_PASSWORD のローテーション戦略

| Option | Description | Selected |
|--------|-------------|----------|
| 手動ローテーション（インシデント時のみ） | 個人プロジェクトで自動化不要 | ✓ |
| 2キーローテーション（旧/新両方受け入れ） | iron-session v8 は配列対応、実装負荷あり | |

**User's choice:** 手動ローテーション

---

## タイムアウト実測と fallback

### Q: daily-run の本番実行時間をどう実測するか

| Option | Description | Selected |
|--------|-------------|----------|
| 初回 cron 発火後 Vercel Logs で実測 | Function Logs の Duration 欄。追加実装なし | ✓ |
| route.ts に Date.now() 計装を埋め込む | phase ごとの消費時間をログ化。ボトルネック特定容易 | |
| Preview で先行実測（手動 trigger） | 本番前に検証 | |

**User's choice:** 初回 cron 発火後 Vercel Logs で実測

### Q: 本番で 120s 超過・タイムアウトが発生した場合の対応方針

| Option | Description | Selected |
|--------|-------------|----------|
| Plan フェーズでは実測のみ、超過時にインシデント対応 | 120s は Gemini 1回呼び出し+DBに十分。YAGNI | ✓ |
| maxDuration を 300s に上げる | Fluid Compute デフォルト上限、1行変更 | |
| Inngest/QStash フォールバック導入 | 最強だが依存追加とコード再構成必要 | |

**User's choice:** 実測のみ、超過時インシデント対応

---

## デプロイ前検証とロールアウト手順

### Q: デプロイ前セキュリティ検証の粒度

| Option | Description | Selected |
|--------|-------------|----------|
| SECURITY-CHECKLIST.md にまとめ、手動実行 | curl で全ルート401、CRON_SECRET不一致401、ログ漏洩、.env ignore、DB最小権限、CSPヘッダ | ✓ |
| 自動化テスト（Playwright/supertest） | CI 回帰チェック、個人プロジェクトには過剰 | |
| 最小限の手動確認のみ | ブラウザでログイン画面だけ確認 | |

**User's choice:** SECURITY-CHECKLIST.md 手動実行

### Q: 初回本番デプロイから cron 初発火までのステップ

| Option | Description | Selected |
|--------|-------------|----------|
| デプロイ→手動 curl で daily-run 起動し検証→時刻が来たら当日分 cron→翌日自動 | 当日は手動 POST で decisions と trades 発生を確認。翌朝 cron 自動実行をログで確認 | ✓ |
| デプロイ後は cron 自動発火を待つ | シンプルだが初回失敗の検知が1日遅れる | |

**User's choice:** 手動 curl で検証 → 自動発火で確認

### Q: Cron 失敗時の検知とリカバリ

| Option | Description | Selected |
|--------|-------------|----------|
| Vercel Logs を手動で毎日チェック | 個人プロジェクト、ダッシュボードで最新 decisions を確認、失敗時は curl 再実行 | ✓ |
| Vercel Log Drains で Slack/Discord 通知 | 検知は早いが別途設定とfree tier制約 | |
| Dashboard に 'last cron run' インジケーター | フロント改修が必要 | |

**User's choice:** Vercel Logs 手動チェック

---

## Claude's Discretion

- `vercel.json` の他フィールド（headers, rewrites など）の具体構成は Plan/Research で決定
- セキュリティヘッダの配線場所（`next.config.ts` vs `proxy.ts` vs `vercel.json`）は Plan で決定

## Deferred Ideas

- Preview 用 Neon DB branch 分離
- Vercel Deployment Protection
- Inngest / QStash / Trigger.dev バックグラウンドキュー
- maxDuration の 300s 引き上げ
- Slack / Discord 失敗通知
- Dashboard への 'last cron run' インジケーター
- 自動 E2E セキュリティ回帰テスト
- SESSION_PASSWORD の2キーローテーション機構
