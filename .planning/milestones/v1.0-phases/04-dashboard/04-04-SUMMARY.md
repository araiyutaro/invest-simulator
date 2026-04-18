---
phase: 04-dashboard
plan: 04
subsystem: dashboard-timeline
tags: [timeline, client-component, route-handler, iron-session, pagination]
requires:
  - lib/dashboard/types.ts (TimelineDay, TimelineTrade)
  - lib/dashboard/queries.ts (getTimelineData)
  - lib/session.ts (sessionOptions, SessionData)
provides:
  - app/dashboard/components/TradeTimeline.tsx
  - app/api/dashboard/timeline/route.ts
  - TradeTimeline integration in app/dashboard/page.tsx
affects:
  - app/dashboard/page.tsx
tech-stack:
  added: [date-fns/locale/ja]
  patterns:
    - Client Component with useState/useCallback for pagination
    - Defense-in-depth auth check inside Route Handler
    - Safe integer coercion (Number + Math.floor + clamp)
    - UUID regex validation for id params
    - HTML <details open> for default-expanded accordion
key-files:
  created:
    - app/dashboard/components/TradeTimeline.tsx
    - app/api/dashboard/timeline/route.ts
  modified:
    - app/dashboard/page.tsx
decisions:
  - Reasoning text expanded by default via <details open> (Core Value D-13)
  - HOLD entries filtered in queries.ts; days with zero BUY/SELL show "この日の取引なし"
  - portfolioId passed from Server Component to Client and echoed back to API
  - Silent-fail on load-more error; disables further retries to avoid loops
metrics:
  duration_min: 5
  tasks_completed: 2
  files_created: 2
  files_modified: 1
completed: 2026-04-13
requirements: [DASH-03, DASH-05]
---

# Phase 04 Plan 04: トレードタイムライン Summary

トレードタイムラインUIと追加読み込み API を実装し、ダッシュボードの Core Value (AI の判断理由を読む体験) を完成させた。日付単位で BUY/SELL 取引をカード表示し、確信度の色分けバッジと `<details open>` による判断理由のデフォルト展開で、投資の思考プロセスが読みやすい UI を提供する。

## Overview

Plan 04-03 までで作られたパフォーマンス指標・チャート・ポジション表を下に、ダッシュボードの最重要セクションであるトレードタイムラインを追加した。Server Component の `DashboardPage` が初期 20 日分のタイムラインを `getTimelineData` で取得し、Client Component `TradeTimeline` に渡す。ユーザーが「さらに読み込む」を押すと `GET /api/dashboard/timeline` が追加 20 日分を返し、`setDays` で累積する設計。

## What Changed

### Created

**`app/dashboard/components/TradeTimeline.tsx`** — Client Component (`'use client'`)
- Props: `{ initialDays: readonly TimelineDay[]; portfolioId: string }`
- 状態: `days`, `loading`, `hasMore` を `useState` で管理
- `loadMore` は `useCallback` で memoize し、`fetch('/api/dashboard/timeline?offset=&limit=&portfolioId=')` で追加取得
- 日付は `date-fns` の `format(d, 'yyyy年MM月dd日（E）', { locale: ja })` で日本語表示
- `TradeCard` サブコンポーネント: ticker + action バッジ (BUY=青 / SELL=グレー) + confidence バッジ (high=緑 / medium=アンバー / low=赤) + `quantity 株 @ price`
- `<details open>` で「判断理由」を **デフォルト展開** (Core Value D-13)
- Empty state: 全体で 0 件なら `取引履歴はまだありません`、個別日に BUY/SELL 0 件なら `この日の取引なし`
- 通貨別価格フォーマット: JPY は `¥1,234`、他は `$1,234.56`
- `whitespace-pre-wrap` で reasoning の改行を保持

**`app/api/dashboard/timeline/route.ts`** — GET Route Handler
- `getIronSession` で認証チェック (T-04-06: proxy.ts がカバーするが defense-in-depth)
- `toSafeInt` ヘルパで `Number() + isFinite + Math.floor` → オーバーフロー/NaN 対策 (T-04-07)
- `offset = Math.max(0, ...)`、`limit = Math.min(100, Math.max(1, ...))` で DoS 防止
- `portfolioId` を UUID 正規表現 `/^[0-9a-f-]{36}$/i` で検証 (T-04-08)
- `catch` で `データの読み込みに失敗しました` のみ返す (T-04-09)
- `cookies()` は Next.js 16 で async のため `await cookies()` 済み

### Modified

**`app/dashboard/page.tsx`**
- `getTimelineData` と `TradeTimeline` を import
- `Promise.all` に `getTimelineData(portfolioId, 20, 0)` を追加 → `timelineData` 取得
- Section 4 のプレースホルダ (`タイムラインは Plan 04 で実装`) を `<TradeTimeline initialDays={timelineData} portfolioId={portfolioId} />` に置き換え

## Key Decisions

1. **`<details open>` で reasoning をデフォルト展開** — D-13 の Core Value。ユーザーが追加クリック無しに AI の判断理由を読めることを最優先。
2. **portfolioId は Client → API で echo-back** — Route Handler 側で再度 `getPortfolioId()` を呼ぶ選択肢もあったが、Client が既にサーバーから受け取っている値をクエリに付けて送る方が往復が最小で済む。UUID 正規表現でバリデーションすれば実害なし。
3. **Silent-fail on load-more error** — トースト UI 基盤がまだ無く、かつ Core Value は「履歴を読む」であり、失敗時のリカバリより既読部分の閲覧継続を優先する。`hasMore=false` でボタンを消し、リロードで再試行してもらう。
4. **`PAGE_SIZE=20`** — 定数化して Route Handler のデフォルト値と揃えた。

## Deviations from Plan

Plan doc にあったインライン実装スケッチを整理して定数抽出 (`CONFIDENCE_STYLES`, `ACTION_STYLES`, `PAGE_SIZE`) を行ったのみ。挙動は plan 仕様と完全一致。

- `[Rule 3 - Scope]` tsc で Plan 04-03 由来の既存エラー (`recharts`、`lightweight-charts-react-wrapper` 未インストール) を検出。04-04 のスコープ外のため `deferred-items.md` に記録し、このプランでは修正しない。

## Verification

- ✅ `app/dashboard/components/TradeTimeline.tsx` — 全 acceptance criteria を grep で確認 (use client, details open, 確信度色, さらに読み込む, この日の取引なし, 取引履歴はまだありません)
- ✅ `app/api/dashboard/timeline/route.ts` — getIronSession, portfolioId 検証, UUID 正規表現, 401/400/500 分岐
- ✅ `app/dashboard/page.tsx` — TradeTimeline import, Promise.all に getTimelineData, initialDays/portfolioId props
- ✅ `npx tsc --noEmit` — 04-04 スコープのファイルにエラーなし (04-03 由来のエラーは deferred に記録)

### Deferred Issues

- `recharts` と `lightweight-charts-react-wrapper` のパッケージ未インストール (Plan 04-03 スコープ、`deferred-items.md` に記録)

### User Story Verification

Full flow (per `<verification>` mode:summary):
- Browser: ダッシュボードページ下部にトレードタイムラインが表示される
- Server: 初期レンダリング時 `getTimelineData(portfolioId, 20, 0)` で取得、Client fetch で追加ロード
- Data flow: `decisions.transcript` (JSONB) → `parseTimelineFromDecision` → `trades` テーブルで executed price をオーバーレイ → UI 表示
- Env: `SESSION_SECRET` (既存)、`DATABASE_URL` (既存)、新規 env var なし

## Commits

- `5e97830` feat(04-04): add TradeTimeline component with reasoning expanded by default
- `d688937` feat(04-04): add timeline API route and integrate TradeTimeline into dashboard

## Known Stubs

なし — TradeTimeline は実データ (`getTimelineData` の戻り値) を直接レンダリングし、プレースホルダや mock data への接続はない。

## Threat Flags

新規 threat surface は全て 04-04-PLAN の `<threat_model>` (T-04-06 〜 T-04-09) でカバー済み。追加フラグなし。

## Self-Check: PASSED

- ✅ `app/dashboard/components/TradeTimeline.tsx` exists
- ✅ `app/api/dashboard/timeline/route.ts` exists
- ✅ `app/dashboard/page.tsx` contains `TradeTimeline` and `getTimelineData`
- ✅ commit `5e97830` exists in git log
- ✅ commit `d688937` exists in git log
