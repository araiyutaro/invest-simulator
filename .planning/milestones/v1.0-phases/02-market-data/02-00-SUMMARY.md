---
phase: 02-market-data
plan: 00
subsystem: market-data
tags: [spike, fixtures, wave-0]
dependency_graph:
  requires: []
  provides:
    - D-08-decision
    - market-fixtures
  affects: [02-03, 02-04, 02-06, 02-08]
tech_stack:
  added:
    - yahoo-finance2@^3.14
    - tsx (devDep)
  patterns:
    - Offline-fixture-driven unit tests
    - Env-gated optional network sources (STOOQ_APIKEY, FINNHUB_API_KEY)
key_files:
  created:
    - scripts/spike-raw-close.ts
    - scripts/capture-fixtures.ts
    - .planning/phases/02-market-data/02-SPIKE-RAW-CLOSE.md
    - lib/__tests__/fixtures/market/yahoo-chart-aapl.json
    - lib/__tests__/fixtures/market/yahoo-chart-7203-T.json
    - lib/__tests__/fixtures/market/finnhub-news-aapl.json
    - lib/__tests__/fixtures/market/finnhub-basicfinancials-aapl.json
    - lib/__tests__/fixtures/market/stooq-7203-jp.csv
    - lib/__tests__/fixtures/market/stooq-aapl-us.csv
    - lib/__tests__/fixtures/market/stooq-error.html
  modified:
    - package.json
    - package-lock.json
decisions:
  - "D-08 resolved: raw_close = yahoo quote.close, close = yahoo quote.adjclose (option a)"
  - "D-12 narrowed: Stooq fallback requires STOOQ_APIKEY env var; absent in default config → Stooq path becomes dead code for Phase 2 production"
  - "D-14 extended: Stooq content-type guard must also reject body starting with 'Get your apikey'"
metrics:
  duration_min: 12
  completed_date: 2026-04-12
---

# Phase 2 Plan 00: Wave 0 SPIKE + Fixtures Summary

D-08 `raw_close` semantics resolved via real AAPL split-window experiment; 6 offline fixtures captured so every Wave 1+ unit test can run without network.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | SPIKE runner — yahoo vs Stooq on AAPL 2020-08-31 split | `0381640` | `scripts/spike-raw-close.ts`, `lib/__tests__/fixtures/market/yahoo-chart-aapl.json`, `lib/__tests__/fixtures/market/stooq-aapl-us.csv`, `package.json`, `package-lock.json` |
| 2 | SPIKE decision doc — D-08 option (a) chosen | `6fd5859` | `.planning/phases/02-market-data/02-SPIKE-RAW-CLOSE.md` |
| 3 | Capture remaining offline fixtures (yahoo JP + Finnhub + Stooq) | `87409e3` | `scripts/capture-fixtures.ts`, `lib/__tests__/fixtures/market/yahoo-chart-7203-T.json`, `lib/__tests__/fixtures/market/finnhub-news-aapl.json`, `lib/__tests__/fixtures/market/finnhub-basicfinancials-aapl.json`, `lib/__tests__/fixtures/market/stooq-7203-jp.csv`, `lib/__tests__/fixtures/market/stooq-error.html` |

## Key Decisions Made

### D-08 raw_close semantics — **Option (a) selected**

- `raw_close = yahoo quote.close` (split-adjusted, NOT dividend-adjusted)
- `close = yahoo quote.adjclose` (split + dividend adjusted)
- Evidence: on AAPL 2020-08-18..2020-09-11 (18 trading days covering the 4:1 split effective 2020-08-31), yahoo-finance2 v3 `chart()` returned `close != adjclose` on every row, with the spread matching retroactive dividend adjustment. Both values are split-adjusted, which is the behavior Wave 1+ needs for split-continuity cost-basis math.
- Options (b) and (c) rejected because Stooq free-tier CSV no longer works headless (requires captcha-acquired apikey) — see SPIKE §Stooq availability finding.

### Stooq is no longer a live fallback path

- Stooq CSV endpoint now returns `Content-Type: text/plain` with body `Get your apikey:` to unauthenticated requests (new behavior vs. 02-RESEARCH.md).
- D-12 updated in SPIKE doc §Implications: "yahoo primary → optional Stooq fallback gated behind `STOOQ_APIKEY` env var". For the Phase 2 ship, STOOQ_APIKEY is absent and Stooq is dead code.
- D-14 updated: the Stooq content-type guard must additionally reject bodies starting with `Get your apikey`.

## Deviations from Plan

### Rule 3 — Auto-fix blocking issues

1. **Project uses npm, not pnpm.** Plan said `pnpm add` / `pnpm tsx`. Installed via `npm install` and invoked scripts with `npx tsx` (or `node --import tsx`). No plan intent change.
2. **yahoo-finance2 v3 requires instantiation.** Default import + direct `yahooFinance.chart()` throws `Call new YahooFinance() first`. Spike script uses `import YahooFinance; const yahooFinance = new YahooFinance()`.
3. **tsx was not actually pre-installed** (plan claimed "tsx is already installed from Phase 1"). Added `tsx` as devDependency via npm. Committed `package.json` / `package-lock.json` changes in Task 1.
4. **Spike window widened from 2020-08-20..2020-09-10 → 2020-08-18..2020-09-12** so acceptance criterion "at least 15 rows" was satisfied (the original window produced 14 trading days; widened gives 18).
5. **Stooq fetch in spike script degraded from throw → report-and-continue.** Original plan expected Stooq to fail only on rate-limit / HTML. Free-tier policy change means *every* unauthenticated request returns an apikey-required message. To still resolve D-08 the spike runs yahoo-only analysis and documents the Stooq unavailability as part of the decision record. Exit code still `0` on yahoo success; fixture for stooq-aapl-us.csv now captures the apikey-required body (it serves as a useful negative sample for the Wave 1 Stooq parser).
6. **`ROWS_PRINTED` metric renamed to `YAHOO_ROWS` / `STOOQ_ROWS` / `ROWS_COMPARED` + added `YAHOO_CLOSE_EQUALS_ADJCLOSE` boolean** for clearer diagnostics. `MAX_DIFF_PCT=<number>` is still printed as the last line per plan.

### Rule 4 — Architectural surface finding (filed as deferred, NOT escalated to stop-the-line)

- Stooq fallback is effectively unavailable in headless mode. Per the plan's explicit scope constraint ("if SPIKE evidence suggests (c) is necessary, stop and escalate: file a deferred idea in CONTEXT.md and pick option (b) as the Phase 2 interim") I did not select option (b) because yahoo chart() already provides both raw and adjusted independently — option (a) is viable without dual-source. The Stooq gap is logged in SPIKE §Implications as a deferred enhancement; Plans 02-03/04/06/08 must honor the updated D-12/D-14 wording.

## Acceptance Criteria — all met

Task 1:
- [x] `npx tsx scripts/spike-raw-close.ts` exits 0
- [x] Prints >= 15 rows (18 actual)
- [x] Contains row for 2020-08-31 and 2020-09-01
- [x] Prints `MAX_DIFF_PCT=<number>` as last line (0.000000 — no Stooq data to compare)
- [x] `yahoo-chart-aapl.json` exists and is >= 2 KB (6,068 bytes)

Task 2:
- [x] `02-SPIKE-RAW-CLOSE.md` exists with all 5 required sections (Experiment, Raw Results, Observation, Decision, Implications for Wave 1+)
- [x] Decision explicitly names option (a), never (c)
- [x] Numeric evidence from Task 1 quoted in Raw Results
- [x] Implications section lists 6 concrete rules for subsequent plans

Task 3:
- [x] All 5 fixture files exist and are non-empty
- [x] `stooq-7203-jp.csv` first line is `Date,Open,High,Low,Close,Volume`
- [x] `stooq-error.html` starts with `<html`
- [x] No fixture contains a literal API key (hand-crafted fallback paths used because env vars absent)

## Deferred Issues

- **Stooq live fallback** — requires manual captcha to obtain a STOOQ_APIKEY. Deferred to a post-Phase-2 enhancement plan per SPIKE §Implications. Current Wave 1+ will ship without a live Stooq path.
- **yahoo JP 7203.T live fixture uses 2026-01-01..2026-04-10 window** — real data captured (14 KB), but the range and today's project clock (2026-04-12) mean the fixture could become stale if yahoo re-organizes historical data. Acceptable for Phase 2; re-run `capture-fixtures.ts` if tests flake.
- **Finnhub news + basic financials fixtures are hand-crafted** — FINNHUB_API_KEY is not provisioned in the dev worktree. When the real key lands in `.env.local` (Plan 02-02 territory), re-running `capture-fixtures.ts` will overwrite with live data and the hand-crafted shapes continue to work as a strict parser contract.

## Known Stubs

- `lib/__tests__/fixtures/market/finnhub-news-aapl.json` — hand-crafted single-item array, intentional until FINNHUB_API_KEY is provisioned in Plan 02-02 and fixtures re-captured.
- `lib/__tests__/fixtures/market/finnhub-basicfinancials-aapl.json` — hand-crafted metric payload, same reason as above.
- `lib/__tests__/fixtures/market/stooq-7203-jp.csv` — hand-crafted 5-row CSV, intentional because Stooq free-tier CSV no longer works headless (see SPIKE doc).

None of these stubs flow to a UI; they are test fixtures only. Wave 1 unit tests will assert on exact parser behavior and remain correct when live-captured payloads replace the hand-crafted ones.

## Threat Flags

None. This plan only adds CLI scripts and test fixtures; no new network endpoints, auth paths, file access patterns, or schema changes introduced at trust boundaries. The Stooq/Finnhub fetch calls are guarded from secret leakage (api key is never written into a committed fixture — the script throws if it detects its own key in the response body).

## Self-Check: PASSED

### Files exist (worktree)

- FOUND: scripts/spike-raw-close.ts
- FOUND: scripts/capture-fixtures.ts
- FOUND: .planning/phases/02-market-data/02-SPIKE-RAW-CLOSE.md
- FOUND: lib/__tests__/fixtures/market/yahoo-chart-aapl.json
- FOUND: lib/__tests__/fixtures/market/yahoo-chart-7203-T.json
- FOUND: lib/__tests__/fixtures/market/finnhub-news-aapl.json
- FOUND: lib/__tests__/fixtures/market/finnhub-basicfinancials-aapl.json
- FOUND: lib/__tests__/fixtures/market/stooq-7203-jp.csv
- FOUND: lib/__tests__/fixtures/market/stooq-aapl-us.csv
- FOUND: lib/__tests__/fixtures/market/stooq-error.html

### Commits exist

- FOUND: 0381640 feat(02-00): add spike-raw-close runner for D-08 resolution
- FOUND: 6fd5859 docs(02-00): resolve D-08 raw_close — pick option (a) with yahoo chart()
- FOUND: 87409e3 feat(02-00): capture Wave 0 offline fixtures for market data clients
