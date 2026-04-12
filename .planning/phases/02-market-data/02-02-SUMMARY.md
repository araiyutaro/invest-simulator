---
plan: 02-02
phase: 02-market-data
status: complete
started: 2026-04-12
completed: 2026-04-12
---

## Summary

Extended Drizzle schema with OHLCV columns on `price_snapshots`, added `news_snapshots` and `fundamentals_snapshots` tables, and pushed to live Neon database.

## Tasks

| # | Task | Status |
|---|------|--------|
| 1 | Extend priceSnapshots + add newsSnapshots + fundamentalsSnapshots in db/schema.ts | Done |
| 2 | [BLOCKING] Push schema to live Neon + verify columns/tables exist | Done |

## Key Changes

### db/schema.ts
- Added `bigint` import from `drizzle-orm/pg-core`
- `priceSnapshots`: added `open`, `high`, `low`, `rawClose` (numeric 18,4), `volume` (bigint). Made `close` nullable (holiday rows / FX rows)
- New `newsSnapshots` table: 1:N per (symbol, news_date) with headline, url, source_domain, publishedAt, raw JSONB
- New `fundamentalsSnapshots` table: 1:1 per (symbol, as_of_date) with peRatio, eps, marketCap, week52High/Low, raw JSONB, unique constraint

### Live Neon DB
- `drizzle-kit push --force` applied successfully
- Verified via `information_schema`: all 5 new columns on `price_snapshots`, both new tables exist

## key-files

### created
- (no new files — schema extension in existing file)

### modified
- db/schema.ts

## Self-Check: PASSED

- [x] price_snapshots has OHLCV columns (open/high/low/volume) and raw_close
- [x] news_snapshots table exists with 1:N relationship per (symbol, news_date)
- [x] fundamentals_snapshots table exists with 1:1-per-day shape
- [x] Live Neon schema matches db/schema.ts (drizzle-kit push applied)

## Deviations

- Used `npx drizzle-kit push --force` instead of interactive push (non-TTY environment)
- Executed inline by orchestrator (worktree agent failed due to Bash permission issues)
