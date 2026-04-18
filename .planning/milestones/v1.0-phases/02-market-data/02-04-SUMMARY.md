---
phase: 02-market-data
plan: 04
subsystem: market-data
tags: [yahoo-finance2, ohlcv, fx, data-layer]
dependency_graph:
  requires: [02-01, 02-00]
  provides: [fetchOhlcvYahoo, fetchFxUsdJpy]
  affects: [02-08]
tech_stack:
  added: []
  patterns: [fixture-based-testing, server-only-guard, pre-network-whitelist]
key_files:
  created:
    - lib/market/yahoo.ts
    - lib/__tests__/market/yahoo.test.ts
  modified: []
decisions:
  - "D-08 Option A applied: rawClose = quote.close (split-adjusted), close = quote.adjclose (split+dividend adjusted)"
metrics:
  duration: 4min
  completed: 2026-04-12
  tasks_completed: 1
  tasks_total: 1
---

# Phase 02 Plan 04: Yahoo-Finance2 OHLCV Client Summary

Yahoo-finance2 chart() wrapper returning typed OhlcvRow[] for US/JP equities and USD/JPY FX, with D-08 rawClose/adjclose split per SPIKE decision Option A.

## What Was Built

### fetchOhlcvYahoo(symbol, period1, period2)
- Fetches daily OHLCV via `yahoo-finance2` `chart()` (NOT `historical()`, which is deprecated)
- Pre-network whitelist guard via `getTicker()` -- throws `WhitelistViolationError` before any HTTP call
- Maps `quote.close` -> `rawClose` (split-adjusted only) and `quote.adjclose` -> `close` (split+dividend adjusted) per D-08 Option A
- Wraps network/API errors in `YahooError`
- Rejects empty responses with descriptive `YahooError`
- Returns typed `OhlcvRow[]` with correct `currency`, `source`, `assetClass` from whitelist ticker metadata

### fetchFxUsdJpy(period1, period2)
- Fetches JPY=X (USD/JPY rate) via chart()
- Returns OhlcvRow with `symbol='JPYUSD'`, `assetClass='fx'`, `currency='USD'`
- rawClose is null for FX (no split/dividend concept)

## Test Coverage

7 tests, all passing:
1. AAPL fixture -> correct OhlcvRow[] shape, source, currency, assetClass, date format
2. 7203.T fixture -> JPY currency
3. D-08 rawClose mapping verification (rawClose != close when adjclose differs)
4. WhitelistViolationError before network call (spy not called)
5. Empty response -> YahooError
6. Network error -> wrapped YahooError
7. FX -> JPYUSD symbol, fx assetClass, null rawClose

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | 058a27c | test(02-04): add failing tests for yahoo-finance2 client |
| 2 | b509274 | feat(02-04): implement yahoo-finance2 OHLCV client with D-08 rawClose mapping |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Critical] D-08 rawClose mapping corrected from plan template**
- **Found during:** Task 1 implementation
- **Issue:** Plan template code set `rawClose = closeStr` where `closeStr` came from `q.close`, making both `rawClose` and `close` identical. But 02-SPIKE-RAW-CLOSE.md Decision (Option A) specifies `rawClose = quote.close` (split-adjusted only) and `close = quote.adjclose` (split+dividend adjusted).
- **Fix:** Implemented `rawClose = String(q.close)` and `close = String(q.adjclose)` with fallback to rawClose when adjclose is absent.
- **Files modified:** lib/market/yahoo.ts
- **Commit:** b509274

## Self-Check: PASSED
