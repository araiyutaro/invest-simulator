# invest-simulator

## What This Is

実在する米国株・日本株の市場データを使って、AIエージェント（Gemini 2.5 Flash）が毎日仮想資金で売買判断を行い、その思考プロセスと運用成果を追跡できる学習用Webアプリ。Neon Postgres上に全トレードログとAIの判断トランスクリプトを永続化し、ダークテーマのダッシュボードでポートフォリオ推移・パフォーマンス指標・判断理由を閲覧できる。

## Core Value

毎日のAIの売買判断と「なぜそう考えたか」の理由を読むことで、投資の思考プロセスを学べること。パフォーマンスの良し悪しよりも、判断ログの読みやすさが最優先。

## Requirements

### Validated

- ✓ 米国株（NYSE/NASDAQ）と日本株のリアル市場データを無料APIから取得できる — v1.0
- ✓ Gemini API経由で1日1回、価格チャート・ファンダメンタル・ニュース・現在ポジションを参照しながら売買判断を行う — v1.0
- ✓ 仮想資金1,000万円相当からスタートし、現物ロングのみで売買を執行・記録する — v1.0
- ✓ 売買履歴とAIの判断理由（プロンプト/レスポンス）を永続化して後から読める — v1.0
- ✓ ポートフォリオ推移グラフ（ベンチマーク比較付き）をダッシュボードで表示する — v1.0
- ✓ 現在のポジション、損益、配分比率を一覧表示する — v1.0
- ✓ 取引履歴と判断理由をタイムライン形式で読める — v1.0
- ✓ 勝率・シャープレシオ・最大ドローダウン等のパフォーマンス指標を表示する — v1.0
- ✓ クラウド（Vercel）にデプロイし、スケジューラーで毎日自動実行する — v1.0
- ✓ 簡易パスワード保護でダッシュボードへのアクセスを制限する — v1.0

### Active

(Next milestone で定義)

### Out of Scope

- 実弾運用・証券会社API連携 — 学習目的、リスクを取らない
- 信用取引・ショート・レバレッジ — 現物ロングのみで思考プロセスに集中
- マルチユーザー・認証プロバイダ（Auth.js等） — 自分専用、簡易パスワードで十分
- デイトレード（時間単位以下の高頻度判断） — 1日1回でAPI制限とコストを抑える
- 全市場リアルタイムストリーミング — 日次バッチで足りる
- イベント駆動トレード（価格急変時の臨時判断） — 後日検討、まずは定時運用
- スマホネイティブアプリ — Webダッシュボードで十分

## Context

**Shipped v1.0 MVP** (2026-04-18) with 7,166 LOC TypeScript across 184 files.

Tech stack: Next.js 16 (App Router) + Neon Postgres + Drizzle ORM + Google Gemini API + iron-session + TradingView lightweight-charts + Recharts + Tailwind CSS v4.

Market data: Finnhub (US stocks, 60 calls/min free) + yahoo-finance2 (JP stocks, `.T` suffix) + Stooq CSV fallback.

Deployment: Vercel (Hobby) + Vercel Cron (daily) + GitHub Actions Cron (fallback).

Known accepted risks:
- CSP uses `'unsafe-inline'` (nonce-based deferred)
- HSTS without `preload` (irrevocable, deferred)
- No Inngest/QStash fallback for 120s overflow (current ~58s, address on incident)

## Constraints

- **Tech stack**: Next.js（既存ブートストラップを活用） — 余分な再構築をしない
- **AI実行**: Google Gemini API (`@google/generative-ai`) — 既存の有料アカウントを活用、無料枠で1日1回運用可能
- **Budget**: 個人プロジェクト、無料/低コスト枠優先 — API・ホスティング共に
- **Deployment**: Vercel（Hobby プラン） — どこからでも閲覧したい
- **Auth**: 簡易パスワード保護のみ — 自分専用、認証プロバイダは過剰
- **Security**: クラウド公開URLになるため最低限の保護が必須 — APIキー・トレードログ流出防止
- **トレード範囲**: 現物ロング、米株+日本株 — 信用/ショート/暗号資産/FXは対象外
- **頻度**: 1日1回の判断サイクル — API制限とトークンコストを抑える

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| AI Layer: Google Gemini API (`@google/generative-ai` v0.24.1) + `gemini-2.5-flash` | Function Calling・JSON出力対応、既存有料アカウント活用、無料枠寛大、Vercel serverless互換 | ✓ Good — SPIKE で 2-step function calling 動作確認、4.5-5.3s/call |
| DB: Neon Postgres + Drizzle ORM | 無料枠 0.5GB、型安全SQL、サーバーレス互換、JSONB対応 | ✓ Good — 6テーブルスキーマ安定稼働 |
| 認証: iron-session v8 + 簡易パスワード | 個人プロジェクト、OAuth過剰、App Router `cookies()` 対応 | ✓ Good |
| 市場データ: Finnhub (US) + yahoo-finance2 (JP) + Stooq fallback | 無料枠内で米日両市場カバー、二重ソースで耐障害性 | ✓ Good |
| チャート: lightweight-charts v4 + Recharts | 金融特化45KB vs 汎用180KB、v4はReactラッパー互換 | ✓ Good |
| Cron: Vercel Cron + GitHub Actions fallback | Hobby 1x/day制限にマッチ、GA fallbackで精度補完 | ✓ Good |
| 仮想資金1,000万円 | 銘柄分散がしやすい現実的な規模 | ✓ Good |
| 現物ロングのみ | 思考プロセスの観察に集中、複雑性を抑える | ✓ Good |
| CSP `'unsafe-inline'` | Next.js RSC + Tailwind v4 要件、nonce-based は後日 | ⚠️ Accepted Risk |
| HSTS without `preload` | preloadは不可逆、ドメイン確定後に有効化 | ⚠️ Accepted Risk |
| No 120s overflow fallback | 現状~58s、実インシデント発生時に対応 | ⚠️ Accepted Risk |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-18 after v1.0 milestone*
