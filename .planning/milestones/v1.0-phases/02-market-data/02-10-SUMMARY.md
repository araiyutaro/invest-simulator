---
phase: 02-market-data
plan: 10
subsystem: backfill-cli
tags: [cli, backfill, scripts, validation]
dependency_graph:
  requires: [lib/market/orchestrator.ts]
  provides: [scripts/backfill.ts, backfill npm script]
  affects: []
tech_stack:
  added: []
  patterns: [dynamic-import for CLI fast-exit, manual .env.local parsing, --conditions react-server for server-only bypass]
key_files:
  created: [scripts/backfill.ts]
  modified: [package.json, .planning/phases/02-market-data/02-VALIDATION.md]
decisions:
  - "Dynamic import() for orchestrator module tree so --help exits instantly without loading DB/API dependencies"
  - "Manual .env.local parsing instead of dotenv/config (dotenv not installed; ampersands in values break shell source)"
  - "--conditions react-server flag in package.json script to bypass server-only guard in orchestrator import chain"
metrics:
  duration: 7min
  completed: 2026-04-12T05:59:00Z
  tasks_completed: 2
  tasks_total: 2
---

# Phase 02 Plan 10: Backfill CLI + Validation Map Summary

Local CLI tool for 100-day historical backfill via fetchMarketData(mode='backfill'), with --conditions react-server to bypass server-only in the orchestrator import chain.

## Tasks

| # | Task | Commit | Key Files |
|---|------|--------|-----------|
| 1 | Backfill CLI (scripts/backfill.ts + package.json script) | `c4e6520` | scripts/backfill.ts, package.json |
| 2 | Update 02-VALIDATION.md task verification map | `a427221` | .planning/phases/02-market-data/02-VALIDATION.md |

## Implementation Notes

### Task 1: Backfill CLI

- `scripts/backfill.ts` is a standalone CLI that wraps `fetchMarketData()` with `--symbol`, `--days`, and `--mode` flags
- Uses dynamic `import()` for the orchestrator module so `--help` exits instantly without loading the full module tree (date-fns-tz, yahoo-finance2, drizzle, etc.)
- Manual `.env.local` parser replaces `dotenv/config` (not installed in this project; .env.local values contain ampersands that break shell `source`)
- Package.json `backfill` script includes `--conditions react-server` to resolve `server-only` to its empty no-op export (required because orchestrator -> persist -> db/index.ts all import `server-only`)
- `pnpm backfill --help` verified: exits 0, prints usage

### Task 2: Validation Map

- Updated all Task IDs from `02-XX-NN` to `2-XX-NN` format
- 17 rows across 11 plans (00-10), matching actual task counts per plan
- All plans 00-09 marked as green (completed); Plan 10 tasks marked green after this execution
- Removed stale `Wave 0` dependency markers since Wave 0 has been completed

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Replaced dotenv/config with manual .env.local parser**
- **Found during:** Task 1
- **Issue:** `dotenv` package listed in devDependencies but not installed in node_modules (pnpm lockfile mismatch in worktree)
- **Fix:** Wrote a manual `.env.local` parser using `node:fs` (12 lines); handles comments, empty lines, and preserves existing env vars
- **Files modified:** scripts/backfill.ts
- **Commit:** `c4e6520`

**2. [Rule 3 - Blocking] Restructured to dynamic import for --help fast path**
- **Found during:** Task 1
- **Issue:** Static `import { fetchMarketData }` eagerly loaded the entire module chain (calendar -> date-fns-tz, yahoo -> yahoo-finance2, persist -> drizzle), causing `--help` to fail when dependencies were missing
- **Fix:** Moved `fetchMarketData` import to dynamic `await import()` inside `main()`, keeping arg parsing and --help at top level with only `node:fs` and `node:path` imports
- **Files modified:** scripts/backfill.ts
- **Commit:** `c4e6520`

## Verification Results

- `pnpm backfill --help` exits 0 with usage output
- `scripts/backfill.ts` does not contain `import 'server-only'`
- `package.json` contains `"backfill"` script
- 02-VALIDATION.md frontmatter `nyquist_compliant: true` confirmed
- All 17 task rows present in verification map
