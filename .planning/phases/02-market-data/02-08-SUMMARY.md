---
phase: 02-market-data
plan: "08"
subsystem: market-data-orchestrator
tags: [orchestrator, pipeline, fallback, isolation]
dependency_graph:
  requires: [02-03, 02-04, 02-05, 02-06, 02-07]
  provides: [fetchMarketData]
  affects: [cron-route, backfill-cli]
tech_stack:
  added: []
  patterns: [per-ticker-isolation, fallback-chain, soft-failure]
key_files:
  created:
    - lib/market/orchestrator.ts
  modified:
    - lib/__tests__/market/orchestrator.test.ts
decisions:
  - "D-18 holiday detection checks current calendar date via isMarketClosed() before fetching"
  - "writeMarketClosedRow batched per market (not per ticker) for efficiency"
  - "Calendar module mocked in tests to avoid date-fns-tz transitive dependency in unit tests"
metrics:
  duration_seconds: 496
  completed: "2026-04-12T05:46:55Z"
  tasks_completed: 1
  tasks_total: 1
  tests_added: 10
  files_created: 1
  files_modified: 1
---

# Phase 02 Plan 08: Market Data Orchestrator Summary

Composition layer wiring all Wave 3/4 primitives (yahoo, finnhub, stooq, persist, calendar) into fetchMarketData() with D-13 JP fallback chain, D-15 per-ticker error isolation, and D-18 holiday detection.

## Completed Tasks

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 (RED) | Failing orchestrator tests | d92f91c | lib/__tests__/market/orchestrator.test.ts |
| 1 (GREEN) | fetchMarketData implementation + tests passing | 9a33409 | lib/market/orchestrator.ts, lib/__tests__/market/orchestrator.test.ts |

## Implementation Details

### fetchMarketData() (lib/market/orchestrator.ts — 217 lines)

- **Entry point** for both cron route (incremental) and backfill CLI
- **Per-ticker isolation (D-15):** Each ticker processed in try/catch; one failure does not abort the run
- **JP fallback chain (D-13):** yahoo primary -> Stooq fallback with three triggers:
  1. Yahoo throws exception (D-13.1)
  2. Yahoo returns empty array (D-13.2)
  3. Yahoo returns stale data (D-13.3 — latest row date < expected target)
- **Holiday detection (D-18):** `isMarketClosed()` checks current date; writes `market_closed` rows via `writeMarketClosedRow()` (batched per market)
- **News + fundamentals (US only):** Soft failures — do not propagate to ticker-level error
- **FX (JPYUSD):** Fetched once per run, independent of ticker loop
- **onlySymbols filter:** CLI override to process subset of tickers

### Test Coverage (10 tests)

1. Happy path: all 10 tickers + FX succeed
2. JP yahoo throws -> Stooq fallback (D-13.1)
3. JP yahoo empty -> Stooq fallback (D-13.2)
4. JP yahoo stale -> Stooq fallback (D-13.3)
5. JP both fail -> failure recorded, others continue (D-15)
6. onlySymbols filters to subset
7. Non-whitelist symbol via onlySymbols yields zero fetches
8. Backfill mode fetches multiple days
9. US holiday writes market_closed rows, JP still fetches (D-18)
10. News/fundamentals failure does NOT fail the ticker

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing date-fns-tz dependency**
- **Found during:** Task 1 (RED)
- **Issue:** `date-fns-tz` was in package.json but not installed in worktree's node_modules
- **Fix:** Ran `npm install` to restore all dependencies
- **Files modified:** node_modules (not committed)

**2. [Rule 3 - Blocking] Transitive env/db module resolution**
- **Found during:** Task 1 (GREEN)
- **Issue:** Even with vi.mock, vitest resolved transitive imports from finnhub.ts -> env.ts and persist.ts -> db, causing env validation and DB connection errors
- **Fix:** Added `vi.mock('@/lib/env')` and `vi.mock('@/db')` factory mocks to prevent transitive resolution
- **Files modified:** lib/__tests__/market/orchestrator.test.ts

**3. [Rule 2 - Missing] Calendar module mock for proper unit isolation**
- **Found during:** Task 1 (GREEN)
- **Issue:** Calendar module imported date-fns-tz transitively; unit tests should mock calendar to avoid dependency on date arithmetic
- **Fix:** Added `vi.mock('@/lib/market/calendar')` with explicit mock for `resolveTargetDate` and `isMarketClosed`
- **Files modified:** lib/__tests__/market/orchestrator.test.ts

## Decisions Made

1. **Holiday detection uses `isMarketClosed(market, todayIso)` check** — rather than relying on `resolveTargetDate` returning empty (it never does), the orchestrator explicitly checks if the current calendar date is a holiday for incremental mode
2. **`writeMarketClosedRow` batched per market** — when a market is closed, all symbols for that market are written in one call rather than per-ticker
3. **Calendar fully mocked in orchestrator tests** — this is a unit test of orchestration logic; calendar correctness is tested in calendar.test.ts

## Known Stubs

None — all data flows are wired to real module interfaces (mocked in tests).

## Self-Check: PASSED

- [x] lib/market/orchestrator.ts exists (217 lines)
- [x] lib/__tests__/market/orchestrator.test.ts exists (307 lines, 10 tests)
- [x] Commit d92f91c (RED tests)
- [x] Commit 9a33409 (GREEN implementation)
- [x] 02-08-SUMMARY.md exists
