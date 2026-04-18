---
phase: 02-market-data
plan: 03
subsystem: market-calendar
tags: [calendar, timezone, pure-functions, tdd]
dependency_graph:
  requires: [config/market-holidays.ts, lib/market/types.ts]
  provides: [lastBusinessDay, isMarketClosed, resolveTargetDate, isWeekendIso]
  affects: [02-04 fetchers, 02-06 orchestrator]
tech_stack:
  added: [date-fns, date-fns-tz]
  patterns: [TZ-aware cutoff, ISO date arithmetic, server-only guard]
key_files:
  created: [lib/market/calendar.ts, lib/__tests__/market/calendar.test.ts]
  modified: [package.json, package-lock.json]
decisions:
  - "JP holiday walkback test uses 2026 dates only (avoids needing 2025 holiday list)"
  - "isoMinusDays uses UTC midnight construction to avoid DST edge cases"
metrics:
  duration: 3min
  completed: "2026-04-12T05:26:09Z"
  tasks: 1
  tests: 23
  files_created: 2
  files_modified: 2
---

# Phase 2 Plan 03: Market Calendar Utilities Summary

TZ-aware market calendar with D-19 cutoff rules using date-fns-tz formatInTimeZone for PITFALLS #4 compliance

## What Was Built

Pure utility module `lib/market/calendar.ts` providing four exported functions:

- **isWeekendIso(isoDate)**: Weekend detection using UTC day-of-week
- **isMarketClosed(market, isoDate)**: Combines weekend + holiday check
- **lastBusinessDay(market, now)**: Returns most recent settled trading day, honoring D-19 cutoff (US 16:30 ET, JP 15:00 JST) and walking back through holidays
- **resolveTargetDate(market, mode, daysBack, now)**: Returns array of business days for incremental (1 day) or backfill (N days) modes

All functions are pure (no I/O, deterministic given inputs), guarded with `import 'server-only'`.

## TDD Execution

| Phase | Tests | Commit |
|-------|-------|--------|
| RED | 23 tests written, all failing (module not found) | 8fd34d5 |
| GREEN | 23 tests passing | f575b8d |

## Test Coverage Highlights

- Weekend detection (Saturday, Sunday, weekday)
- US/JP holiday detection (MLK, Children's Day, year-end)
- US cutoff boundary: before/after/exactly 16:30 ET
- JP cutoff boundary: before/after/exactly 15:00 JST
- Holiday walkback: MLK weekend combo, Golden Week consecutive holidays
- Backfill: skips weekends, skips holidays, correct chronological order

## Commits

| Hash | Type | Description |
|------|------|-------------|
| 8fd34d5 | test | Failing tests for market calendar (TDD RED) |
| f575b8d | feat | Implementation with all 23 tests passing (TDD GREEN) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] JP holiday walkback test adjusted**
- **Found during:** Task 1 test design
- **Issue:** Plan's example test expected walkback to 2025-12-31, but only 2026 holidays are defined in config/market-holidays.ts
- **Fix:** Following plan's own suggestion, replaced with 2026-only dates (Golden Week walkback, Monday-across-weekend walkback)
- **Files modified:** lib/__tests__/market/calendar.test.ts

**2. [Rule 3 - Blocking] Added vi.mock('server-only') to test file**
- **Found during:** Task 1 test execution
- **Issue:** `import 'server-only'` in calendar.ts prevents test import outside Next.js context
- **Fix:** Added `vi.mock('server-only', () => ({}))` following existing project pattern (lib/__tests__/env.test.ts)
- **Files modified:** lib/__tests__/market/calendar.test.ts

## Self-Check: PASSED

- [x] lib/market/calendar.ts exists
- [x] lib/__tests__/market/calendar.test.ts exists
- [x] Commit 8fd34d5 exists
- [x] Commit f575b8d exists
- [x] First line of calendar.ts is `import 'server-only'`
- [x] formatInTimeZone is used (PITFALLS #4)
- [x] All 23 tests pass
