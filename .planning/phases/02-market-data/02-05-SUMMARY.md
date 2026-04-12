---
phase: 02-market-data
plan: 05
subsystem: market-data
tags: [finnhub, news, fundamentals, zod, us-equities]
dependency_graph:
  requires: [02-01, 02-02]
  provides: [fetchCompanyNews, fetchBasicFinancials]
  affects: [03-agent-pipeline]
tech_stack:
  added: []
  patterns: [zod-validation, server-only-guard, us-only-guard, fixture-based-testing]
key_files:
  created:
    - lib/market/finnhub.ts
    - lib/__tests__/market/finnhub.test.ts
  modified: []
decisions:
  - Zod schemas use safeParse with FinnhubError wrapping for consistent error hierarchy
  - Return types use readonly properties and string|null for numeric fields (consistent with OhlcvRow pattern)
  - sourceDomain mapped from Finnhub `source` field, null when empty string
metrics:
  duration: 2m
  completed: "2026-04-12T05:24:40Z"
  tasks: 1
  files: 2
---

# Phase 02 Plan 05: Finnhub News + Fundamentals Client Summary

Zod-validated Finnhub REST client for US equity news and basic financials, with US-only guard and whitelist enforcement.

## What Was Built

### fetchCompanyNews(symbol, from, to)
- Calls Finnhub `/company-news` endpoint with date range
- Zod-validates the array response via `NewsResponseSchema`
- Returns `NewsItem[]` with `symbol`, `headline`, `url`, `sourceDomain`, `publishedAt` (Date), `raw`
- Rejects JP tickers with `FinnhubError('US-only')` before any network call
- Rejects non-whitelisted symbols with `WhitelistViolationError` before any network call

### fetchBasicFinancials(symbol)
- Calls Finnhub `/stock/metric` endpoint
- Zod-validates via `BasicFinancialsSchema` with `.passthrough()` for future metric fields
- Returns `Fundamentals` with `peRatio`, `eps`, `marketCap`, `week52High`, `week52Low` (all `string | null`), plus `raw`

### Error Handling
- 401 responses surface as `FinnhubError('unauthorized (bad FINNHUB_API_KEY)')`
- Non-OK responses surface as `FinnhubError('HTTP {status}')`
- Zod parse failures surface as `FinnhubError` with parse error details

### Amendment A Compliance
- No `/stock/candle` or OHLCV endpoints — Finnhub is news + fundamentals only
- OHLCV is handled by yahoo-finance2 in Plan 04

## Test Results

6/6 tests passing:
1. fetchCompanyNews returns parsed NewsItem[] from fixture
2. fetchBasicFinancials returns parsed Fundamentals
3. JP ticker rejection before network call
4. Non-whitelist symbol rejection before network call
5. 401 -> FinnhubError with "unauthorized"
6. Malformed response -> FinnhubError via Zod

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| RED  | 246b299 | Failing tests for Finnhub news + fundamentals client |
| GREEN | db88e19 | Implement Finnhub client with Zod validation |

## Deviations from Plan

None - plan executed exactly as written.
