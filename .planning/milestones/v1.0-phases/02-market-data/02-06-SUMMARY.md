---
phase: 02-market-data
plan: 06
subsystem: api
tags: [stooq, csv, market-data, fallback, ohlcv]

requires:
  - phase: 02-market-data/02-01
    provides: "market config types (OhlcvRow, MarketSource, Ticker)"
  - phase: 02-market-data/02-04
    provides: "yahoo OHLCV client pattern, whitelist module"
provides:
  - "fetchOhlcvStooq: CSV-based OHLCV fetcher for JP/US equities (env-gated)"
  - "toStooqSymbol: D-28 symbol format conversion (AAPL->aapl.us, 7203.T->7203.jp)"
affects: [02-market-data/02-08, 02-market-data/02-10]

tech-stack:
  added: []
  patterns: ["env-gated dead code for unavailable-in-free-tier APIs", "Pitfall 4 HTML-200 content guard"]

key-files:
  created:
    - lib/market/stooq.ts
    - lib/__tests__/market/stooq.test.ts
  modified: []

key-decisions:
  - "STOOQ_API_KEY env var gates all Stooq requests per SPIKE finding"
  - "Captcha-gated response detected via 'Get your apikey' prefix check"
  - "rawClose = close for Stooq (unadjusted source) per D-08"

patterns-established:
  - "Env-gated fallback: module works when env var present, gracefully errors when absent"

requirements-completed: [DATA-02]

duration: 3min
completed: 2026-04-12
---

# Phase 02 Plan 06: Stooq CSV Fallback Client Summary

**Stooq CSV client with env-gated apikey, D-28 symbol conversion, and Pitfall 4 HTML-200 guard**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-12T05:30:38Z
- **Completed:** 2026-04-12T05:33:15Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 2

## Accomplishments
- Stooq CSV OHLCV fetcher with full error handling (HTML-200, captcha, empty response, bad headers)
- D-28 symbol format conversion (toStooqSymbol) for US and JP markets
- STOOQ_API_KEY env-gating per SPIKE captcha finding -- dead code in production until key provisioned
- 12 tests covering all edge cases including captcha-gated response detection

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: failing tests for Stooq CSV client** - `97acb9d` (test)
2. **Task 1 GREEN: implement Stooq CSV fallback client** - `ab600cd` (feat)

## Files Created/Modified
- `lib/market/stooq.ts` - Stooq CSV OHLCV fetcher with toStooqSymbol, env-gated apikey, Pitfall 4 guard
- `lib/__tests__/market/stooq.test.ts` - 12 tests covering CSV parsing, error cases, symbol conversion, apikey URL construction

## Decisions Made
- STOOQ_API_KEY env var is appended to URL when present; absent means Stooq returns captcha prompt which is caught as StooqError
- Captcha detection uses string prefix check (`Get your apikey`) in addition to HTML `startsWith('<')` guard
- rawClose = close for Stooq rows since Stooq provides unadjusted data (per D-08 Option a/b)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added captcha/apikey-gated response detection**
- **Found during:** Task 1
- **Issue:** Plan only mentioned HTML-200 Pitfall 4 guard, but SPIKE found Stooq now returns text/plain captcha prompt instead of HTML
- **Fix:** Added `Get your apikey` prefix check as separate guard from HTML check
- **Files modified:** lib/market/stooq.ts, lib/__tests__/market/stooq.test.ts
- **Verification:** captcha fixture test passes
- **Committed in:** ab600cd

**2. [Rule 2 - Missing Critical] Added STOOQ_API_KEY env-gating to URL construction**
- **Found during:** Task 1
- **Issue:** Plan showed URL without apikey parameter, but SPIKE requires it for actual data retrieval
- **Fix:** Append `&apikey=` to URL when env var is present, with test verifying URL construction
- **Files modified:** lib/market/stooq.ts, lib/__tests__/market/stooq.test.ts
- **Verification:** URL construction test passes
- **Committed in:** ab600cd

---

**Total deviations:** 2 auto-fixed (2 missing critical per SPIKE findings)
**Impact on plan:** Both additions necessary for correctness given SPIKE discovery. No scope creep.

## Issues Encountered
None

## User Setup Required
None - STOOQ_API_KEY is optional. Module functions as env-gated dead code without it.

## Next Phase Readiness
- Stooq client ready for orchestrator composition in Plan 08
- Module is intentionally dead code until STOOQ_API_KEY is manually provisioned via captcha

## Self-Check: PASSED

- lib/market/stooq.ts: FOUND
- lib/__tests__/market/stooq.test.ts: FOUND
- Commit 97acb9d (test): FOUND
- Commit ab600cd (feat): FOUND

---
*Phase: 02-market-data*
*Completed: 2026-04-12*
