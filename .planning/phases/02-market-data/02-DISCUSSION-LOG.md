# Phase 2: Market Data - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-12
**Phase:** 02-market-data
**Mode:** User delegated all gray areas to Claude's discretion (フルおまかせ)
**Areas discussed:** Ticker Whitelist, News/Fundamentals Storage, Market Calendar & Fallback, Entry Point & Backfill, FX Rate

---

## Ticker Whitelist

| Option | Description | Selected |
|--------|-------------|----------|
| ハードコード TS ファイル (`config/tickers.ts`) | 型安全、git 管理、無料、編集フロー明快 | ✓ |
| DB テーブル | ランタイム編集可能だが、1 人運用では過剰 | |
| env 変数（カンマ区切り） | 設定簡単だがメタデータ付けにくい | |

**Claude's choice:** ハードコード TS ファイル
**Initial count:** 米国 6（AAPL, MSFT, NVDA, GOOGL, AMZN, SPY）+ 日本 4（7203.T, 6758.T, 9984.T, 7974.T）
**Rationale:** 個人プロジェクト、git が自然なレビュー履歴を提供、型安全と高い可搬性。SPY は Phase 4 ベンチマークに必須。

---

## News & Fundamentals Storage

| Option | Description | Selected |
|--------|-------------|----------|
| Phase 2 で圧縮済みテキスト保存 | prompt 直前のコストゼロ、ただし再実験不可 | |
| Phase 2 raw 保存 + Phase 3 で圧縮 | 生データ保持で実験自由度、責務分離 | ✓ |
| 圧縮せず prompt 時全文投入 | トークンコスト暴発 | |

**Claude's choice:** raw 保存 + Phase 3 圧縮
**Storage shape:** 専用 `news_snapshots` / `fundamentals_snapshots` テーブル（price_snapshots JSONB 埋め込みはクエリしづらいため却下）
**Fundamentals scope:** 米国株のみ（日本株は Phase 3 で必要性が判明したら追加）

---

## Market Calendar & Fallback Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| 土日 skip のみ（祝日無視） | 最短実装だが、休場日に空データ書込みで監査性低下 | |
| 土日 + ハードコード祝日リスト（2026 年分） | シンプル、年次更新必要だが個人運用で十分 | ✓ |
| `nyse-holidays` npm 依存 | 保守フリーだが依存追加、JP 対応別途必要 | |

**Claude's choice:** 土日 + config/market-holidays.ts (2026 US + JP 一覧)

**Fallback trigger (yahoo → Stooq):**
- 例外 OR 空レスポンス OR `latest date > 1 営業日古い`
- **Rationale:** yahoo-finance2 は非公式、silent failure（Alpha Vantage 型）を検知するため stale check 必須

**market_closed 行:** 休場日にも行を作成（OHLCV NULL、`source='none'`）。行の不在 = 取得漏れ、行の存在 = 監査完了を区別できる。

---

## Entry Point & Backfill

| Option | Description | Selected |
|--------|-------------|----------|
| Phase 2 独立 `/api/cron/fetch-market-data` | 手動トリガ/デバッグが楽、Phase 5 で独立スケジュール可能 | ✓ |
| Phase 3 daily-run にインライン埋め込み | ルート 1 つで完結、ただし責務混在 | |

**Claude's choice:** 独立エンドポイント

**Backfill policy:**
- 初回: 100 営業日（RSI 14 / MACD 26 / SMA 50 の計算余裕）
- 以降: T-1 のみ増分
- バックフィル自体は **ローカル CLI** (`scripts/backfill.ts`) から実行（Vercel Hobby 60 秒制限超過するため）
- 日次 T-1 取得は 30 calls / ~1 分で Vercel Hobby 内完走

---

## FX Rate Ingestion

| Option | Description | Selected |
|--------|-------------|----------|
| yahoo-finance2 `JPY=X` | 既存 SDK 統一、追加 API キー不要 | ✓ |
| Finnhub forex | 有料プラン必要 | |
| ECB API | EUR 基軸、USD/JPY は逆算必要 | |

**Claude's choice:** yahoo-finance2 `JPY=X`
**Frequency:** 1 日 1 レコード（NY クローズ後確定値）
**Storage:** `price_snapshots` に `symbol='JPYUSD'`, `assetClass='fx'` として 1 行追加（別テーブル作成せず既存スキーマ活用）

---

## Claude's Discretion Areas

（以下はプランナー/エグゼキューターの判断に委ねる）
- マイグレーション分割戦略
- `lib/market/` 配下のファイル分割
- Ticker whitelist 実装詳細（Map vs Array）
- Promise.all の並列度（throttle 必要性）
- テストフィクスチャの保存形式
- `market_closed` 行の NULL 列選定
- ログ verbosity
- エラークラス階層

## Deferred Ideas

- 日本株ファンダメンタル取得（Phase 3 で必要時）
- TA 指標の事前計算キャッシュ
- 2027 年以降の祝日カレンダー
- コーポレートアクション自動検知再計算
- `fetch_failures` ログテーブル

---

*All decisions logged: 2026-04-12*
