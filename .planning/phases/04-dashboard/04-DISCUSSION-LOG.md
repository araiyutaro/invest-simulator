# Phase 4: Dashboard - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-12
**Phase:** 04-dashboard
**Areas discussed:** ページ構成とレイアウト, チャート表現と操作性, トレードタイムラインの表示, パフォーマンス指標カード

---

## ページ構成とレイアウト

| Option | Description | Selected |
|--------|-------------|----------|
| 1ページスクロール (推奨) | 全セクションを /dashboard に縦スクロールで配置。10銘柄の個人ツールとしてシンプル。 | ✓ |
| タブ切替型 | トップにタブナビ（概要 / 取引履歴 / 分析）を置きセクションごとに切替。 | |
| 複数ページ(サイドバー) | /dashboard, /dashboard/trades, /dashboard/analytics に分割。サイドバーナビで切替。 | |

**User's choice:** 1ページスクロール
**Notes:** なし

| Option | Description | Selected |
|--------|-------------|----------|
| ダークテーマ (推奨) | 暗い背景に明るいテキスト。金融ダッシュボードで標準的。チャートが見やすい。 | �� |
| ライトテーマ | 明るい背景。「学習ツール」の親しみやすさを重視。 | |
| Claudeにおまかせ | 色合い・テーマの選択はClaudeの裁量。 | |

**User's choice:** ダークテーマ
**Notes:** セクション順序はプレビュー通り（指標カード → チャート → ポジション → タイムライン）

---

## チャート表現と操作性

| Option | Description | Selected |
|--------|-------------|----------|
| ラインチャート (推奨) | lightweight-chartsの折れ線で3系列重ね表示。%リターン正規化。 | ✓ |
| エリアチャート | ポートフォリオを塗りつぶしのエリアで表現。ベンチマークは別ライン。 | |

**User's choice:** ラインチャート
**Notes:** 3本線: portfolio/SPY/TOPIX、%リターンで正規化

| Option | Description | Selected |
|--------|-------------|----------|
| SPYのみ (推奨) | SPYは既にprice_snapshotsにデータあり。TOPIXはデータ取得対象外。 | |
| SPY + TOPIX ETF | 1306.Tをホワイトリストに追加してデータ取得対象にする。日本株ベンチマークも比較可能。 | ✓ |
| Claudeにおまかせ | データがあるものだけでベンチマーク表示。 | |

**User's choice:** SPY + TOPIX ETF
**Notes:** 1306.T（TOPIX連動型上場投信）をconfig/tickers.tsのホワイトリストに追加する必要あり

| Option | Description | Selected |
|--------|-------------|----------|
| 全期間のみ (推奨) | 運用開始から現在までを常に表示。運用初期はデータ少なく期間切替不要。 | ✓ |
| 1M/3M/6M/1Y/ALL | 期間ボタンで表示範囲を切替。データ蓄積後に便利だが初期は過剰。 | |
| Claudeにおまかせ | データ量に応じて実装時に判断。 | |

**User's choice:** 全期間のみ
**Notes:** なし

| Option | Description | Selected |
|--------|-------------|----------|
| 不要（テーブルのみ） | ポジションテーブルに配分比率(%)カラムがあれば十分。 | |
| パイチャートあり | Rechartsでドーナツ/パイチャート。現金+各銘柄の配分を可視化。 | ✓ |
| Claudeにおまかせ | データ量を見て実装時に判断。 | |

**User's choice:** パイチャートあり
**Notes:** Rechartsを新規インストール

---

## トレードタイムラインの表示

| Option | Description | Selected |
|--------|-------------|----------|
| 1日単位 (推奨) | 日付ごとにmarket_assessment + 銘柄別判断カードを並べる。 | ✓ |
| 銘柄単位 | 銘柄ごとに時系列で判断履歴を並べる。 | |

**User's choice:** 1日単位
**Notes:** Core Valueの「なぜそう判断したか」を日単位で読める

| Option | Description | Selected |
|--------|-------------|----------|
| BUY/SELLのみ表示 (推奨) | 実際に取引があった銘柄のみ。タイムラインが簡潔。全HOLD日はmarket_assessmentのみ。 | ✓ |
| 全銘柄表示 | HOLD含め全銘柄の判断理由を表示。10銘柄×30日=300カードでページが長くなる。 | |
| トグル切替 | デフォルトBUY/SELLのみ、トグルでHOLDも表示可能。 | |

**User's choice:** BUY/SELLのみ表示
**Notes:** なし

| Option | Description | Selected |
|--------|-------------|----------|
| 直近20日 + もっと見る (推奨) | 初期表示は直近20日分。「もっと見る」ボタンで追加読み込み。初期ロードが軽い。 | ✓ |
| 全件一括表示 | 全履歴を一度に表示。シンプルだがデータ増加で重くなる。 | |
| Claudeにおまかせ | データ量に応じて実装時に判断。 | |

**User's choice:** 直近20日 + もっと見る
**Notes:** なし

---

## パフォーマンス指標カード

| Option | Description | Selected |
|--------|-------------|----------|
| サーバーサイド (推奨) | Route Handler / Server Componentで計算。クライアントJSが軽量。 | ✓ |
| クライアントサイド | APIから生データ取得しブラウザで計算。期間絞り込みには良いが不要。 | |
| Claudeにおまかせ | 実装時に最適な判断を任せる。 | |

**User's choice:** サーバーサイド
**Notes:** なし

| Option | Description | Selected |
|--------|-------------|----------|
| グリッドカード (推奨) | 3×2グリッド。各カードに指標名・値・色分け。 | ✓ |
| コンパクトバー | 1行の水平バーに6指標を並べる。省スペースだが値が小さい。 | |
| Claudeにおまかせ | デザインは実装時に最適な判断を任せる。 | |

**User's choice:** グリッドカード
**Notes:** プラス=緑、マイナス=赤の色分け

---

## Claude's Discretion

- コンポーネント分割構成
- lightweight-chartsの具体的スタイリング
- ダークテーマの配色パレット詳細
- ポジションテーブルのカラム幅・ソート
- パイチャートのカラーパレット
- 「もっと見る」の追加読み込み件数
- レスポンシブブレイクポイント
- APIエンドポイント設計

## Deferred Ideas

- 期間切替（1M/3M/6M/1Y/ALL）
- ライトテーマ切替
- 銘柄単位タイムライン
- HOLD判断のトグル表示
- キャンドルスティック（個別銘柄）
- フルテキスト検索（v2）
- 複数エージェント比較（v2）
