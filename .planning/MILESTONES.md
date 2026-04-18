# Milestones

## v1.0 MVP (Shipped: 2026-04-18)

**Phases completed:** 5 phases, 30 plans
**Timeline:** 7 days (2026-04-11 → 2026-04-18)
**Commits:** 164 | **Files:** 184 | **LOC:** 7,166 TypeScript

**Key accomplishments:**

1. Neon Postgres上に6テーブルスキーマを構築し、Drizzle ORMで型安全なDB基盤を確立
2. Finnhub (US) + yahoo-finance2 (JP) + Stooq fallback による二重ソース市場データパイプラインを実装
3. Gemini 2.5 Flash による日次売買判断エージェント（Function Calling + idempotency guard）を構築
4. ダークテーマのダッシュボード（TradingViewチャート、パフォーマンス指標、トレードタイムライン）を完成
5. Vercel本番デプロイ + セキュリティヘッダ + Vercel Cron + GitHub Actions Cron fallback を配備

**Delivered:** AIエージェントが毎日仮想資金で米国株・日本株を売買判断し、判断理由とパフォーマンスをダッシュボードで閲覧できる学習用Webアプリ

**Archive:** [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md) | [milestones/v1.0-REQUIREMENTS.md](milestones/v1.0-REQUIREMENTS.md)

---
