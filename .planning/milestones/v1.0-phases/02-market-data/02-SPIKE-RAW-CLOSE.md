# 02-SPIKE-RAW-CLOSE — D-08 raw_close resolution

**Plan:** 02-00
**Wave:** 0 (blocking)
**Date run:** 2026-04-12
**Decision:** **Option (a)** — `raw_close = yahoo quote.close`, `close = yahoo quote.adjclose`
**Spike runner:** `scripts/spike-raw-close.ts`
**Output fixture:** `lib/__tests__/fixtures/market/yahoo-chart-aapl.json`

---

## Experiment

- **Symbol:** AAPL
- **Window:** `2020-08-18` .. `2020-09-12` (18 trading days; covers the 2020-08-31 4:1 split effective date)
- **Command:** `npx tsx scripts/spike-raw-close.ts`
- **Primary source:** `yahoo-finance2` v3 `chart()` with `interval: '1d'`
- **Secondary source attempted:** Stooq CSV `https://stooq.com/q/d/l/?s=aapl.us&i=d&d1=20200818&d2=20200912`
- **Goal:** Observe whether yahoo `close` and `adjclose` diverge on the split window, and whether Stooq can be used as a secondary unadjusted source.

## Raw Results

### Yahoo chart() — 18 rows

```
date       | yahoo_close | yahoo_adjclose | stooq_close | diff_pct
-----------|-------------|----------------|-------------|---------
2020-08-18 |    115.5625 |       112.1959 |         N/A |      N/A
2020-08-19 |    115.7075 |       112.3366 |         N/A |      N/A
2020-08-20 |    118.2750 |       114.8293 |         N/A |      N/A
2020-08-21 |    124.3700 |       120.7468 |         N/A |      N/A
2020-08-24 |    125.8575 |       122.1909 |         N/A |      N/A
2020-08-25 |    124.8250 |       121.1885 |         N/A |      N/A
2020-08-26 |    126.5225 |       122.8366 |         N/A |      N/A
2020-08-27 |    125.0100 |       121.3681 |         N/A |      N/A
2020-08-28 |    124.8075 |       121.1715 |         N/A |      N/A
2020-08-31 |    129.0400 |       125.2807 |         N/A |      N/A
2020-09-01 |    134.1800 |       130.2710 |         N/A |      N/A
2020-09-02 |    131.4000 |       127.5720 |         N/A |      N/A
2020-09-03 |    120.8800 |       117.3584 |         N/A |      N/A
2020-09-04 |    120.9600 |       117.4361 |         N/A |      N/A
2020-09-08 |    112.8200 |       109.5332 |         N/A |      N/A
2020-09-09 |    117.3200 |       113.9021 |         N/A |      N/A
2020-09-10 |    113.4900 |       110.1837 |         N/A |      N/A
2020-09-11 |    112.0000 |       108.7371 |         N/A |      N/A

YAHOO_ROWS=18
STOOQ_ROWS=0
STOOQ_OK=false
STOOQ_REASON=apikey_required
ROWS_COMPARED=0
YAHOO_CLOSE_EQUALS_ADJCLOSE=false
MAX_DIFF_PCT=0.000000
```

### Stooq fetch — failed

Stooq's free-tier CSV endpoint now responds to unauthenticated requests with `Content-Type: text/plain; charset=UTF-8` and a body starting with `Get your apikey:` followed by captcha-acquisition instructions. A per-user apikey (obtained via manual captcha) is required for every CSV download.

Body snippet (captured in `lib/__tests__/fixtures/market/stooq-aapl-us.csv`):

```
Get your apikey:

1. Open https://stooq.com/q/d/?s=aapl.us&get_apikey
2. Enter the captcha code.
3. Copy the CSV download link at the bottom of the page - it will contain the <apikey> variable.
4. Append the <apikey> variable with its value to your requests, e.g.
   https://stooq.com/q/d/l/?s=aapl.us&i=d&d1=20200820&d2=20200910&apikey=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

This is a **new behavior** relative to 02-RESEARCH.md Pattern 3, which described Stooq as "no key needed". The change invalidates option (c) and degrades option (b) to "Stooq fallback requires a manual apikey stored as `STOOQ_APIKEY` env var".

## Observation

### Numeric facts

1. **`yahoo_close != yahoo_adjclose` on every row of the window.**
   For every trading day in 2020-08-18 .. 2020-09-11, the two fields differ by a consistent ratio around **1.0300** (≈3%). This is the dividend adjustment applied retroactively up to 2020-09-12; AAPL paid dividends in Q3 2020 which adjclose reflects but close does not.
2. **Both `close` and `adjclose` are split-adjusted.**
   Pre-split AAPL was trading around $500 in mid-August 2020. The 4:1 split effective 2020-08-31 should yield ~$125 post-split. Yahoo `close` for 2020-08-18 is `115.5625`, for 2020-08-31 is `129.0400` — both already divided by 4. In other words **yahoo chart() applies split adjustment retroactively to `close` itself**, and `adjclose` adds dividend adjustment on top of that.
3. **Yahoo `close` is therefore "split-adjusted, not dividend-adjusted"** — exactly the `raw_close` semantics the Phase 2 plan wanted (per D-08 "raw_close = split前の生 close"). Note: it is NOT literally the printed pre-split ticker price, but it IS the value we need because our P&L math cares about split continuity, not dividend continuity.
4. **`adjclose` is "split + dividend adjusted"** — use this as `close` for technical indicators (RSI/MACD/SMA) so split-day and ex-dividend-day discontinuities do not create phantom signals.
5. **Max observed diff_pct (yahoo_close vs stooq_close) is N/A** — Stooq was unavailable, so no cross-source comparison was possible.
6. **Yahoo is internally consistent** — no NaN, no missing fields, no gap on 2020-08-31.

### Stooq availability finding (critical)

- Stooq free-tier CSV is **no longer headless-accessible**.
- The plan's Pitfall 4 guard ("HTML returned as 200") has been replaced by a new failure mode: `text/plain` body starting with `Get your apikey:`.
- Option (c) "Stooq as primary raw source" is now **impossible** in a serverless cron without first performing a manual captcha and persisting the apikey as an env var.
- Option (b) "Stooq as secondary unadjusted fetch" is **degraded** — it requires `STOOQ_APIKEY` env var provisioning, which is additional ops burden for a 1-dev project.

## Decision

**Option (a): `raw_close = yahoo quote.close`, `close = yahoo quote.adjclose`.**

Rationale:

1. Yahoo chart() already returns split-adjusted `close` AND split+dividend-adjusted `adjclose` as separate fields. There is **no need** for a second source to obtain a split-adjusted raw value.
2. The observed semantics match exactly what D-08 intended `raw_close` to provide: a value that survives split events without phantom P&L jumps. Splits are applied retroactively to yahoo `close`, so cost-basis calculations against historical `raw_close` remain continuous.
3. Dividend adjustment is intentionally NOT in `raw_close`. When the simulator tracks cost basis vs. market value, we want to use `raw_close` (split-adjusted only) because dividends are separate events the portfolio should track as cash inflows, not as price movements. Using `adjclose` everywhere would conflate dividends with capital gains.
4. Option (b) is rejected because Stooq is no longer headless-accessible. Requiring an apikey env var is out of proportion for the marginal benefit of a cross-source sanity check.
5. Option (c) is rejected per plan's scope constraint (Phase 2 cannot re-plan Plan 04/08) and is now outright infeasible anyway without apikey provisioning.

**Escalation:** the Stooq-apikey finding means the future plans that assumed Stooq as a JP fallback (Plan 02-03, 02-04) need an updated fallback policy. This SPIKE does not block them — it just narrows the fallback surface. See "Implications" below.

## Implications for Wave 1+

### Rules for all Wave 1+ fetchers

1. **yahoo chart() is the source of truth for OHLCV in both markets.** For every `price_snapshots` row populated from yahoo:
   - `raw_close = quote.close` (split-adjusted only)
   - `close = quote.adjclose` (split + dividend adjusted)
   - `open/high/low = quote.{open,high,low}` (split-adjusted, matching close)
   - `volume = quote.volume`
   - `source = 'yahoo'`
2. **Stooq fallback is deferred / out-of-scope for Phase 2 Wave 1.** Plan 02-03 (yahoo JP client) and Plan 02-04 (orchestrator) MUST NOT depend on Stooq as a fallback during normal execution. If yahoo fails, the ticker is logged to the failure summary and skipped for that day (consistent with D-15 "1 銘柄の失敗が全体を止めない"). The `stooq.ts` module is still planned in the plan set but its implementation must be gated behind `if (process.env.STOOQ_APIKEY)` and tested only via fixtures.
3. **D-12 is updated in practice:** "yahoo-finance2 primary → (optional) Stooq fallback when STOOQ_APIKEY is configured". For the initial Phase 2 ship, STOOQ_APIKEY will be absent and Stooq is dead code in production.
4. **D-14 is updated:** the Stooq content-type guard now checks for the literal substring `Get your apikey` in addition to HTML tags. Both are failure modes requiring fallback skip.
5. **Tests:**
   - Unit test: given a yahoo chart() fixture with `close != adjclose`, assert the fetcher stores `raw_close = fixture.quotes[i].close` and `close = fixture.quotes[i].adjclose`.
   - Unit test: given the AAPL 2020-08-31 split row, assert that `raw_close` is **not** `close` (confirming we are not accidentally writing the same column twice).
   - Unit test: given the captured `stooq-aapl-us.csv` fixture (the `Get your apikey:` body), assert the Stooq parser rejects it with a specific `StooqUnavailableError` (or similar) rather than parsing garbage.
6. **`config/tickers.ts` and `toStooqSymbol()` (D-28) can still be built** — they just become unused in production until/unless STOOQ_APIKEY is provisioned. Code stays; cron path does not call it.

### Deferred item (add to 02-CONTEXT.md §Deferred Ideas)

- **Stooq secondary cross-check:** re-enable after manually acquiring a `STOOQ_APIKEY` and storing it in Vercel env vars. Target: a post-Phase-2 audit plan that replays N days of data and alerts on `raw_close` divergence > 0.5% between yahoo and Stooq. This would be the "split detection" feature originally contemplated by option (c).
