---
phase: 01-foundation
plan: 02
subsystem: env
tags: [env, security, zod, server-only, tdd]
dependency_graph:
  requires: []
  provides: [lib/env.ts, .env.example]
  affects: [lib/session.ts, lib/ai/, app/api/]
tech_stack:
  added: [server-only, vitest]
  patterns: [zod-env-validation, server-only-guard, tdd-red-green]
key_files:
  created:
    - .env.example
    - lib/env.ts
    - lib/__tests__/env.test.ts
  modified:
    - .gitignore
    - package.json
decisions:
  - "server-only mock via vi.mock in tests — avoids Next.js build context requirement in Vitest"
  - ".gitignore changed from broad .env* to .env*.local to allow .env.example tracking (D-18)"
metrics:
  duration: "~15 minutes"
  completed: "2026-04-11"
  tasks_completed: 2
  files_created: 3
  files_modified: 2
---

# Phase 1 Plan 02: Env Skeleton Summary

**One-liner:** Server-only zod env validator with typed exports and `.env.example` key contract for 5 required secrets.

## What Was Built

### `.env.example`
Key-name contract for all 5 required environment variables with empty values and explanatory comments. Safe to commit — contains no secrets.

### `lib/env.ts`
Runtime environment validator that:
- Guards client bundle leakage with `import 'server-only'` on line 1 (SEC-02)
- Parses `process.env` via zod schema at module load time (fail-fast)
- Enforces `SESSION_SECRET >= 32` characters (iron-session v8 requirement, T-01-07)
- Throws descriptive error referencing `.env.example` when validation fails
- Exports fully-typed `env` object and `Env` type

### `.gitignore` update
Changed from broad `.env*` pattern to `.env*.local` + explicit local variants, allowing `.env.example` to be tracked in git while keeping actual secrets out.

### Test suite (`lib/__tests__/env.test.ts`)
10 tests covering: all 5 required keys, SESSION_SECRET length enforcement (too short / exact 32 / over 32), and error message content.

## Commits

| Hash | Type | Description |
|------|------|-------------|
| `04c8c5a` | chore | Add .env.example with all required keys |
| `18322b2` | test | Add failing tests for lib/env.ts (TDD RED) |
| `d030125` | feat | Implement lib/env.ts runtime env validator (TDD GREEN) |

## Verification Results

```
Tests: 10 passed (10)
TypeScript: npx tsc --noEmit --skipLibCheck — clean
```

All acceptance criteria met:
- [x] `.env.example` has DATABASE_URL, ANTHROPIC_API_KEY, SESSION_SECRET, SITE_PASSWORD, CRON_SECRET
- [x] No `NEXT_PUBLIC_` in `.env.example`
- [x] `.gitignore` has `.env*.local` pattern
- [x] `lib/env.ts` first line is `import 'server-only'`
- [x] zod z.object with all 5 keys
- [x] SESSION_SECRET `.min(32)` enforced
- [x] Error thrown on parse failure
- [x] `export const env` and `export type Env` present
- [x] `npx tsc --noEmit --skipLibCheck` passes

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] .env.example not git-trackable due to broad .gitignore pattern**
- **Found during:** Task 1
- **Issue:** Default `.gitignore` had `.env*` which would have excluded `.env.example` from git tracking
- **Fix:** Changed to `.env*.local` + explicit `.env.local` variants, preserving security while allowing template file to be committed
- **Files modified:** `.gitignore`
- **Commit:** `04c8c5a`

**2. [Rule 3 - Blocking] server-only package not installed**
- **Found during:** Task 2 setup
- **Issue:** `server-only` was not in package.json dependencies but required for `lib/env.ts`
- **Fix:** `npm install server-only`
- **Files modified:** `package.json`, `package-lock.json`
- **Commit:** `d030125`

**3. [Rule 3 - Blocking] No test framework available**
- **Found during:** Task 2 TDD RED phase
- **Issue:** No jest/vitest installed; TDD requires a test runner
- **Fix:** `npm install --save-dev vitest`
- **Files modified:** `package.json`, `package-lock.json`
- **Commit:** `18322b2`

**4. [Rule 1 - Bug] Comment in .env.example contained literal "NEXT_PUBLIC_" string**
- **Found during:** Task 1 verification
- **Issue:** Verification script `! grep -q "NEXT_PUBLIC_" .env.example` failed because the comment explaining the prohibition contained the string
- **Fix:** Reworded comment to avoid the literal string while preserving intent
- **Files modified:** `.env.example`
- **Commit:** `04c8c5a`

## Known Stubs

None — this plan creates infrastructure only. No UI rendering or data flow involved.

## Threat Flags

None — all surface matches the plan's threat model (T-01-05 through T-01-08 fully mitigated).

## Self-Check: PASSED
