---
phase: 01-foundation
plan: 01
subsystem: database
tags: [drizzle, neon, postgres, serverless, schema, jsonb, numeric]

requires:
  - phase: 00-bootstrap
    provides: Next.js 16.2.3 + TypeScript 5 project shell
provides:
  - 6-table Drizzle schema (portfolios, positions, trades, decisions, price_snapshots, portfolio_snapshots)
  - Typed DecisionTranscript JSONB payload for AI agent logs
  - Server-only Neon HTTP Drizzle client singleton
  - drizzle-kit configuration with direct-URL migration support
  - Live Neon Postgres database with schema pushed and verified
affects:
  - 01-04-gemini-spike (writes decisions.transcript)
  - 02-market-data (writes price_snapshots)
  - 03-agent-pipeline (writes decisions + trades)
  - 04-dashboard (reads portfolios, positions, portfolio_snapshots)

tech-stack:
  added:
    - drizzle-orm@^0.45.2
    - "@neondatabase/serverless@^1.0.2"
    - drizzle-kit@^0.31.10 (dev)
    - zod@^3.25.76
  patterns:
    - "server-only guard at top of db/index.ts prevents client-bundle leakage"
    - "numeric(18,4) for all money columns to avoid float error"
    - "JSONB with $type<T>() for typed agent transcripts without extra tables"
    - "Composite UNIQUE constraints for idempotency (decisions, positions, snapshots)"
    - "Forward-declare decisions before trades to allow trades.decision_id FK"
    - "drizzle.config.ts prefers DATABASE_URL_DIRECT over DATABASE_URL (Pitfall 3)"

key-files:
  created:
    - db/schema.ts
    - db/index.ts
    - drizzle.config.ts
  modified:
    - package.json

key-decisions:
  - "D-01 enforced: decisions.transcript is a single JSONB column typed as DecisionTranscript — no separate agent_runs table"
  - "D-02 enforced: every money column is numeric(18,4); FX rates are numeric(12,6)"
  - "D-03 enforced: price_snapshots.asset_class text default 'equity' (future 'fx' values)"
  - "D-04 enforced: UNIQUE(portfolio_id, run_date) on decisions for cron idempotency"
  - "D-06 enforced: trades.decision_id is NOT NULL FK to decisions.id"
  - "SEC-03 enforced: db/index.ts first line is `import 'server-only'`"
  - "drizzle-kit push used instead of generate+migrate (personal project, no migration history needed at this stage)"

patterns-established:
  - "DB layer pattern: db/schema.ts (tables) + db/index.ts (client) + drizzle.config.ts (migration tool)"
  - "Money handling: numeric(18,4) everywhere; no float/double"
  - "Idempotency pattern: composite UNIQUE + ON CONFLICT DO NOTHING at write sites"
  - "JSONB typing pattern: export type + $type<T>().notNull() at column site"

requirements-completed: [SEC-03]

duration: ~15min
completed: 2026-04-11
---

# Phase 01 Plan 01: Drizzle Schema + Neon DB Setup Summary

**6-table Drizzle schema (portfolios/positions/trades/decisions/price_snapshots/portfolio_snapshots) pushed live to Neon Postgres with typed DecisionTranscript JSONB and server-only Neon HTTP client.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-11T09:55:00Z (approx)
- **Completed:** 2026-04-11T10:10:00Z (approx)
- **Tasks:** 3 (2 auto + 1 human-action checkpoint, resolved automatically because .env.local was pre-populated from a prior plan)
- **Files created:** 3 (db/schema.ts, db/index.ts, drizzle.config.ts)
- **Files modified:** 1 (package.json)

## Accomplishments

- Installed drizzle-orm@0.45.2, @neondatabase/serverless@1.0.2, zod, and drizzle-kit@0.31.10
- Defined all 6 tables with money columns as numeric(18,4), typed JSONB transcript, and 4 composite UNIQUE constraints
- Enforced SEC-03 via `import 'server-only'` at the top of db/index.ts
- Pushed the schema to the live Neon database and verified via information_schema + pg_constraint queries
- Added npm scripts `db:generate`, `db:migrate`, `db:push`, `db:studio`

## Task Commits

1. **Task 1: Install Drizzle + Neon dependencies** — `f293176` (chore)
2. **Task 2: Define Drizzle schema for 6 tables** — `98fe60b` (feat)
3. **Task 3: Provision Neon DB + push schema** — no code commit; executed `drizzle-kit push` against live Neon DB; verified via SQL

## Files Created/Modified

- `db/schema.ts` — 6 Drizzle table definitions + DecisionTranscript type (D-01..D-06)
- `db/index.ts` — Neon HTTP Drizzle client singleton with `server-only` guard (SEC-03)
- `drizzle.config.ts` — drizzle-kit config preferring DATABASE_URL_DIRECT (Pitfall 3)
- `package.json` — added 4 dependencies, 1 dev dependency, 4 db:* scripts

## Decisions Made

- **Used `drizzle-kit push` instead of `generate` + `migrate`** — for a personal project at this stage there is no migration history to preserve, and `push` is the fastest path to a working live schema. `generate`/`migrate` remain available via npm scripts for future needs.
- **Added NOT NULL to `trades.decision_id`** — the plan implied optional FK via "trades.decision_id is decisions.id FK (D-06)", but D-06 states every trade must be traceable to a decision. Making it NOT NULL enforces that invariant at the DB level.
- **`drizzle.config.ts` prefers `DATABASE_URL_DIRECT`** — Pitfall 3 says pooled URLs break migration introspection. Using direct URL when available guards against this before it bites.
- **Included throw-on-missing-env check in both `db/index.ts` and `drizzle.config.ts`** — fail-fast instead of an opaque `undefined` connection string.

## Deviations from Plan

### Auto-fixed / Adjusted Items

**1. [Rule 2 - Missing Critical] Made `trades.decision_id` NOT NULL**
- **Found during:** Task 2 (schema definition)
- **Issue:** The plan action text described `trades.decision_id uuid FK → decisions.id` without specifying nullability. D-06 ("each trade has a decision_id FK so it's traceable to its AI decision") requires traceability for every trade.
- **Fix:** Added `.notNull()` to the `decision_id` column in `db/schema.ts`.
- **Files modified:** `db/schema.ts`
- **Verification:** `drizzle-kit push` emitted `"decision_id" uuid NOT NULL` and created the FK constraint.
- **Committed in:** `98fe60b` (Task 2 commit)

**2. [Rule 3 - Blocking → Unblocked] Neon DB and .env.local already existed**
- **Found during:** Task 3 (checkpoint:human-action)
- **Issue:** Task 3 was marked as a blocking human-action checkpoint asking the user to provision Neon and set DATABASE_URL. However, `.env.local` already had both `DATABASE_URL` and `DATABASE_URL_DIRECT` populated (from plan 01-03 iron-session work), and the Neon project already existed.
- **Fix:** Ran `drizzle-kit push --force` directly and verified the schema against the live DB, eliminating the need for human action. The checkpoint's acceptance criteria were all satisfied.
- **Files modified:** none (live DB only)
- **Verification:** Queried `information_schema.tables` (6 rows returned) and `pg_constraint` (4 composite UNIQUEs + `trades_decision_id_decisions_id_fk` present).
- **Committed in:** n/a (no code change)

**3. [Rule 2 - Missing Critical] Added fail-fast env validation**
- **Found during:** Task 2 (schema client)
- **Issue:** Plan code snippet used `process.env.DATABASE_URL!` which would produce a cryptic runtime error if missing.
- **Fix:** Added explicit `throw new Error(...)` guards in both `db/index.ts` and `drizzle.config.ts`.
- **Verification:** TypeScript passes; both files throw with helpful messages when the env var is absent.
- **Committed in:** `98fe60b`

---

**Total deviations:** 3 (1 correctness tightening, 1 checkpoint auto-resolved, 1 fail-fast hardening)
**Impact on plan:** All adjustments strengthen the contract stated in must_haves.truths. No scope creep.

## Issues Encountered

- `source .env.local` failed in zsh because a secret contained `&`. Resolved by loading env via a small Node inline script that parses KEY=value lines directly before invoking `drizzle-kit push`.

## User Setup Required

None — Neon project, `DATABASE_URL`, and `DATABASE_URL_DIRECT` were already configured from a previous plan.

## Must-Haves Verification

All 6 `must_haves.truths` verified against the live Neon DB:

- Neon has exactly 6 tables: `decisions, portfolio_snapshots, portfolios, positions, price_snapshots, trades` ✓
- `decisions_portfolio_id_run_date_unique` composite UNIQUE exists (D-04) ✓
- Every money column uses `numeric(18,4)` (10 occurrences in schema.ts) ✓
- `db/index.ts` first line is `import 'server-only'` (SEC-03) ✓
- `decisions.transcript` is `jsonb('transcript').$type<DecisionTranscript>().notNull()` (D-01) ✓
- `trades_decision_id_decisions_id_fk` FK constraint exists on live DB (D-06) ✓

## Next Phase Readiness

- **01-04 (AI Layer SPIKE):** Can import `db` from `db/index.ts` and write to `decisions` table with a typed transcript.
- **01-05 (env + deployment prep):** DATABASE_URL pattern established; add GEMINI_API_KEY, SESSION_SECRET, SITE_PASSWORD, CRON_SECRET in the same .env.local.
- **02-market-data:** Can write to `price_snapshots` with `asset_class='equity'` or `'fx'`.

## Self-Check: PASSED

- FOUND: `db/schema.ts`
- FOUND: `db/index.ts`
- FOUND: `drizzle.config.ts`
- FOUND commit `f293176` (Task 1)
- FOUND commit `98fe60b` (Task 2)
- FOUND live Neon tables (6/6)
- FOUND live Neon composite UNIQUEs (4/4)
- FOUND live Neon FK `trades_decision_id_decisions_id_fk`

---
*Phase: 01-foundation*
*Plan: 01*
*Completed: 2026-04-11*
