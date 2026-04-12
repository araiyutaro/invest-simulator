---
phase: 04-dashboard
plan: 03
subsystem: dashboard-ui
tags: [dashboard, react, next, lightweight-charts, recharts]
requires:
  - 04-01 (dark theme tokens, DashboardHeader shell)
  - 04-02 (lib/dashboard/{types,metrics,queries}.ts)
provides:
  - app/dashboard/components/PerformanceGrid.tsx
  - app/dashboard/components/PortfolioChart.tsx
  - app/dashboard/components/PortfolioChartClient.tsx
  - app/dashboard/components/PositionsTable.tsx
  - app/dashboard/components/AllocationChart.tsx
  - app/dashboard/components/AllocationChartClient.tsx
  - app/dashboard/page.tsx (upper 3 sections wired)
affects:
  - /dashboard route — now renders real metrics, chart, positions, donut
tech-stack:
  added:
    - lightweight-charts-react-wrapper (already in package.json)
    - recharts (already in package.json)
  patterns:
    - Server Component page + client wrapper for dynamic({ ssr: false }) charts
    - Server-side %正規化 before passing to chart components
    - Promise.all parallel DB fetch
key-files:
  created:
    - app/dashboard/components/PerformanceGrid.tsx
    - app/dashboard/components/PortfolioChart.tsx
    - app/dashboard/components/PortfolioChartClient.tsx
    - app/dashboard/components/PositionsTable.tsx
    - app/dashboard/components/AllocationChart.tsx
    - app/dashboard/components/AllocationChartClient.tsx
  modified:
    - app/dashboard/page.tsx
decisions:
  - Added client wrapper components (PortfolioChartClient, AllocationChartClient) so that `dynamic(..., { ssr: false })` can be used; Next.js 16 forbids this pattern in Server Components.
  - PerformanceGrid treats maxDrawdown as a positive input (matches calculateMetrics contract) and flips the sign for display as "-X.XX%".
  - PositionsTable empty state only renders when both positions.length === 0 and cash === 0 — otherwise the CASH row should still appear.
  - AllocationChart filters zero-value slices before rendering to avoid invisible arcs, but preserves CASH color pinning (slate-500 for the last slice).
metrics:
  duration: ~20 min
  completed: 2026-04-13
---

# Phase 04 Plan 03: Dashboard Integration Summary

Wired up the upper three dashboard sections (performance grid, portfolio chart, positions table + allocation donut) by creating four presentation components plus two client wrappers and integrating them into the Server Component page.

## What Shipped

- **PerformanceGrid** (Server Component) — 6 metric cards in a 3×2 grid. Follows UI-SPEC color rules: `text-green-400`/`text-red-400` for signed metrics, always-red for max DD, ≥50% green for win rate, neutral `text-slate-300` for trade count. Handles `metrics === null` with em-dashes in every card.
- **PortfolioChart** (`'use client'`) — lightweight-charts-react-wrapper line chart. Three `<LineSeries>` (blue-400 portfolio, slate-500 SPY, slate-600 1306.T), dark layout/grid colors from UI-SPEC, CSS-overlay legend, empty state div with `aria-label="ポートフォリオ推移チャート"` and "運用開始後にデータが表示されます".
- **PortfolioChartClient** (`'use client'`) — thin wrapper that does `dynamic(() => ..., { ssr: false })` for PortfolioChart. Needed because Next.js 16 disallows `ssr: false` in Server Components (see `node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md` line 94).
- **PositionsTable** (Server Component) — 6-column table (銘柄/保有数/取得平均価格/現在価格/含み損益/配分比率), mono font on numeric cells, ±color on PnL, trailing CASH row, empty state text when both positions and cash are zero.
- **AllocationChart** (`'use client'`) — Recharts `ResponsiveContainer` → `PieChart` → `Pie` donut (`innerRadius={60}`, `outerRadius={100}`). 10-color palette, CASH pinned to slate-500 (`#64748b`). Custom tooltip showing "`{name}: {N.N}%`" against slate-800 background.
- **AllocationChartClient** (`'use client'`) — matching dynamic wrapper for AllocationChart.
- **app/dashboard/page.tsx** — now a Server Component that: (1) gets portfolioId with try/catch fallback to "ポートフォリオが見つかりません" empty state, (2) `Promise.all`-fetches chart/positions/perf data, (3) calls `calculateMetrics` + `normalizeToPercent`, (4) renders four `<section>` elements with aria labels.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Next.js 16 forbids `dynamic({ ssr: false })` in Server Components**

- **Found during:** Task 3 pre-flight check of `node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md`
- **Issue:** The plan's task 3 code sample calls `dynamic(() => import('./components/PortfolioChart'), { ssr: false })` directly inside the Server Component `app/dashboard/page.tsx`. Next.js 16 explicitly errors on this pattern: "`ssr: false` is not supported in Server Components" (lazy-loading.md line 94–95). The RESEARCH.md Pitfall 1 snippet predates Next 16's stricter rule.
- **Fix:** Created two client-side wrapper components (`PortfolioChartClient.tsx`, `AllocationChartClient.tsx`) that live in a `'use client'` boundary and perform the `dynamic(..., { ssr: false })` call there. `page.tsx` imports the wrappers as regular static imports. This preserves the intent (SSR bailout for canvas/SVG libraries that may touch browser APIs) while complying with the Next 16 rule.
- **Files modified:** `app/dashboard/components/PortfolioChartClient.tsx` (new), `app/dashboard/components/AllocationChartClient.tsx` (new), `app/dashboard/page.tsx`
- **Commit:** `b36841c`

### Acceptance Criteria Mapping

The plan's raw acceptance criteria asked for `ssr: false` grepable in `page.tsx` itself. Post-deviation, the string `ssr: false` now lives in the client wrappers instead. The intent of the criterion (SSR is disabled for chart components) is preserved — the wrappers are transparent from page.tsx's perspective. No other acceptance criteria were affected.

## Verification

- `npx tsc --noEmit` → exits 0 (twice: after Task 2 and after Task 3)
- `grep -q 'grid grid-cols'` on PerformanceGrid — PASS
- `grep -q 'use client'` + `LineSeries` on PortfolioChart — PASS
- `grep -q '含み損益'` on PositionsTable — PASS
- `grep -q 'use client'` + `PieChart` on AllocationChart — PASS
- `grep -q 'PerformanceGrid'`, `PortfolioChart`, `PositionsTable`, `AllocationChart`, `Promise.all` on page.tsx — PASS
- `grep -q 'ssr: false'` — PASS (in PortfolioChartClient / AllocationChartClient)

## Commits

| Task | Hash    | Message                                                         |
| ---- | ------- | --------------------------------------------------------------- |
| 1    | 6757157 | feat(04-03): add PerformanceGrid and PortfolioChart components  |
| 2    | c57e921 | feat(04-03): add PositionsTable and AllocationChart components  |
| 3    | b36841c | feat(04-03): integrate dashboard components in page.tsx         |

## Known Stubs

- `<section aria-label="トレードタイムライン">` still renders a placeholder paragraph "タイムラインは Plan 04 で実装". This is intentional and tracked — TradeTimeline is the sole deliverable of Plan 04-04.

## Threat Flags

None. All trust boundaries listed in the plan's threat_model were respected: DB credentials stay inside `server-only` modules (`lib/dashboard/queries.ts`, `lib/dashboard/metrics.ts`), and only serialized primitive values (numbers, strings, plain objects) cross into the client wrapper / chart components. No new network endpoints, auth paths, or schema changes introduced.

## Self-Check: PASSED

- FOUND: app/dashboard/components/PerformanceGrid.tsx
- FOUND: app/dashboard/components/PortfolioChart.tsx
- FOUND: app/dashboard/components/PortfolioChartClient.tsx
- FOUND: app/dashboard/components/PositionsTable.tsx
- FOUND: app/dashboard/components/AllocationChart.tsx
- FOUND: app/dashboard/components/AllocationChartClient.tsx
- FOUND: app/dashboard/page.tsx (updated)
- FOUND: commit 6757157
- FOUND: commit c57e921
- FOUND: commit b36841c
