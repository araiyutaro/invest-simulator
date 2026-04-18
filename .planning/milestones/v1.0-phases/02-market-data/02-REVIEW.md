---
phase: 02-market-data
reviewed: 2026-04-12T12:00:00Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - app/api/cron/fetch-market-data/route.ts
  - config/market-holidays.ts
  - config/tickers.ts
  - db/schema.ts
  - lib/env.ts
  - lib/market/calendar.ts
  - lib/market/errors.ts
  - lib/market/finnhub.ts
  - lib/market/orchestrator.ts
  - lib/market/persist.ts
  - lib/market/stooq.ts
  - lib/market/types.ts
  - lib/market/whitelist.ts
  - lib/market/yahoo.ts
  - scripts/backfill.ts
findings:
  critical: 2
  warning: 5
  info: 4
  total: 11
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-04-12T12:00:00Z
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Phase 02 market data layer is well-structured with good separation of concerns: whitelist enforcement, typed errors, Zod-validated API responses, and idempotent DB upserts. The codebase follows project conventions (immutability, small files, Zod validation).

Key concerns: (1) API key leaked in URL query strings that may appear in logs, (2) timing-based authorization check is vulnerable to timing attacks, (3) silent error swallowing in orchestrator hides data quality issues, (4) holiday calendar is hardcoded to 2026 only with no runtime guard.

## Critical Issues

### CR-01: Finnhub API key exposed in URL query string

**File:** `lib/market/finnhub.ts:93` and `lib/market/finnhub.ts:134`
**Issue:** The FINNHUB_API_KEY is passed as a query parameter (`&token=...`). This means the secret will appear in:
- Server-side `fetch()` error stack traces
- Any request logging middleware or observability tools
- Vercel function logs if the URL is logged on error

While Finnhub's API requires the token as a query param (no header auth option), the constructed URL should never be logged. Currently, FinnhubError messages include only status codes, but if upstream code or middleware logs the full request URL, the key leaks.

**Fix:** Avoid constructing the full URL with the token until the fetch call. At minimum, ensure the URL is never included in error messages. Consider using Finnhub's `X-Finnhub-Token` header instead of the query parameter:
```typescript
const url = `${BASE}/company-news?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}`
const res = await fetch(url, {
  headers: { 'X-Finnhub-Token': env.FINNHUB_API_KEY },
})
```

### CR-02: Timing-safe comparison not used for CRON_SECRET auth

**File:** `app/api/cron/fetch-market-data/route.ts:19`
**Issue:** The authorization header is compared with `!==` (string equality), which is vulnerable to timing attacks. An attacker can brute-force the CRON_SECRET character-by-character by measuring response times. Since this endpoint is publicly accessible on the internet (Vercel deployment), this is a real attack surface.

**Fix:** Use a constant-time comparison:
```typescript
import { timingSafeEqual } from 'node:crypto'

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

// In POST handler:
if (!safeEqual(header, expected)) {
  return unauthorized('bad or missing authorization header')
}
```

## Warnings

### WR-01: Holiday calendar hardcoded to 2026 only -- no year guard

**File:** `config/market-holidays.ts:39-41`
**Issue:** `isMarketHoliday()` only checks 2026 holidays. In 2027, all holidays will be treated as trading days, causing the system to attempt fetches on holidays (resulting in empty/stale data and unnecessary API calls). There is no runtime warning when the calendar year expires.

**Fix:** Add a year guard that logs a warning or throws when the date falls outside the covered year:
```typescript
export function isMarketHoliday(market: 'US' | 'JP', isoDate: string): boolean {
  const year = isoDate.slice(0, 4)
  if (year !== '2026') {
    console.warn(`[market-holidays] no holiday data for year ${year}; treating as trading day`)
  }
  const list = market === 'US' ? US_HOLIDAYS_2026 : JP_HOLIDAYS_2026
  return list.includes(isoDate)
}
```

### WR-02: Silent error swallowing in fetchNewsAndFundamentals

**File:** `lib/market/orchestrator.ts:197-199` and `lib/market/orchestrator.ts:203-205`
**Issue:** Both catch blocks silently swallow errors with no logging. If Finnhub news or fundamentals fetching consistently fails (e.g., expired API key, rate limit), there is no signal in logs or in the returned `FailureSummary`. Operators will not know data is missing.

**Fix:** At minimum, log the error:
```typescript
} catch (e) {
  console.warn(`[orchestrator] news fetch soft-fail for ${symbol}:`, (e as Error).message)
}
```

### WR-03: orchestrator uses wall-clock todayIso instead of market-local date

**File:** `lib/market/orchestrator.ts:57`
**Issue:** `now.toISOString().slice(0, 10)` returns the UTC date, not the market-local date. If the cron runs at 01:00 UTC (which is 10:00 JST but still the previous day in New York), the US market holiday check compares against the wrong date. The `calendar.ts` module already has timezone-aware `lastBusinessDay()`, but the orchestrator bypasses it for the holiday check.

**Fix:** Use the market-local date for holiday detection:
```typescript
import { formatInTimeZone } from 'date-fns-tz'
const TZ: Record<Market, string> = { US: 'America/New_York', JP: 'Asia/Tokyo' }
// Inside the loop:
const localDate = formatInTimeZone(now, TZ[ticker.market], 'yyyy-MM-dd')
if (opts.mode === 'incremental' && isMarketClosed(ticker.market, localDate)) {
```

### WR-04: Stooq CSV parsing does not validate date format or numeric fields

**File:** `lib/market/stooq.ts:83-99`
**Issue:** The CSV line is split and directly used without validating that `date` matches `YYYY-MM-DD` format or that `open/high/low/close` are valid numbers. Malformed data (e.g., `N/A` values, extra commas) would be silently persisted to the database as invalid strings in `numeric(18,4)` columns, causing potential Postgres errors on insert.

**Fix:** Add basic field validation:
```typescript
const [date, open, high, low, close, volume] = line.split(',')
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  throw new StooqError(`invalid date format: ${date}`, symbol)
}
const toNumStr = (v: string) => (v === '' || v === 'N/A' ? null : v)
```

### WR-05: .env.local parser does not strip surrounding quotes from values

**File:** `scripts/backfill.ts:83`
**Issue:** The `loadEnvLocal()` function reads values literally without stripping enclosing quotes. A common `.env.local` entry like `FINNHUB_API_KEY="abc123"` would set the value to `"abc123"` (with literal quote characters), causing API authentication failures.

**Fix:**
```typescript
let value = trimmed.slice(eqIdx + 1)
// Strip surrounding quotes (single or double)
if ((value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))) {
  value = value.slice(1, -1)
}
```

## Info

### IN-01: console.error in cron route handler

**File:** `app/api/cron/fetch-market-data/route.ts:28`
**Issue:** Project coding style rules state "No console.log statements." `console.error` is used here for logging. Consider a structured logger for production observability.

**Fix:** Acceptable for now given the project stage, but consider a thin logging wrapper as the project matures.

### IN-02: `as any` cast on yahoo-finance2 chart method

**File:** `lib/market/yahoo.ts:41`
**Issue:** `(_yahooClient.chart as any)` bypasses TypeScript type checking. If the yahoo-finance2 library changes its `chart()` signature, this will fail silently at compile time.

**Fix:** Define a proper type for the chart function or use `@ts-expect-error` with a comment explaining why, so it fails loudly if the types are ever corrected upstream.

### IN-03: Unused import `subDays` from date-fns

**File:** `lib/market/calendar.ts:3`
**Issue:** `subDays` is imported from `date-fns` and used in `isoMinusDays`, but `isoMinusDays` could be implemented with plain `Date.setUTCDate()` (as done in `orchestrator.ts:214-216`), avoiding the date-fns dependency in this module. Not a bug, but inconsistent with the orchestrator's approach.

**Fix:** Minor consistency issue. Either use `subDays` in both places or plain Date math in both.

### IN-04: FX symbol 'JPYUSD' naming may cause confusion

**File:** `lib/market/yahoo.ts:127` and `lib/market/orchestrator.ts:116`
**Issue:** The stored symbol is `JPYUSD` but the actual data represents "JPY per 1 USD" (i.e., USD/JPY rate). The symbol name suggests JPY-to-USD conversion. The comment on line 94-95 of yahoo.ts clarifies this, but the symbol name itself is misleading for future developers.

**Fix:** Consider renaming to `USDJPY` to match financial convention (base/quote = USD/JPY meaning "how many JPY per 1 USD"), or add a comment in `types.ts` documenting the convention.

---

_Reviewed: 2026-04-12T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
