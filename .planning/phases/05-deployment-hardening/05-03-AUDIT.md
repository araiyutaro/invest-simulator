# Phase 05 Plan 03 — `.env.example` Audit (Task 2 Step 2a)

## Command

```bash
grep -rn "process\.env\." lib/ app/ db/ drizzle.config.ts 2>/dev/null \
  | grep -v "lib/env.ts" | grep -v "\.test\." | grep -v "NODE_ENV"
```

## Output (verbatim)

```
drizzle.config.ts:5:const migrationUrl = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL
```

(No matches under `lib/`, `app/`, or `db/` other than `lib/env.ts` itself, which is the validated source of truth.)

## Comparison vs Expected Inventory

| Var | Expected | Found | Status |
|-----|----------|-------|--------|
| `DATABASE_URL_DIRECT` (drizzle.config.ts, migrate-only) | yes | yes | OK |
| `DATABASE_URL` (drizzle.config.ts fallback for migrate) | yes | yes | OK (also runtime via lib/env.ts) |
| Any other env var | none | none | OK |

## Decision

Audit matches expected inventory. Proceed to Step 2b — overwrite `.env.example` with the literal content specified in 05-03-PLAN.md.
