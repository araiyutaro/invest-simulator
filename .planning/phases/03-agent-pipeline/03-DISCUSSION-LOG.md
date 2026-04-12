# Phase 3: Agent Pipeline - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-12
**Phase:** 03-agent-pipeline
**Areas discussed:** プロンプト設計, Function Calling設計, 仮想売買の執行ロジック, エラー処理と安全装置

---

## プロンプト設計

| Option | Description | Selected |
|--------|-------------|----------|
| 観察重視型 | 判断理由の読みやすさ最優先。Core Valueに直結 | ✓ |
| パフォーマンス型 | リターン最大化を目指す指示 | |
| バランス型 | リスク管理とリターンの両方を要求 | |

**User's choice:** 観察重視型（推奨）
**Notes:** Core Value「判断ログの読みやすさが最優先」に直結する選択

| Option | Description | Selected |
|--------|-------------|----------|
| 事前圧縮 | TSロジックでDB raw newsを圧縮してからプロンプトに埋め込み | ✓ |
| Geminiに圧縮させる | raw newsを全件渡してGeminiが選別 | |
| ハイブリッド | TSで粗いフィルタ後にGeminiに渡す | |

**User's choice:** 事前圧縮（推奨）
**Notes:** トークン節約と制御可能性を重視

| Option | Description | Selected |
|--------|-------------|----------|
| 日本語 | 判断理由全体を日本語で出力 | ✓ |
| 英語 | LLM推論品質が高い可能性あり | |
| 英語+日本語要約 | 詳細は英語、表示用に日本語要約を別フィールド | |

**User's choice:** 日本語（推奨）
**Notes:** 毎日読むログなので母語が最適

---

## Function Calling設計

| Option | Description | Selected |
|--------|-------------|----------|
| シンプルJSON出力 | FCは使わず、構造化JSONを一発で返させる | ✓ |
| Function Calling対話型 | get_portfolio→分析→place_orderのステップ | |
| ハイブリッド | 情報収集はFC、判断はJSON | |

**User's choice:** シンプルJSON出力（推奨）
**Notes:** 判断は1回の応答で完結できる。Phase 1 SPIKEでFC動作は確認済みだが不要

| Option | Description | Selected |
|--------|-------------|----------|
| 全銘柄一括 | 1回のAPIコールで全銘柄判断 | ✓ |
| 銘柄別 | 銘柄ごとに個別にGeminiを呼ぶ | |

**User's choice:** 全銘柄一括（推奨）
**Notes:** 銘柄間の相関考慮、1回APIコール、10銘柄ならコンテキスト内

---

## 仮想売買の執行ロジック

| Option | Description | Selected |
|--------|-------------|----------|
| Geminiが数量指定 | AIが具体的な株数を計算 | ✓ |
| Geminiは配分率指定 | AIは%で指示、サーバーが株数変換 | |
| Geminiは売買方向のみ | AIはBUY/SELL/HOLDのみ、数量はルールベース | |

**User's choice:** Geminiが数量指定（推奨）
**Notes:** サーバー側で現金超過チェックは必須

| Option | Description | Selected |
|--------|-------------|----------|
| quantity=0で保持 | レコードを消さず、過去の情報を残す | ✓ |
| レコード削除 | テーブルがきれいに保たれるが履歴が消える | |

**User's choice:** quantity=0で保持（推奨）
**Notes:** Phase 4の過去ポジション表示に使える

| Option | Description | Selected |
|--------|-------------|----------|
| 毎日の判断完了後 | HOLD-onlyの日もスナップショット記録 | ✓ |
| 取引があったときのみ | 全ホールドの日はチャートが歯抜けになる | |

**User's choice:** 毎日の判断完了後（推奨）
**Notes:** Phase 4の時系列チャートの連続性確保

---

## エラー処理と安全装置

| Option | Description | Selected |
|--------|-------------|----------|
| リトライなし、スキップ | 失敗したらその日は終了 | |
| 1回リトライ | 30秒待ってリトライ、それでもダメならスキップ | ✓ |
| 3回リトライ | 指数バックオフで最大3回 | |

**User's choice:** 1回リトライ
**Notes:** 推奨の「リトライなし」ではなく1回リトライを選択。Vercel 60秒制限との兼ね合いに注意

| Option | Description | Selected |
|--------|-------------|----------|
| バリデーションで拒否 | 不正な判断のみスキップ、有効な判断は実行 | ✓ |
| 全体拒否 | 1つでも不正があれば全判断を拒否 | |

**User's choice:** バリデーションで拒否（推奨）
**Notes:** zodスキーマでホワイトリスト外銘柄やSHORT指示を個別スキップ

| Option | Description | Selected |
|--------|-------------|----------|
| maxDuration設定のみ | Route HandlerにmaxDuration=120を設定 | ✓ |
| 最初からキュー導入 | Inngest/QStashでバックグラウンドジョブ化 | |

**User's choice:** maxDuration設定のみ（推奨）
**Notes:** SPIKEで4-5秒。問題が出たらPhase 5で対応

---

## Claude's Discretion

- prompt builderのファイル分割構成
- TA指標の計算詳細
- Geminiパラメータ調整
- トークンコスト推定ロジック
- テストフィクスチャ構成
- 実行ログフォーマット

## Deferred Ideas

- 日本株ファンダメンタル活用 → Phase 2 deferred
- 複数エージェント並行比較 → v2 REASON-03
- リスク管理サーキットブレーカー → v2 RISK-01/02
- バックグラウンドキューフォールバック → Phase 5 OPS-04
- Geminiモデル切り替え → 実運用後に検討
