# Roadmap: invest-simulator

## Overview

Neon Postgres + Drizzle でデータ基盤を固め、市場データ取得層、Claude エージェントパイプライン、ダッシュボード UI、本番デプロイの順に積み上げる。「書き込みパスを先に確立し、読み取りパスを後から構築する」原則を全フェーズで維持する。Claude の売買判断ログと理由テキストが永続化されて初めて core value が実現するため、Phase 3 完了時点でアプリケーションの価値命題が証明できる状態になる。

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Foundation** - DBスキーマ・認証・AI Layer選択を確定し、全後続フェーズの土台を作る
- [ ] **Phase 2: Market Data** - 米国株・日本株の日次価格をDBに永続化する取得パイプラインを構築する
- [ ] **Phase 3: Agent Pipeline** - Claudeが市場データを参照して売買判断し、トランスクリプトと仮想トレードをDBに保存する
- [ ] **Phase 4: Dashboard** - 蓄積されたトレードログ・推論・パフォーマンス指標を読めるUIを完成させる
- [ ] **Phase 5: Deployment & Hardening** - Vercel本番デプロイ・Cronスケジューラー設定・セキュリティ検証を完了する

## Phase Details

### Phase 1: Foundation
**Goal**: DBスキーマ・認証ミドルウェア・AI Layer実装方針が確定し、後続フェーズが安全に実装できる状態
**Depends on**: Nothing (first phase)
**Requirements**: SEC-01, SEC-02, SEC-03
**Success Criteria** (what must be TRUE):
  1. ログインページでパスワードを入力すると暗号化セッションCookieが発行され、ブラウザを閉じて再度開いてもダッシュボードにアクセスできる
  2. 誤ったパスワードを入力すると401が返り、ダッシュボードへアクセスできない
  3. Drizzle スキーマが Neon にマイグレーション済みで、全テーブル（portfolios/positions/trades/decisions/price_snapshots/portfolio_snapshots）が存在する
  4. ANTHROPIC_API_KEY・DATABASE_URL・SESSION_SECRET がサーバーサイドのみで参照され、ブラウザのネットワークタブに露出しない
  5. AI Layer選択（Agent SDK vs 標準 SDK）が実測に基づいて確定し、PROJECT.md Key Decisions に記録されている
**Plans**: 5 plans
  - [x] 01-01-PLAN.md — Drizzle schema + Neon DB provision + schema push (BLOCKING)
  - [x] 01-02-PLAN.md — Env skeleton (.env.example) + runtime env validator (lib/env.ts)
  - [x] 01-03-PLAN.md — iron-session v8 + /login page + /api/auth/{login,logout}
  - [ ] 01-04-PLAN.md — Next.js 16 proxy.ts auth gate + /dashboard placeholder + end-to-end verify
  - [ ] 01-05-PLAN.md — AI Layer SPIKE (agent-sdk vs standard sdk) + decision writeup + promote winner
**UI hint**: yes

### Phase 2: Market Data
**Goal**: 米国株（Finnhub）と日本株（yahoo-finance2 + Stooq fallback）の日次価格・ニュース・ファンダメンタルが `price_snapshots` テーブルに保存される
**Depends on**: Phase 1
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, DATA-05
**Success Criteria** (what must be TRUE):
  1. ティッカーホワイトリストに登録された米国株・日本株の日次OHLCV・ニュース・ファンダメンタルが `price_snapshots` に書き込まれる
  2. yahoo-finance2 が失敗したとき、Stooq CSV fallback に自動切替して日本株価格の取得を続けられる
  3. 市場休場日（土日・祝日）には取得をスキップし、`market_closed: true` フラグが記録される
  4. ホワイトリスト外のティッカーでデータ取得を試みてもエラーになり、取得が拒否される
  5. raw_close と adj_close の両カラムが保存され、split-adjusted 価格で統一されている
**Plans**: TBD

### Phase 3: Agent Pipeline
**Goal**: Claudeが市場データを参照して買い/売り/ホールドを判断し、full transcript と仮想トレードの結果がDBに永続化される
**Depends on**: Phase 2
**Requirements**: AGENT-01, AGENT-02, AGENT-03, AGENT-04, AGENT-05, AGENT-06, AGENT-07, EXEC-01, EXEC-02, EXEC-03, EXEC-04, EXEC-05
**Success Criteria** (what must be TRUE):
  1. `/api/cron/daily-run` を叩くと Claude が価格・ニュース・ポジションを参照して sell/buy/hold を判断し、`decisions` テーブルにfull transcript（JSONB）・token count・estimated cost が保存される
  2. Claudeの判断に基づいた仮想取引が `trades` テーブルに記録され、`positions` テーブルの保有数・現金残高が更新される
  3. 現金残高を超える買い注文は拒否され、現物ロング以外の注文（ショート等）は実行されない
  4. 同日に2回 Cron が発火しても `decisions` テーブルのレコードは1件のみ（idempotent guard が機能している）
  5. ニュースコンテキストは ticker あたり3ヘッドライン+1行要約に圧縮され、`<external_news_content>` XMLタグで囲まれてプロンプトに渡される
**Plans**: TBD

### Phase 4: Dashboard
**Goal**: ポートフォリオ推移・現在ポジション・トレードタイムライン・パフォーマンス指標・Claudeの判断理由をブラウザで読める
**Depends on**: Phase 3
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, DASH-05
**Success Criteria** (what must be TRUE):
  1. ポートフォリオ総資産の時系列チャートにベンチマーク（SPY/TOPIX）の折れ線が重ねて表示される
  2. ポジション一覧で保有数・取得平均価格・現在価格・含み損益・配分比率（%）が確認できる
  3. トレードタイムラインで各取引にClaudeの判断理由テキストがデフォルト展開状態で表示され、確信度（high/medium/low）が色で区別される
  4. 累計リターン・ベンチマーク差分・シャープレシオ・最大ドローダウン・勝率・取引数のパフォーマンス指標カードが表示される
**Plans**: TBD
**UI hint**: yes

### Phase 5: Deployment & Hardening
**Goal**: Vercel本番環境でCronが毎日自動実行され、エンドポイントが保護され、セキュリティ検証が完了した状態で公開される
**Depends on**: Phase 4
**Requirements**: OPS-01, OPS-02, OPS-03, OPS-04
**Success Criteria** (what must be TRUE):
  1. Vercel Cron が市場クローズ後（UTC 0:00 前後）に毎日自動で日次サイクルを実行し、`decisions` テーブルに新しいレコードが記録される
  2. `CRON_SECRET` ヘッダなしで `/api/cron/daily-run` を叩くと401が返り、外部から不正実行できない
  3. ブラウザからパスワードなしでダッシュボードにアクセスするとログインページにリダイレクトされ、APIエンドポイントも401を返す（curl で全ルート検証済み）
  4. Vercel Fluid Compute の maxDuration が設定済みで、60秒超過リスクがある場合はバックグラウンドキュー（Inngest/QStash）にフォールバックするフローが存在する
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 0/5 | Planned | - |
| 2. Market Data | 0/TBD | Not started | - |
| 3. Agent Pipeline | 0/TBD | Not started | - |
| 4. Dashboard | 0/TBD | Not started | - |
| 5. Deployment & Hardening | 0/TBD | Not started | - |
