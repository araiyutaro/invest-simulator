---
phase: 04-dashboard
plan: 01
subsystem: dashboard-foundation
tags: [ui, tailwind-v4, dark-theme, charts, foundation]
requires:
  - Phase 1 globals.css + layout.tsx bootstrap
  - Phase 1 /dashboard route and proxy.ts auth guard
  - Phase 2 tickers whitelist infrastructure
provides:
  - Dark theme (slate-900 base) via Tailwind v4 @theme inline
  - DashboardHeader server component (app name + sign-out)
  - Dashboard page shell (4-section layout: performance, portfolio, positions, timeline)
  - lightweight-charts, lightweight-charts-react-wrapper, recharts installed
  - 1306.T TOPIX ETF whitelist entry for JP benchmark
affects:
  - Plan 04-02 (PerformanceGrid) builds into Section 1
  - Plan 04-03 (PortfolioChart, PositionsTable, AllocationChart) builds into Sections 2-3
  - Plan 04-04 (TradeTimeline) builds into Section 4
  - Phase 2 data pipeline will now auto-backfill 1306.T price snapshots
tech_stack_added:
  - lightweight-charts@5.1.0
  - lightweight-charts-react-wrapper@2.1.1
  - recharts@3.8.1
patterns:
  - Tailwind v4 @theme inline CSS variables (no dark: prefix, dark is base)
  - Server Component header with native HTML form action for sign-out
  - async page component (prepared for DB queries in Plan 03)
key_files_created:
  - app/dashboard/components/DashboardHeader.tsx
key_files_modified:
  - app/globals.css
  - app/layout.tsx
  - app/dashboard/page.tsx
  - config/tickers.ts
  - package.json
  - package-lock.json
decisions:
  - Followed D-03: dark theme as base (no dark: class prefix)
  - Followed D-07: 1306.T as JP benchmark ETF
  - Omitted unused sessionOptions import from DashboardHeader (plan had it as leftover; not used in render)
metrics:
  tasks_completed: 2
  duration_minutes: ~5
  files_changed: 6
  commits: 2
requirements_completed:
  - DASH-01
  - DASH-02
---

# Phase 4 Plan 01: Dashboard Foundation Summary

ダッシュボード基盤: Tailwind v4 ダークテーマ + DashboardHeader + 4セクションページシェル + チャートライブラリインストール + 1306.T ホワイトリスト追加。

## Executive Summary

Phase 4 全Planの共通基盤を確立した。ダークテーマ配色（slate-900ベース、`dark:` prefix不使用）を Tailwind v4 `@theme inline` で宣言し、ページシェルに4セクション（パフォーマンス、ポートフォリオ推移、ポジション、タイムライン）を配置。後続の Plan 02-04 はこのシェルの各セクションにコンポーネントを差し込む形で独立開発可能になった。

チャート用ライブラリ（`lightweight-charts`, `lightweight-charts-react-wrapper`, `recharts`）を RESEARCH.md で確認済みバージョンでインストール。1306.T TOPIX 連動 ETF を `config/tickers.ts` に追加し、Phase 2 のデータ取得パイプラインが自動的に 1306.T の価格スナップショットを蓄積するようにした（Plan 04-03 の PortfolioChart で SPY と並ぶ JP ベンチマークとして使用）。

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | ダークテーマ globals.css + layout.tsx 更新 + DashboardHeader | 6bbab4c | app/globals.css, app/layout.tsx, app/dashboard/components/DashboardHeader.tsx |
| 2 | チャートライブラリ + 1306.T ホワイトリスト + ページシェル | 602e5f3 | package.json, package-lock.json, config/tickers.ts, app/dashboard/page.tsx |

## Key Changes

### Dark Theme (app/globals.css)
- `:root` ライトテーマ変数と `@media (prefers-color-scheme: dark)` ブロックを完全削除
- `font-family: Arial, Helvetica, sans-serif` を削除（Geist Sans を `--font-sans` で統一）
- Tailwind v4 `@theme inline` で 13 個の CSS 変数宣言（background, surface, surface-elevated, border, text-primary, text-muted, text-neutral, accent-blue/green/red/amber, font-sans, font-mono）
- `body` は `background-color: var(--color-background)` と `color: var(--color-foreground)` のみ

### Layout (app/layout.tsx)
- `lang="en"` → `lang="ja"`
- `<body>` に `font-sans` クラス追加（Tailwind v4 の `--font-sans` が Geist に解決される）
- metadata: `"Create Next App"` → `"AI投資観察ダッシュボード"` / description 更新

### DashboardHeader (app/dashboard/components/DashboardHeader.tsx)
- Server Component（"use client" なし）
- Native HTML form で `/api/auth/logout` に POST → JS 不要
- `h-14 px-8 bg-slate-900 border-b border-slate-800` レイアウト（UI-SPEC 準拠）

### Ticker Whitelist (config/tickers.ts)
- SPY の直後に 1306.T を挿入
- `{ symbol: '1306.T', market: 'JP', name: 'TOPIX連動型上場投信', currency: 'JPY', assetClass: 'etf' }`

### Page Shell (app/dashboard/page.tsx)
- `async function DashboardPage()` に変更（Plan 03 での DB クエリに備えて）
- `<main className="max-w-7xl mx-auto px-8 py-12 space-y-12">` で UI-SPEC の外枠を実装
- 4 `<section>` 要素を D-02 の順序で配置（パフォーマンス → ポートフォリオ → ポジション → タイムライン）
- 各セクションは見出し + placeholder text（実コンポーネントは Plan 03, 04 で差し替え）

## Deviations from Plan

### Minor: Unused import omitted

**[Rule 1 - Cleanup] DashboardHeader から `sessionOptions` import を削除**
- **発見:** Plan 仕様では `import { sessionOptions } from '@/lib/session'` を含めていたが、コンポーネントの描画ロジックで使用されていない
- **Issue:** `lib/session.ts` は `import 'server-only'` をトリガーとするため、未使用 import は lint 警告とビルド時の無駄な依存解決を引き起こす
- **Fix:** 未使用 import を削除。DashboardHeader は sign-out form（native HTML POST）で完結しており session state を読む必要なし。proxy.ts が `/dashboard` への未認証アクセスを既に保護済み
- **Files modified:** app/dashboard/components/DashboardHeader.tsx
- **Commit:** 6bbab4c

それ以外は計画通り実行。

## Verification Results

| Check | Result |
|-------|--------|
| `grep "#0f172a" app/globals.css` | PASS |
| `grep "AI投資観察ダッシュボード" DashboardHeader.tsx` | PASS |
| `grep 'lang="ja"' app/layout.tsx` | PASS |
| `grep "1306.T" config/tickers.ts` | PASS |
| `grep "DashboardHeader" app/dashboard/page.tsx` | PASS |
| `lightweight-charts` / `lightweight-charts-react-wrapper` / `recharts` in package.json | PASS |
| `npx tsc --noEmit` | PASS (0 errors) |

## Acceptance Criteria Met

Task 1:
- [x] globals.css に `--color-background: #0f172a` 含む
- [x] globals.css に `--color-surface: #1e293b` 含む
- [x] globals.css に `prefers-color-scheme` 含まない
- [x] globals.css に `font-family: Arial` 含まない
- [x] layout.tsx に `lang="ja"` 含む
- [x] layout.tsx metadata の title が `AI投資観察ダッシュボード`
- [x] layout.tsx body に `font-sans` クラス
- [x] DashboardHeader に `AI投資観察ダッシュボード`
- [x] DashboardHeader に `サインアウト`
- [x] DashboardHeader に `h-14 px-8 bg-slate-900 border-b border-slate-800`

Task 2:
- [x] config/tickers.ts に 1306.T TOPIX ETF エントリ
- [x] package.json dependencies に `lightweight-charts`
- [x] package.json dependencies に `lightweight-charts-react-wrapper`
- [x] package.json dependencies に `recharts`
- [x] page.tsx が DashboardHeader を import
- [x] page.tsx が `max-w-7xl mx-auto px-8 py-12 space-y-12` 含む
- [x] page.tsx が 4 `<section>` を D-02 順序で配置
- [x] `npx tsc --noEmit` が 0 で終了

## Authentication Gates

None.

## Threat Flags

None. `/dashboard` は proxy.ts で既に認証保護されており、DashboardHeader の sign-out form は既存の `/api/auth/logout` POST endpoint を再利用するのみ。新規のネットワーク表面・trust boundary は増えていない。

## Known Stubs

各セクションの placeholder text は意図的なもの（Plan 04-02, 04-03, 04-04 が差し替える）。PLAN.md で明示されているため stub tracking 対象外。

## Next Steps

- **Plan 04-02:** PerformanceGrid 実装（Section 1 差し替え）
- **Plan 04-03:** PortfolioChart + PositionsTable + AllocationChart 実装（Section 2, 3 差し替え）
- **Plan 04-04:** TradeTimeline 実装（Section 4 差し替え）

Phase 2 データ取得が次回実行されたときから 1306.T の価格スナップショットが蓄積開始される見込み。

## Self-Check: PASSED

**Files verified:**
- FOUND: app/globals.css
- FOUND: app/layout.tsx
- FOUND: app/dashboard/components/DashboardHeader.tsx
- FOUND: app/dashboard/page.tsx
- FOUND: config/tickers.ts

**Commits verified:**
- FOUND: 6bbab4c (Task 1)
- FOUND: 602e5f3 (Task 2)
