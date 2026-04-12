---
phase: 02-market-data
plan: 01
subsystem: market-data
tags: [whitelist, types, errors, holidays, env, finnhub, tdd]
requires:
  - 02-market-data/02-00 (SPIKE: raw_close storage decision)
  - 01-foundation/01-01 (priceSnapshots schema)
provides:
  - Ticker whitelist guard (DATA-05)
  - Shared Ticker / OhlcvRow / MarketSource types
  - MarketDataError class hierarchy
  - 2026 NYSE + JPX holiday calendars
  - FINNHUB_API_KEY env enforcement
affects:
  - Every downstream plan in phase 02-market-data (02-02 .. 02-10)
tech-stack:
  added: []
  patterns:
    - "Server-only guard via `import 'server-only'` + vitest mock for testability"
    - "readonly const tuple + Map lookup for whitelist"
    - "Error class hierarchy with subclass-per-source"
key-files:
  created:
    - config/tickers.ts
    - config/market-holidays.ts
    - lib/market/types.ts
    - lib/market/errors.ts
    - lib/market/whitelist.ts
    - lib/__tests__/market/whitelist.test.ts
    - lib/__tests__/market/holidays.test.ts
  modified:
    - lib/env.ts
    - .env.example
    - lib/__tests__/env.test.ts
decisions:
  - "Placed tickers under config/ (not DB/env) per D-01 for TypeScript-native ticker management"
  - "Types file omits `import 'server-only'` because it is imported from config/ (shared, not lib/)"
  - "Error subclasses named per source (YahooError, StooqError, FinnhubError) for precise catch dispositions downstream"
  - "JP_HOLIDAYS_2026 includes 2026-12-31 (JPX year-end closure) per JPX calendar"
metrics:
  duration: ~10m
  completed: 2026-04-12
tasks_completed: 3
tests_added: 13
---

# Phase 02 Plan 01: Market Data Configuration & Types Summary

Interface-first foundation for the market data pipeline: 10-ticker whitelist with guard, OHLCV/Ticker types, MarketDataError hierarchy, 2026 NYSE+JPX holiday calendars, and FINNHUB_API_KEY enforced at startup — everything downstream (02-02 through 02-10) imports from here.

## What Was Built

### Task 1 — Whitelist guard + shared types + errors (TDD)
- **`lib/market/types.ts`** — pure type module (no runtime imports): `Market`, `AssetClass`, `Currency`, `MarketSource`, `Ticker`, `OhlcvRow`. `OhlcvRow` carries both `close` and `rawClose` per the 02-SPIKE decision, all numerics stringified per numeric(18,4) convention.
- **`lib/market/errors.ts`** — `import 'server-only'`. `MarketDataError` base class (carries optional `symbol`) + `WhitelistViolationError`, `YahooError`, `StooqError`, `FinnhubError` subclasses.
- **`config/tickers.ts`** — hardcoded `readonly Ticker[]` of 10 tickers (6 US: AAPL/MSFT/NVDA/GOOGL/AMZN/SPY, 4 JP: 7203.T/6758.T/9984.T/7974.T). Pre-computed `Map` for O(1) `findTicker()` lookup. No `server-only` (config/ is shared).
- **`lib/market/whitelist.ts`** — `import 'server-only'`. `isWhitelisted(symbol)` boolean guard + `getTicker(symbol)` that throws `WhitelistViolationError` on miss.
- **`lib/__tests__/market/whitelist.test.ts`** — 5 cases covering ticker count (10 = 6+4), positive/negative `isWhitelisted`, full-object `getTicker`, and `WhitelistViolationError`/`MarketDataError` inheritance check. Uses `vi.mock('server-only', () => ({}))` pattern established in Phase 1 env tests.
- **Commit:** `9cfb4cf`

### Task 2 — 2026 market holidays (NYSE + JPX)
- **`config/market-holidays.ts`** — `US_HOLIDAYS_2026` (10 entries, observed Independence Day `2026-07-03` because July 4 falls on Saturday), `JP_HOLIDAYS_2026` (19 entries, includes Golden Week 05-04/05-05/05-06 and JPX year-end `2026-12-31`), and `isMarketHoliday(market, isoDate)` helper. Both arrays marked `as const readonly string[]`.
- **`lib/__tests__/market/holidays.test.ts`** — 8 cases covering US/JP positive hits, negative cases (Saturday July 4 not in list, random weekday), ISO format regex across all entries, US array length = 10, JP array length ≥ 18.
- **Commit:** `1d00c61`

### Task 3 — FINNHUB_API_KEY env enforcement
- **`lib/env.ts`** — added `FINNHUB_API_KEY: z.string().min(1)` to `envSchema` immediately after `CRON_SECRET` (no reordering).
- **`.env.example`** — documented `FINNHUB_API_KEY` with a registration link comment.
- **`lib/__tests__/env.test.ts`** — extended `VALID_ENV` fixture with `FINNHUB_API_KEY: 'finnhub-test-key-value'` (Rule 1 auto-fix: Task 3's schema change broke 3 existing env tests that reused `VALID_ENV`; fixing the fixture was a direct consequence of the plan's change, not scope creep).
- **Commit:** `207c858`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] env.test.ts VALID_ENV fixture missing FINNHUB_API_KEY**
- **Found during:** Task 3 verification
- **Issue:** Adding `FINNHUB_API_KEY` to `envSchema` caused 3 existing tests in `lib/__tests__/env.test.ts` to fail because `VALID_ENV` (shared fixture) no longer satisfied the schema. This was a direct, mechanical consequence of the plan's schema change — not a pre-existing bug.
- **Fix:** Added `FINNHUB_API_KEY: 'finnhub-test-key-value'` to the `VALID_ENV` fixture object.
- **Files modified:** `lib/__tests__/env.test.ts`
- **Commit:** `207c858` (bundled with Task 3)

**2. [Rule 3 - Blocking] Test runner blocked by `server-only` import**
- **Found during:** Task 1 first `vitest run whitelist` attempt
- **Issue:** `@/lib/market/whitelist` (which imports `server-only`) could not be loaded by vitest because `server-only/index.js` throws at import time outside a Next.js build.
- **Fix:** Added `vi.mock('server-only', () => ({}))` at the top of `whitelist.test.ts`, matching the existing pattern from `lib/__tests__/env.test.ts`. This is the project-wide convention, not a new workaround.
- **Files modified:** `lib/__tests__/market/whitelist.test.ts`
- **Commit:** `9cfb4cf` (bundled with Task 1)

## Pre-existing Out-of-Scope Failures (NOT fixed)

`./node_modules/.bin/vitest run` (full suite) reports 8 failing tests under `.claude/worktrees/agent-a6a8d72f/lib/__tests__/auth-login-route.test.ts` with `server-only` import errors. These belong to a different worktree checked in at a parallel path and are unrelated to the files this plan owns. Not fixed. In-scope suites (`whitelist`, `holidays`, `env`) are 43/43 green.

## Verification

| Check | Result |
| --- | --- |
| `vitest run whitelist --reporter=dot` | 5/5 passing |
| `vitest run holidays --reporter=dot` | 8/8 passing |
| `vitest run env --reporter=dot` | 30/30 passing |
| `vitest run whitelist holidays env` combined | 43/43 passing |
| `tsc --noEmit` | clean (no errors) |
| `config/tickers.ts` contains `'AAPL'`, `'7203.T'`, `'SPY'`, `readonly Ticker` | yes |
| `lib/market/errors.ts` first line = `import 'server-only'` | yes |
| `lib/market/whitelist.ts` first line = `import 'server-only'` | yes |
| `lib/env.ts` contains `FINNHUB_API_KEY: z.string().min(1)` | yes |
| `.env.example` contains line starting with `FINNHUB_API_KEY=` | yes |
| Plan 00 fixture files untouched | yes (scope guard respected) |

## Success Criteria

- [x] DATA-05 whitelist guard exists and is testable (`isWhitelisted` + `getTicker` throwing `WhitelistViolationError`)
- [x] Types + errors are single-source-of-truth for all subsequent waves (`lib/market/types.ts` + `lib/market/errors.ts`)
- [x] FINNHUB_API_KEY is enforced at startup (`lib/env.ts` throws on missing)

## Commits

| Task | Hash | Message |
| --- | --- | --- |
| 1 | `9cfb4cf` | feat(02-01): add whitelist guard, market types, and error classes |
| 2 | `1d00c61` | feat(02-01): add 2026 NYSE + JPX market holiday calendars |
| 3 | `207c858` | feat(02-01): enforce FINNHUB_API_KEY at startup |

## Self-Check: PASSED

- Files created (verified via `test -f`):
  - config/tickers.ts, config/market-holidays.ts
  - lib/market/types.ts, lib/market/errors.ts, lib/market/whitelist.ts
  - lib/__tests__/market/whitelist.test.ts, lib/__tests__/market/holidays.test.ts
- Files modified (verified via git log): lib/env.ts, .env.example, lib/__tests__/env.test.ts
- Commits (verified via `git log --oneline`): 9cfb4cf, 1d00c61, 207c858
