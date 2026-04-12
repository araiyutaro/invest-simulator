---
phase: 2
slug: market-data
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-12
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

_Populated during planning. Each PLAN task must map to at least one row here._

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 2-00-01 | 00 | 0 | — | — | SPIKE: determine raw_close semantics (yahoo vs Stooq TSLA 2022-08 split) | spike | `pnpm tsx scripts/spike-raw-close.ts` | ❌ W0 | ⬜ pending |
| 2-01-01 | 01 | 1 | DATA-05 | T-2-01 | whitelist rejects non-listed ticker | unit | `pnpm vitest run tickers` | ❌ W0 | ⬜ pending |
| 2-01-02 | 01 | 1 | DATA-05 | — | isWhitelisted() type narrowing works | unit | `pnpm vitest run tickers` | ❌ W0 | ⬜ pending |
| 2-02-01 | 02 | 1 | — | — | drizzle migration adds OHLCV cols + news/fundamentals tables | integration | `pnpm drizzle-kit push && pnpm vitest run schema` | ❌ W0 | ⬜ pending |
| 2-03-01 | 03 | 2 | DATA-04 | — | isWeekend() + holiday list skips JP/US closed days | unit | `pnpm vitest run calendar` | ❌ W0 | ⬜ pending |
| 2-03-02 | 03 | 2 | DATA-04 | T-2-02 | timezone: NY close vs Tokyo close resolution | unit | `pnpm vitest run calendar` | ❌ W0 | ⬜ pending |
| 2-04-01 | 04 | 2 | DATA-01, DATA-03 | — | yahoo-finance2 chart() returns parsed OHLCV for US ticker (mocked) | unit | `pnpm vitest run yahoo` | ❌ W0 | ⬜ pending |
| 2-04-02 | 04 | 2 | DATA-01 | — | yahoo chart() empty response triggers stale-data error | unit | `pnpm vitest run yahoo` | ❌ W0 | ⬜ pending |
| 2-05-01 | 05 | 2 | DATA-01 | — | Finnhub companyNews parses (fixture) | unit | `pnpm vitest run finnhub` | ❌ W0 | ⬜ pending |
| 2-05-02 | 05 | 2 | DATA-01 | — | Finnhub basicFinancials parses (fixture) | unit | `pnpm vitest run finnhub` | ❌ W0 | ⬜ pending |
| 2-05-03 | 05 | 2 | — | T-2-03 | Finnhub 401 (bad key) → typed error | unit | `pnpm vitest run finnhub` | ❌ W0 | ⬜ pending |
| 2-06-01 | 06 | 3 | DATA-02 | — | yahoo failure → Stooq fallback triggered (mocked) | integration | `pnpm vitest run fallback` | ❌ W0 | ⬜ pending |
| 2-06-02 | 06 | 3 | DATA-02 | — | Stooq HTML-200 error detection (content-type check) | unit | `pnpm vitest run stooq` | ❌ W0 | ⬜ pending |
| 2-06-03 | 06 | 3 | DATA-02 | — | Stooq CSV parser handles 6-col rows | unit | `pnpm vitest run stooq` | ❌ W0 | ⬜ pending |
| 2-07-01 | 07 | 3 | DATA-03, D-03 | — | FX rate (JPY=X) upsert to price_snapshots assetClass='fx' | integration | `pnpm vitest run fx` | ❌ W0 | ⬜ pending |
| 2-08-01 | 08 | 4 | DATA-03 | — | orchestrator writes price_snapshots row (upsert, idempotent) | integration | `pnpm vitest run orchestrator` | ❌ W0 | ⬜ pending |
| 2-08-02 | 08 | 4 | DATA-04 | — | holiday run creates market_closed=true row | integration | `pnpm vitest run orchestrator` | ❌ W0 | ⬜ pending |
| 2-08-03 | 08 | 4 | DATA-05 | T-2-01 | non-whitelisted ticker short-circuits before API call | integration | `pnpm vitest run orchestrator` | ❌ W0 | ⬜ pending |
| 2-09-01 | 09 | 5 | — | T-2-04 | `/api/cron/fetch-market-data` requires CRON_SECRET header | integration | `pnpm vitest run route` | ❌ W0 | ⬜ pending |
| 2-09-02 | 09 | 5 | DATA-03 | — | route returns failure summary JSON shape | integration | `pnpm vitest run route` | ❌ W0 | ⬜ pending |
| 2-10-01 | 10 | 5 | — | — | `scripts/backfill.ts` runs 1-ticker backfill end-to-end against real Neon dev | manual | `pnpm tsx scripts/backfill.ts --symbol AAPL --days 5` | ❌ W0 | ⬜ manual |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*All rows marked `❌ W0` require Wave 0 to create the test file or install fixtures.*

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` — confirm alias `@/` works for lib/market imports (inherited from Phase 1)
- [ ] `lib/__tests__/fixtures/market/yahoo-chart-aapl.json` — captured yahoo-finance2 chart() response for AAPL (100-day window)
- [ ] `lib/__tests__/fixtures/market/yahoo-chart-7203-T.json` — captured yahoo response for Toyota
- [ ] `lib/__tests__/fixtures/market/finnhub-news-aapl.json` — captured /company-news response
- [ ] `lib/__tests__/fixtures/market/finnhub-basicfinancials-aapl.json` — captured basic financials
- [ ] `lib/__tests__/fixtures/market/stooq-7203-jp.csv` — sample Stooq CSV for fallback test
- [ ] `lib/__tests__/fixtures/market/stooq-error.html` — sample Stooq error HTML (for content-type detection)
- [ ] `scripts/spike-raw-close.ts` — Wave 0 SPIKE runner for D-08 decision
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

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (fixtures, SPIKE script)
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter (after planner finalizes Per-Task map)

**Approval:** pending
