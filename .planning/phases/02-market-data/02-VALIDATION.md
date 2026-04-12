---
phase: 2
slug: market-data
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-12
updated: 2026-04-12
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^3 (already installed in Phase 1) |
| **Config file** | `vitest.config.ts` (Phase 1 established) |
| **Quick run command** | `pnpm vitest run --reporter=dot --no-coverage` |
| **Full suite command** | `pnpm vitest run --coverage` |
| **Estimated runtime** | ~25 seconds (unit + integration with mocks); live integration ~60 seconds (manual opt-in) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run --reporter=dot --no-coverage`
- **After every plan wave:** Run `pnpm vitest run --coverage`
- **Before `/gsd-verify-work`:** Full suite must be green + live integration probe (manual)
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

_Aligned with the final 11-plan structure. Every task from every PLAN.md has a row here._

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-00-01 | 00 | 0 | — | — | SPIKE: resolve D-08 raw_close semantics (AAPL 2020-08-31 split); option (a) or (b) only | spike | `pnpm tsx scripts/spike-raw-close.ts` | ❌ W0 | ⬜ pending |
| 02-00-02 | 00 | 0 | — | — | Decision doc records (a) or (b) with numeric evidence | doc | `test -s .planning/phases/02-market-data/02-SPIKE-RAW-CLOSE.md && grep -qE "\\(a\\)\|\\(b\\)" .planning/phases/02-market-data/02-SPIKE-RAW-CLOSE.md` | ❌ W0 | ⬜ pending |
| 02-00-03 | 00 | 0 | — | — | Offline fixtures captured for yahoo/Finnhub/Stooq (US + JP + error HTML) | fixture | `pnpm tsx scripts/capture-fixtures.ts` | ❌ W0 | ⬜ pending |
| 02-01-01 | 01 | 1 | DATA-05 | T-2-01 | `TICKERS` whitelist literal + `env.FINNHUB_API_KEY` + `env.CRON_SECRET` added | unit | `pnpm vitest run tickers --reporter=dot --no-coverage` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | DATA-05 | T-2-01 | `isWhitelisted(s)` type-narrows; `getTicker('XYZ')` throws `WhitelistViolationError` | unit | `pnpm vitest run whitelist --reporter=dot --no-coverage` | ❌ W0 | ⬜ pending |
| 02-01-03 | 01 | 1 | — | — | Shared `lib/market/types.ts` + `lib/market/errors.ts` exports compile | unit | `pnpm tsc --noEmit` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 1 | DATA-03 | — | [BLOCKING] drizzle schema adds OHLCV/news/fundamentals tables; `drizzle-kit push` succeeds against dev Neon | integration | `pnpm drizzle-kit push && pnpm vitest run schema --reporter=dot --no-coverage` | ❌ W0 | ⬜ pending |
| 02-02-02 | 02 | 1 | DATA-03 | — | Unique constraints `(symbol, price_date)` and `(symbol, as_of_date)` enforced | integration | `pnpm vitest run schema --reporter=dot --no-coverage` | ❌ W0 | ⬜ pending |
| 02-03-01 | 03 | 2 | DATA-04 | T-2-02 | `isMarketClosed()` + holiday list + `lastBusinessDay()` with NY/JST TZ; D-19 16:30 NY cutoff | unit | `pnpm vitest run calendar --reporter=dot --no-coverage` | ❌ W0 | ⬜ pending |
| 02-04-01 | 04 | 2 | DATA-01, DATA-03 | — | `fetchOhlcvYahoo` + `fetchFxUsdJpy` parse fixture; empty/stale triggers error; p-limit throttle | unit | `pnpm vitest run yahoo --reporter=dot --no-coverage` | ❌ W0 | ⬜ pending |
| 02-05-01 | 05 | 2 | DATA-01 | T-2-03 | `fetchCompanyNews` + `fetchBasicFinancials` parse fixtures; JP/non-whitelist short-circuit; 401 → FinnhubError; `vi.stubGlobal('fetch')` test strategy | unit | `pnpm vitest run finnhub --reporter=dot --no-coverage` | ❌ W0 | ⬜ pending |
| 02-06-01 | 06 | 3 | DATA-02 | — | `fetchOhlcvStooq` parses CSV fixture; content-type guard rejects HTML (error fixture) | unit | `pnpm vitest run stooq --reporter=dot --no-coverage` | ❌ W0 | ⬜ pending |
| 02-07-01 | 07 | 4 | DATA-03 | — | `upsertPriceSnapshots` / `upsertFundamentalsSnapshots` use `sql\`excluded.*\`` pattern; idempotent against live Neon dev | integration | `pnpm vitest run persist --reporter=dot --no-coverage` | ❌ W0 | ⬜ pending |
| 02-08-01 | 08 | 5 | DATA-01, DATA-02, DATA-03, DATA-04, DATA-05 | T-2-01 | `fetchMarketData()` composes all primitives; D-13 three fallback triggers; D-15 per-ticker isolation; holiday writes market_closed row; non-whitelist filtered out; budget ≤280 lines or helpers extracted | integration | `pnpm vitest run orchestrator --reporter=dot --no-coverage` | ❌ W0 | ⬜ pending |
| 02-09-01 | 09 | 6 | DATA-03 | T-2-04 | `/api/cron/fetch-market-data` requires `Authorization: Bearer ${CRON_SECRET}`; proxy.ts bypass verified at line covering `/api/cron/*`; unauthenticated request reaches handler and returns 401 | integration | `pnpm vitest run route --reporter=dot --no-coverage && pnpm tsc --noEmit && grep -n "api/cron" proxy.ts` | ❌ W0 | ⬜ pending |
| 02-10-01 | 10 | 6 | — | — | `scripts/backfill.ts` runs 1-ticker backfill end-to-end against real Neon dev; rate-limit budget honored | manual | `pnpm tsx scripts/backfill.ts --symbol AAPL --days 5` | ❌ W0 | ⬜ manual |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*All rows marked `❌ W0` require Wave 0 to create the test file or install fixtures. `wave_0_complete` flips to `true` at runtime once Plan 00 commits.*

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` — confirm alias `@/` works for lib/market imports (inherited from Phase 1)
- [ ] `lib/__tests__/fixtures/market/yahoo-chart-aapl.json` — captured yahoo-finance2 chart() response for AAPL (100-day window)
- [ ] `lib/__tests__/fixtures/market/yahoo-chart-7203-T.json` — captured yahoo response for Toyota
- [ ] `lib/__tests__/fixtures/market/finnhub-news-aapl.json` — captured /company-news response
- [ ] `lib/__tests__/fixtures/market/finnhub-basicfinancials-aapl.json` — captured basic financials
- [ ] `lib/__tests__/fixtures/market/stooq-7203-jp.csv` — sample Stooq CSV for fallback test
- [ ] `lib/__tests__/fixtures/market/stooq-error.html` — sample Stooq error HTML (for content-type detection)
- [ ] `scripts/spike-raw-close.ts` — Wave 0 SPIKE runner for D-08 decision (options a/b only; c out of scope)
- [ ] `.planning/phases/02-market-data/02-SPIKE-RAW-CLOSE.md` — SPIKE report (MUST close D-08 amendment before Wave 1 starts)

*Wave 0 blocks all subsequent waves. No Wave 1 task can start until SPIKE is recorded and D-08 resolved.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 100-day backfill completes in under 5 minutes | DATA-03 | Vercel timeout + real API rate limits — only measurable against live endpoints | `pnpm tsx scripts/backfill.ts --full` against dev Neon; watch wall-clock time |
| Real Stooq fallback fires on real yahoo outage | DATA-02 | Cannot reliably force yahoo outage in automation | Temporarily point yahoo-finance2 `.chart()` to invalid URL via env override; run orchestrator; verify `source='stooq'` row appears |
| 2026 JP holiday (e.g. 2026-05-05 Children's Day) produces market_closed row | DATA-04 | Date-dependent test drifts over time | Run orchestrator with `--as-of 2026-05-05`; verify price_snapshots row has `market_closed=true, source='none'` |
| TSE timezone boundary: Japanese data is NOT used before 15:00 JST close | DATA-04 | Time-sensitive edge case, PITFALLS #4 | Run orchestrator at 14:59 JST and 15:01 JST on a trading day; verify first skips JP, second includes JP |
| `/api/cron/fetch-market-data` unauthenticated request reaches handler (proxy.ts bypass works) | DATA-03 | Confirms proxy.ts `/api/cron/*` bypass is still in place | `curl -i -X POST http://localhost:3000/api/cron/fetch-market-data` → expect 401 from handler (not 302 redirect from proxy) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (fixtures, SPIKE script)
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter
- [x] Per-Task Map aligned with final 11-plan structure

**Approval:** ready (pending runtime Wave 0 completion)
