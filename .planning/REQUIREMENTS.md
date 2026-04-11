# Requirements: invest-simulator

**Defined:** 2026-04-11
**Core Value:** 毎日のAIの売買判断と「なぜそう考えたか」の理由を読むことで、投資の思考プロセスを学べること

## v1 Requirements

### Market Data（市場データ取得）

- [ ] **DATA-01**: Finnhubから米国株（NYSE/NASDAQ）の日次価格・直近ニュース・基本ファンダメンタルを取得できる
- [ ] **DATA-02**: 日本株の日次価格を yahoo-finance2（primary）＋ Stooq（fallback）の二重ソースで取得でき、一方が失敗した場合に自動切替する
- [ ] **DATA-03**: 取得した価格データを `price_snapshots` テーブルに永続化し、エージェント実行時はDBから参照する（実行中の外部API呼び出しを避ける）
- [ ] **DATA-04**: 米国・日本の市場休場日とタイムゾーン差を考慮し、最新の営業日ベースで価格を取得する
- [ ] **DATA-05**: ティッカーホワイトリストに基づいてデータ取得を実行する（幻覚銘柄の防止）

### AI Agent（Claude実行）

- [ ] **AGENT-01**: Google Gemini API（`@google/generative-ai`）を使い、Function Calling経由で日次でAIに売買判断を行わせる
- [ ] **AGENT-02**: AIには価格チャート（テクニカル指標込み）、ファンダメンタル、ニュース要約、現在のポジションを入力として渡す
- [ ] **AGENT-03**: ニュースは事前に圧縮（銘柄ごと3ヘッドライン＋1行要約）してトークンコスト爆発を防ぐ
- [ ] **AGENT-04**: AIは現物ロングのみで買い・売り・ホールドを判断し、構造化された出力（ticker, action, quantity, confidence, reasoning）を返す
- [ ] **AGENT-05**: プロンプト・レスポンス・使用データのフルトランスクリプトを `agent_runs` テーブルに保存する
- [ ] **AGENT-06**: プロンプトインジェクション対策としてニュース本文はデリミタで囲い、AIに「信頼できない入力」として指示する
- [ ] **AGENT-07**: 1回の実行あたりのトークンコスト推定値をログに記録する

### Trade Execution（仮想売買執行）

- [ ] **EXEC-01**: 仮想初期資金1,000万円相当でポートフォリオを初期化する
- [ ] **EXEC-02**: Claudeの判断に基づき、その日のClose価格で仮想的に売買を執行する
- [ ] **EXEC-03**: 現物ロングのみを許可し、現金残高不足時は買いを拒否する
- [ ] **EXEC-04**: 全取引を `trades` テーブルに永続化（日時、銘柄、action、数量、価格、対応する agent_run_id）
- [ ] **EXEC-05**: 取引後のポジションと現金残高を `positions` テーブルで追跡する

### Dashboard（UI）

- [ ] **DASH-01**: ポートフォリオ総資産の時系列グラフをベンチマーク（SPY/TOPIX）と比較表示する
- [ ] **DASH-02**: 現在のポジション一覧を保有数・取得価格・現在価格・損益・配分比率で表示する
- [ ] **DASH-03**: 取引履歴をタイムライン形式で表示し、各取引にClaudeの判断理由（デフォルト展開表示）を並べる
- [ ] **DASH-04**: パフォーマンス指標を表示する：累計リターン、ベンチマーク差分、シャープレシオ、最大ドローダウン、勝率、取引数
- [ ] **DASH-05**: Claudeの確信度（high/medium/low）を各判断とともに視覚的に表示する

### Scheduling & Deployment（運用）

- [ ] **OPS-01**: Vercel Cronで1日1回（市場クローズ後）日次サイクルを自動実行する
- [ ] **OPS-02**: Cronエンドポイントは `CRON_SECRET` ヘッダで保護する
- [ ] **OPS-03**: Vercelにデプロイし、どこからでもダッシュボードにアクセスできる
- [ ] **OPS-04**: Fluid Compute設定でタイムアウトを確認し、超過リスクがある場合はバックグラウンドキュー（Inngest/Trigger.dev/QStash）にフォールバック

### Security（セキュリティ）

- [ ] **SEC-01**: iron-sessionベースの簡易パスワード保護でダッシュボード全体を覆う
- [x] **SEC-02**: AnthropicとFinnhubのAPIキーは環境変数で管理しクライアントに露出させない
- [x] **SEC-03**: DBセッションと平文のAPIキーをSSRで漏らさない

## v2 Requirements

### Advanced Reasoning UX

- **REASON-01**: Claudeの推論フルテキスト全文検索
- **REASON-02**: 取引前後の市場コンテキストスナップショット閲覧
- **REASON-03**: 複数エージェント（プロンプト違い）の並行比較

### Risk Management

- **RISK-01**: 最大ポジションサイズのサーキットブレーカー
- **RISK-02**: 日次損失上限での自動停止

## Out of Scope

| Feature | Reason |
|---------|--------|
| 実弾運用・証券会社API連携 | 学習目的、実リスクを取らない |
| 信用取引・ショート・レバレッジ | 現物ロングのみで思考プロセスに集中 |
| マルチユーザー・Auth.js等 | 自分専用、簡易パスワードで十分 |
| デイトレード（時間単位の判断） | 1日1回でAPI制限とコストを抑える |
| リアルタイム価格ストリーミング | 日次バッチで十分、複雑性増 |
| バックテストエンジン | サバイバーシップバイアス、現在のClaude推論は再現不能 |
| 戦略パラメータ化UI | パフォーマンス最適化ツール化し観察ツールでなくなる |
| スマホネイティブアプリ | Webダッシュボードで十分 |
| イベント駆動の臨時トレード | まずは定時運用で確立 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | Phase 2 | Pending |
| DATA-02 | Phase 2 | Pending |
| DATA-03 | Phase 2 | Pending |
| DATA-04 | Phase 2 | Pending |
| DATA-05 | Phase 2 | Pending |
| AGENT-01 | Phase 3 | Pending |
| AGENT-02 | Phase 3 | Pending |
| AGENT-03 | Phase 3 | Pending |
| AGENT-04 | Phase 3 | Pending |
| AGENT-05 | Phase 3 | Pending |
| AGENT-06 | Phase 3 | Pending |
| AGENT-07 | Phase 3 | Pending |
| EXEC-01 | Phase 3 | Pending |
| EXEC-02 | Phase 3 | Pending |
| EXEC-03 | Phase 3 | Pending |
| EXEC-04 | Phase 3 | Pending |
| EXEC-05 | Phase 3 | Pending |
| DASH-01 | Phase 4 | Pending |
| DASH-02 | Phase 4 | Pending |
| DASH-03 | Phase 4 | Pending |
| DASH-04 | Phase 4 | Pending |
| DASH-05 | Phase 4 | Pending |
| OPS-01 | Phase 5 | Pending |
| OPS-02 | Phase 5 | Pending |
| OPS-03 | Phase 5 | Pending |
| OPS-04 | Phase 5 | Pending |
| SEC-01 | Phase 1 | Pending |
| SEC-02 | Phase 1 | Complete |
| SEC-03 | Phase 1 | Complete |

**Coverage:**
- v1 requirements: 30 total
- Mapped to phases: 30 ✓
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-11*
*Last updated: 2026-04-11 after roadmap creation (traceability populated)*
