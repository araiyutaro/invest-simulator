# Phase 3: Agent Pipeline - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Geminiが市場データ（価格・ニュース・ファンダメンタル・ポジション）を参照して買い/売り/ホールドを判断し、full transcript（JSONB）と仮想トレード結果がDBに永続化されるエージェントパイプラインを構築する。

**Scope:**
- Geminiへのプロンプト設計（システムプロンプト、ニュース圧縮、TA指標組み立て）
- 構造化JSON出力スキーマの定義とzodバリデーション
- 仮想売買の執行ロジック（trades/positions/cash更新）
- `/api/cron/daily-run` Route Handler（CRON_SECRET認証）
- `decisions` テーブルへのfull transcript・token count・estimated cost保存
- `portfolio_snapshots` への日次スナップショット記録
- 冪等性ガード（同日2回発火防止）
- ポートフォリオ初期化（仮想資金1,000万円）

**Out of scope for this phase:**
- ダッシュボードUI（Phase 4）
- Vercel Cron本番スケジューリング（Phase 5）
- Fluid Computeフォールバックキュー導入（Phase 5、必要時のみ）
- 複数エージェント並行比較（v2 REASON-03）
- リスク管理サーキットブレーカー（v2 RISK-01/02）

</domain>

<decisions>
## Implementation Decisions

### プロンプト設計

- **D-01:** システムプロンプトのトーンは**観察重視型**。パフォーマンス最大化ではなく、「なぜそう判断したか」の思考プロセスを日本語で読みやすく説明させることを最優先する。Core Valueに直結。
- **D-02:** ニュース圧縮（AGENT-03）は**事前圧縮方式**。prompt builderのTypeScriptロジックで、DBから取得したraw newsをticker別3ヘッドライン+1行要約に圧縮してからプロンプトに埋め込む。Geminiにはraw newsを渡さない（トークン節約、制御可能）。
- **D-03:** 判断理由（reasoning）の言語は**日本語**。システムプロンプトで「全ての分析と判断理由を日本語で記述せよ」と明示する。
- **D-04:** ニュースは `<external_news_content>` XMLタグで囲み、プロンプトインジェクション対策として「信頼できない外部入力」と明示する（AGENT-06）。

### 判断フロー

- **D-05:** Function Callingは使わず、**構造化JSON出力**方式を採用する。全情報をプロンプトに事前に埋め込み、Geminiからは1回の応答で判断JSONを返させる。Phase 1 SPIKEでFC動作は確認済みだが、1回完結の判断にはJSONモードのほうがシンプル。
- **D-06:** **全銘柄一括判断**。ポートフォリオ全体と全銘柄の情報を1回のAPIコールで渡し、銘柄間の相関を考慮した全体最適の判断を返す。10銘柄ならコンテキスト内に十分収まる。
- **D-07:** Geminiが返すJSONスキーマ:
  ```json
  {
    "market_assessment": "全体の市場環境分析（日本語）",
    "decisions": [
      {
        "ticker": "AAPL",
        "action": "BUY" | "SELL" | "HOLD",
        "quantity": 10,
        "confidence": "high" | "medium" | "low",
        "reasoning": "この銘柄の判断理由（日本語）"
      }
    ]
  }
  ```
  zodスキーマでパースし、不正な値は個別にスキップする。

### 仮想売買の執行ロジック

- **D-08:** Geminiが**具体的な株数を指定**する。プロンプトには現金残高と各銘柄の現在価格を含め、AIが数量を計算する。サーバー側で現金超過チェックを行い、超過時はその注文を拒否する（EXEC-03）。
- **D-09:** 約定価格はその日の**Close価格**を使用（EXEC-02）。price_snapshotsから当日の`close`カラムを参照。
- **D-10:** JPY換算はtrade実行時に`price_snapshots`のFXレート（`JPYUSD`行）を参照し、USD銘柄の約定金額をJPYに変換する（Phase 1 D-03の実装）。
- **D-11:** 売却でquantity=0になったpositionsレコードは**削除せず`quantity=0`で保持**する。過去のavgCostと履歴情報が残り、Phase 4の過去ポジション表示に使える。
- **D-12:** **portfolio_snapshots**はdaily-runの最後に毎日記録する（HOLD-onlyの日も含む）。全ポジションの現在価値（close×数量×FXレート）+現金残高を集計し1行追加。Phase 4の時系列チャートデータ源。
- **D-13:** ポートフォリオ初期化は`portfolios`テーブルにレコードがない場合に`initial_cash=10000000`（1,000万JPY）で自動作成する（EXEC-01）。

### エラー処理と安全装置

- **D-14:** Gemini APIエラー時は**30秒待って1回リトライ**。2回目も失敗したら、その日のdecisionsに「失敗」レコード（transcript内にエラー情報）を保存して終了。翌日の定時実行で自然復帰。
- **D-15:** Geminiの判断JSONはzodスキーマでバリデーション。**ホワイトリスト外の銘柄やSHORT指示は個別にスキップ**し、有効な判断のみ実行する。スキップ理由はtranscriptに記録（AGENT-06対策）。
- **D-16:** 冪等性は`decisions (portfolio_id, run_date)` UNIQUE制約で担保（Phase 1 D-04）。同日2回目のCron発火は`INSERT ON CONFLICT DO NOTHING`でスキップ。
- **D-17:** Vercelタイムアウト対策は**Route HandlerにmaxDuration=120を設定**するのみ。Phase 1 SPIKEでGemini応答は4-5秒、10銘柄でも60秒以内に十分収まる見込み。実際にタイムアウトが発生した場合はPhase 5でキューフォールバック（OPS-04）を検討。

### Claude's Discretion

- prompt builderのファイル分割構成（`lib/agent/prompt-builder.ts`, `lib/agent/executor.ts`等）
- TA指標（RSI/MACD/SMA）の計算ライブラリ使い方の詳細
- Geminiのtemperature/topP等のパラメータ調整
- トークンコスト推定のロジック（input/output tokens × 単価）
- テストフィクスチャ（Gemini応答のモック）の構成
- daily-runの実行ログのフォーマット

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-Level
- `.planning/PROJECT.md` §Key Decisions — AI Layer Confirmed（gemini-2.5-flash）、仮想資金1000万円、現物ロングのみ
- `.planning/REQUIREMENTS.md` — AGENT-01〜07, EXEC-01〜05 の受け入れ条件
- `.planning/ROADMAP.md` §Phase 3 — Success criteria 5項目

### Prior Phase Decisions
- `.planning/phases/01-foundation/01-CONTEXT.md` — D-01 JSONB transcript, D-02 numeric(18,4), D-03 JPY単一ポートフォリオ, D-04 冪等性UNIQUE, D-07 Gemini API選定
- `.planning/phases/02-market-data/02-CONTEXT.md` — D-05 raw news永続化（LLM圧縮はPhase 3）, D-06 news/fundamentals別テーブル, D-20 独立エンドポイント設計, D-25 FXレート取得

### Source Code (already implemented — read before planning)
- `lib/ai/client.ts` — Gemini client singleton（`genAI`, `GEMINI_MODEL='gemini-2.5-flash'`）
- `db/schema.ts` — 全テーブル定義（portfolios, positions, trades, decisions, priceSnapshots, newsSnapshots, fundamentalsSnapshots, portfolioSnapshots）、`DecisionTranscript`型
- `db/index.ts` — Drizzle client singleton with server-only guard
- `config/tickers.ts` — ティッカーホワイトリスト定義
- `lib/market/` — Phase 2実装済みの市場データ取得層
- `lib/env.ts` — 環境変数検証（GEMINI_API_KEY含む）
- `proxy.ts` — `/api/cron/*` bypass対象
- `app/api/cron/fetch-market-data/route.ts` — Phase 2のデータ取得エンドポイント

### External Docs (fetch via Context7 during planning)
- `@google/generative-ai` v0.24 — `generateContent` with JSON mode, `responseSchema` option
- `technicalindicators` npm — RSI, MACD, SMA/EMA の計算API
- `zod` — Gemini応答のランタイム検証スキーマ

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`lib/ai/client.ts`**: `genAI`（GoogleGenerativeAI singleton）と`GEMINI_MODEL`定数。Phase 1 SPIKEで動作確認済み
- **`db/schema.ts`**: `DecisionTranscript`型が既に定義済み — `system_prompt`, `user_prompt`, `raw_messages`, `input_data_snapshot`, `tool_calls`, `usage`フィールド
- **`config/tickers.ts`**: ホワイトリスト定義。バリデーション関数`isWhitelisted()`が使用可能
- **`lib/market/`**: 全市場データ取得層が実装済み（orchestrator, persist, clients）
- **`db/index.ts`**: server-only Drizzle client — 全DB操作はこれをimport

### Established Patterns
- **server-only guard**: `import 'server-only'`を全`lib/`モジュール冒頭に置く
- **環境変数fail-fast検証**: `lib/env.ts`でzod parse、起動時にthrow
- **Route Handler = 書き込みエントリ**: `/api/cron/*`パターンはproxy.ts bypass済み
- **冪等upsert**: `(symbol, priceDate)` UNIQUE制約 + `onConflictDoNothing()`パターン（Phase 2で確立）
- **CRON_SECRET認証**: `app/api/cron/fetch-market-data/route.ts`に実装パターンあり

### Integration Points
- **`proxy.ts`**: `/api/cron/daily-run`は自動的にbypass対象（`/api/cron/*`マッチ）
- **Phase 2 `fetchMarketData()`**: daily-run開始時に当日データが未取得なら内部直接呼び出し（Phase 2 D-20）
- **`priceSnapshots`テーブル**: Close価格取得元（約定価格）、FXレート取得元
- **`newsSnapshots` / `fundamentalsSnapshots`**: prompt builderがクエリして圧縮に使う
- **`portfolioSnapshots`テーブル**: daily-run最後にスナップショット1行追加

</code_context>

<specifics>
## Specific Ideas

- **プロンプト構造案**: システムプロンプト（投資観察AI役割設定）→ ユーザープロンプト（market_assessment + 銘柄別情報 + 現在ポジション + 出力JSON schema指示）
- **TA指標**: `technicalindicators`ライブラリでRSI(14), MACD(12,26,9), SMA(20,50)を計算し、直近値をプロンプトに含める。過去100営業日分のbackfillデータ（Phase 2）で計算可能
- **トークンコスト推定**: Gemini 2.5 Flashの料金表（input/outputトークン単価）をハードコードし、`usage.total_tokens × 単価`で`token_cost_estimate`に記録（AGENT-07）
- **ニュース圧縮ロジック**: `newsSnapshots`からticker別に最新日付の上位3件を取り、headlineをそのまま使用 + 全headlineを結合して1行要約文を生成（TSで文字数制限カット、LLM要約は使わない）

</specifics>

<deferred>
## Deferred Ideas

- **日本株ファンダメンタル取得と活用** — Phase 2 D-07で除外。エージェントが必要とした時点で追加検討
- **複数エージェント並行比較** — v2 REASON-03
- **リスク管理サーキットブレーカー** — v2 RISK-01/02（最大ポジションサイズ制限、日次損失上限）
- **バックグラウンドキューフォールバック** — Phase 5 OPS-04（実際にタイムアウトが発生した場合のみ）
- **Geminiモデル切り替え戦略** — `gemini-2.5-pro`への切替はコスト・精度トレードオフを実運用で見てから
- **TA指標の事前計算キャッシュ** — 実行時計算が遅ければPhase 5以降で検討（Phase 2 deferred）

### Reviewed Todos (not folded)

（該当なし）

</deferred>

---

*Phase: 03-agent-pipeline*
*Context gathered: 2026-04-12*
