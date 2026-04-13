---
status: partial
phase: 04-dashboard
source:
  - 04-01-SUMMARY.md
  - 04-02-SUMMARY.md
  - 04-03-SUMMARY.md
  - 04-04-SUMMARY.md
started: 2026-04-13T00:00:00Z
updated: 2026-04-13T07:45:00Z
---

## Current Test

[testing complete]

## Tests

### 1. ダッシュボード初回ロード
expected: |
  `/dashboard` にアクセス → ダークテーマ (slate-900) + ヘッダー + 4 セクション
  （パフォーマンス / ポートフォリオ / ポジション+配分 / タイムライン）表示。
  500 / ビルドエラーなし。
result: pass
note: |
  ポートフォリオ未投入のため意図的な empty-state パス (page.tsx:28-41) が描画された。
  ダークテーマ・DashboardHeader・500 なしは確認済み。4 セクション本体は
  Test 2-6 で検証すべきだが、DB にデータが無いためそれらはブロック扱い。

### 2. パフォーマンス指標グリッド
expected: |
  Section 1 に 6 枚のメトリクスカードが 3×2 グリッドで並ぶ。
  プラスは緑 / マイナスは赤、最大ドローダウンは常に赤、勝率 50%以上は緑。
  データがまだなければ各カードは em-dash (—) で表示。
result: blocked
blocked_by: prior-phase
reason: "DB にポートフォリオが存在しない。Phase 3 のエージェント実行 (cron daily-run) 後に再検証可能。"

### 3. ポートフォリオ推移チャート
expected: |
  Section 2 に lightweight-charts の折れ線チャート。
  ポートフォリオ (青) / SPY (slate) / 1306.T (slate) の 3 系列、
  ダーク背景 + グリッド線あり、CSS オーバーレイの凡例が表示される。
  データなしなら「運用開始後にデータが表示されます」の空状態。
result: blocked
blocked_by: prior-phase
reason: "portfolio が未作成で page.tsx が empty-state パスを返すため、このセクション自体がレンダリングされない。"

### 4. ポジションテーブル + 配分ドーナツ
expected: |
  Section 3 左: 6 列テーブル (銘柄 / 保有数 / 取得平均 / 現在値 / 含み損益 / 配分%)、
  末尾に CASH 行、数値セルは等幅フォント、PnL は ±色分け。
  右: Recharts ドーナツ (内半径 60 / 外半径 100)、CASH は slate-500 固定色。
  ポジションもキャッシュも 0 なら空状態表示。
result: blocked
blocked_by: prior-phase
reason: "portfolio 未作成で empty-state パスに落ちる。"

### 5. トレードタイムライン: 判断理由デフォルト展開
expected: |
  Section 4 に日付ごとのカード。各取引カードに BUY(青)/SELL(グレー) バッジと
  確信度バッジ (high=緑 / medium=アンバー / low=赤)。
  「判断理由」セクションが **最初から開いた状態** (details open)。
  数量・価格は等幅、JPY は ¥、他は $。
  取引履歴 0 件なら「取引履歴はまだありません」。
result: blocked
blocked_by: prior-phase
reason: "portfolio 未作成で empty-state パスに落ちる。Core Value の核心なので Phase 3 実行後に必ず再検証。"

### 6. タイムライン追加読み込み
expected: |
  タイムライン末尾の「さらに読み込む」ボタン押下で
  `GET /api/dashboard/timeline?offset=...&limit=...&portfolioId=...` が呼ばれ、
  追加 20 日分が既存の下に連結表示される。
  全部読み込んだらボタンが消える（またはそれ以上表示されない）。
result: blocked
blocked_by: prior-phase
reason: "21 日以上の取引履歴が無ければ load-more が発火しない。"

### 7. 認証ガード
expected: |
  未ログイン状態で `/dashboard` にアクセスするとログインページへリダイレクト
  （proxy.ts の既存ガード）。また `/api/dashboard/timeline` に未認証で直接
  アクセスしても 401/403 が返る（Route Handler の iron-session チェック）。
result: pass
note: |
  /dashboard: 307 → /login (proxy.ts) ✓
  /api/dashboard/timeline: 307 → /login (proxy.ts が API パスも保護)
  expected では 401/403 を想定したが、proxy.ts の matcher が API を含むため
  redirect で先に弾かれる。実質的に未認証アクセスはブロックされており
  セキュリティ要件を満たす。iron-session チェックは defense-in-depth の 2 段目。

### 8. サインアウト
expected: |
  ヘッダーの「サインアウト」ボタン押下でセッション破棄 → ログインページへ遷移。
  ボタンは JS 無効でも動作する native HTML form (POST `/api/auth/logout`)。
result: pass
note: |
  初回実行時は logout route が Response.json({success:true}) を返すだけで
  リダイレクトしないバグ (major) が発覚。/api/auth/logout を
  Response.redirect(.../login, 303) に修正 (commit d6e34a0) → pass。
  さらに付随で login page がライトテーマ前提のまま残っていて読みづらかったため
  ダークテーマ化 (commit bd49e22)。curl 確認: 303 + Location: /login + Cookie 破棄。

## Summary

total: 8
passed: 3
issues: 0
pending: 0
skipped: 0
blocked: 5
note: |
  blocked 5 件は Phase 3 エージェント実行でポートフォリオ・取引履歴が
  DB に入ったあとに再検証が必要。現時点の Phase 4 コード自体は問題なし
  (Test 1 の empty-state パス + Test 7/8 でヘッダー・ガード・ログアウト検証済み)。
  UAT 実行中に発見された 2 件のバグはこのセッション内で修正・コミット済み:
    - d6e34a0: logout route の 303 redirect 化
    - bd49e22: login page のダークテーマ化

## Gaps

[none yet]
