# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — MVP

**Shipped:** 2026-04-18
**Phases:** 5 | **Plans:** 30 | **Commits:** 164

### What Was Built
- Neon Postgres上に6テーブルスキーマ（portfolios/positions/trades/decisions/price_snapshots/portfolio_snapshots）を構築
- Finnhub (US) + yahoo-finance2 (JP) + Stooq fallback による二重ソース市場データパイプライン
- Gemini 2.5 Flash による日次売買判断エージェント（Function Calling + idempotency guard）
- ダークテーマのダッシュボード（TradingView チャート、パフォーマンス指標、トレードタイムライン）
- Vercel本番デプロイ + セキュリティヘッダ + Cron + GitHub Actions fallback

### What Worked
- **TDD アプローチ**: テストファーストで lib/agent/executor.ts を13ケース構築し、FX換算・加重平均avgCost・残高チェックのバグを開発時に発見できた
- **二重ソース戦略**: yahoo-finance2 の不安定さに対してStooq CSV fallback を用意したことで、JP株データ取得の耐障害性を確保
- **段階的デプロイ**: Phase 5 で ROLLOUT.md + SECURITY-CHECKLIST.md を作成してからデプロイしたことで、手順の抜け漏れを防止
- **Gemini SPIKE (Phase 1)**: 実装前にAI Layer選択を実測で確定したことで、Phase 3 での手戻りがゼロ

### What Was Inefficient
- **REQUIREMENTS.md のトレーサビリティ更新漏れ**: 30要件中27件がPendingのまま残った（実装は完了済み）。フェーズ完了時に自動更新するフローが必要
- **Phase 2 のプラン数 (11)**: 市場データ層で細分化しすぎた可能性。7-8プランに統合できたかもしれない
- **CSP/HSTS の accepted risk**: 本来Phase 5内で解決すべきだったが、Next.js RSC + Tailwind v4 の制約で先送り

### Patterns Established
- `server-only` guard でDBクライアント・AI クライアントのブラウザ漏洩を防止
- `onConflictDoNothing` による idempotent guard パターン（Cron二重発火対策）
- CRON_SECRET Bearer token 認証でCronエンドポイントを保護
- proxy.ts によるルートレベル認証ゲート（Next.js 16 パターン）

### Key Lessons
1. **Gemini 2.0 Flash は新規APIユーザーに利用不可** — SPIKE で発見。計画段階のモデル選定は実測必須
2. **lightweight-charts v5 は React wrapper 非互換** — v4 に固定する判断が正しかった
3. **yahoo-finance2 は非公式API** — SLAなし、キャッシュ + fallback が必須の設計前提
4. **Next.js 16 の private-folder rule** — `_` prefix フォルダはルーティング除外されるため、SPIKE用コードの配置に注意

### Cost Observations
- Model mix: GSD workflow は主にSonnet/Opus、Gemini 2.5 Flash は本番AI判断用
- 開発期間: 7日間（2026-04-11 → 2026-04-18）
- Notable: Phase 1-3 が3日間で完了（データ基盤→エージェントの垂直統合が速かった）

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Commits | Phases | Key Change |
|-----------|---------|--------|------------|
| v1.0 | 164 | 5 | Initial GSD workflow adoption, TDD + phase-based execution |

### Cumulative Quality

| Milestone | LOC (TS) | Files | Plans |
|-----------|----------|-------|-------|
| v1.0 | 7,166 | 184 | 30 |
