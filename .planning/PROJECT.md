# invest-simulator

## What This Is

実在する米国株・日本株の市場データを使って、AIエージェント（Gemini）が毎日仮想資金で売買判断を行い、その思考プロセスと運用成果を追跡できる学習用Webアプリ。自分専用の「AI投資観察ダッシュボード」として、AIの判断理由を読み解きながら投資の考え方を学ぶことを目的とする。

## Core Value

毎日のAIの売買判断と「なぜそう考えたか」の理由を読むことで、投資の思考プロセスを学べること。パフォーマンスの良し悪しよりも、判断ログの読みやすさが最優先。

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] 米国株（NYSE/NASDAQ）と日本株のリアル市場データを無料APIから取得できる
- [ ] Gemini API経由で1日1回、価格チャート・ファンダメンタル・ニュース・現在ポジションを参照しながら売買判断を行う
- [ ] 仮想資金1,000万円相当からスタートし、現物ロングのみで売買を執行・記録する
- [ ] 売買履歴とAIの判断理由（プロンプト/レスポンス）を永続化して後から読める
- [ ] ポートフォリオ推移グラフ（ベンチマーク比較付き）をダッシュボードで表示する
- [ ] 現在のポジション、損益、配分比率を一覧表示する
- [ ] 取引履歴と判断理由をタイムライン形式で読める
- [ ] 勝率・シャープレシオ・最大ドローダウン等のパフォーマンス指標を表示する
- [ ] クラウド（Vercel等）にデプロイし、スケジューラーで毎日自動実行する
- [ ] 簡易パスワード保護でダッシュボードへのアクセスを制限する

### Out of Scope

- 実弾運用・証券会社API連携 — 学習目的、リスクを取らない
- 信用取引・ショート・レバレッジ — 現物ロングのみで思考プロセスに集中
- マルチユーザー・認証プロバイダ（Auth.js等） — 自分専用、簡易パスワードで十分
- デイトレード（時間単位以下の高頻度判断） — 1日1回でAPI制限とコストを抑える
- 全市場リアルタイムストリーミング — 日次バッチで足りる
- イベント駆動トレード（価格急変時の臨時判断） — 後日検討、まずは定時運用
- スマホネイティブアプリ — Webダッシュボードで十分

## Context

- **既存プロジェクト**: Next.js（最新版）でブートストラップ済み。フロントエンドの土台はあるが、未実装の状態。
- **AI実行**: Google Gemini API（`@google/generative-ai` SDK、Function Calling 対応）を使用。既存の有料 Gemini アカウントを活用。無料枠も寛大で1日1回運用に十分。
- **データソース未確定**: 米株は Alpha Vantage / Finnhub / Yahoo Finance 系、日本株は無料枠が限られる（Yahoo Finance Japan 非公式 / Stooq 等）。研究フェーズで選定。
- **学習のための観察ツール**であり、勝率を競うものではない。判断ログの可読性が最重要。
- **コスト意識**: 個人プロジェクトのため、API利用料・LLMトークン・クラウドホスティング全て無料/低コスト枠で収めたい。

## Constraints

- **Tech stack**: Next.js（既存ブートストラップを活用） — 余分な再構築をしない
- **AI実行**: Google Gemini API (`@google/generative-ai`) — 既存の有料アカウントを活用、無料枠で1日1回運用可能
- **Budget**: 個人プロジェクト、無料/低コスト枠優先 — API・ホスティング共に
- **Deployment**: クラウドデプロイ前提（Vercel想定） — どこからでも閲覧したい
- **Auth**: 簡易パスワード保護のみ — 自分専用、認証プロバイダは過剰
- **Security**: クラウド公開URLになるため最低限の保護が必須 — APIキー・トレードログ流出防止
- **トレード範囲**: 現物ロング、米株+日本株 — 信用/ショート/暗号資産/FXは対象外
- **頻度**: 1日1回の判断サイクル — API制限とトークンコストを抑える

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| AI Layer: Google Gemini API (`@google/generative-ai` v0.24.1) + `gemini-2.5-flash` | Function Calling・JSON出力対応、既存有料アカウント活用、無料枠寛大、Vercel serverless互換 | ✓ Good — Confirmed 2026-04-11 ([.planning/research/AI-LAYER-SPIKE.md](./research/AI-LAYER-SPIKE.md)). Local SPIKE で 2-step function calling (`get_price` → `place_order`) が動作、elapsedMs 4.5–5.3s / ~400 tokens/call。Vercel Preview 検証は human-action checkpoint として残存 |
| 仮想資金1,000万円 | 銘柄分散がしやすい現実的な規模 | — Pending |
| 1日1回サイクル | 学習目的、API/トークンコスト削減、シンプル | — Pending |
| 現物ロングのみ | 思考プロセスの観察に集中、複雑性を抑える | — Pending |
| クラウドデプロイ + 簡易パスワード | どこからでも閲覧、最低限の保護 | — Pending |
| Next.js継続使用 | 既にブートストラップ済み、再構築を避ける | — Pending |

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
*Last updated: 2026-04-11 after pivot from Anthropic Claude to Google Gemini*
