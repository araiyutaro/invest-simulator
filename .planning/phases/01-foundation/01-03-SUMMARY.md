---
phase: 01-foundation
plan: 03
subsystem: auth
tags: [auth, iron-session, tdd, session, password]
dependency_graph:
  requires: [lib/env.ts]
  provides: [lib/session.ts, lib/auth.ts, app/login/page.tsx, app/api/auth/login/route.ts, app/api/auth/logout/route.ts]
  affects: [proxy.ts (Plan 04)]
tech_stack:
  added: [iron-session@^8.0.4]
  patterns: [iron-session-v8-app-router, timingSafeEqual-password-compare, tdd-red-green]
key_files:
  created:
    - lib/session.ts
    - lib/auth.ts
    - app/login/page.tsx
    - app/api/auth/login/route.ts
    - app/api/auth/logout/route.ts
    - lib/__tests__/session.test.ts
    - lib/__tests__/auth.test.ts
    - lib/__tests__/auth-login-route.test.ts
    - vitest.config.ts
  modified:
    - package.json
    - package-lock.json
decisions:
  - "vitest.config.ts created with @/ alias — required for route handler tests to resolve lib imports"
  - "timingSafeEqual + length pre-check pattern: length mismatch returns false without throwing (D-16)"
  - "cookies() is async in Next.js 16 — always await cookies() before passing to getIronSession"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-11"
  tasks_completed: 2
  files_created: 9
  files_modified: 2
---

# Phase 1 Plan 03: iron-session Auth Summary

**One-liner:** iron-session v8 password auth with timingSafeEqual comparison, httpOnly cookie (30d), single-password login page, and login/logout Route Handlers.

## What Was Built

### `lib/session.ts`
Iron-session v8 session configuration:
- `SessionData` type with `isAuthenticated: boolean`
- `sessionOptions` with cookieName `invest-sim-session`, httpOnly, sameSite:lax, maxAge 30 days (D-13)
- `defaultSession` constant with `isAuthenticated: false`
- `import 'server-only'` guard on line 1 (SEC-03)

### `lib/auth.ts`
Password verifier:
- `verifyPassword(input: string): boolean` using `crypto.timingSafeEqual` (D-16)
- Length pre-check before `timingSafeEqual` to avoid throw on mismatch
- Uses `env.SITE_PASSWORD` from `lib/env.ts` (never `process.env` directly)
- `import 'server-only'` guard

### `app/login/page.tsx`
Client Component login form:
- Single `<input type="password">` — no username field (D-12)
- Error display: "パスワードが違います" (D-15)
- Redirects to `/dashboard` on success

### `app/api/auth/login/route.ts`
POST Route Handler:
- Validates JSON body, treats missing/non-string password as empty
- 401 + `{ error: 'パスワードが違います' }` on wrong password (D-15)
- `getIronSession<SessionData>(await cookies(), sessionOptions)` — uses async cookies() per Next.js 16
- Sets `session.isAuthenticated = true` and calls `session.save()`

### `app/api/auth/logout/route.ts`
POST Route Handler:
- `session.destroy()` to clear the cookie

### Test suite
27 tests total (10 env + 8 session + 5 auth + 4 login-route), all passing.

## Commits

| Hash | Type | Description |
|------|------|-------------|
| `d935429` | test | Add failing tests for lib/session.ts and lib/auth.ts (TDD RED) |
| `6656925` | feat | Implement lib/session.ts and lib/auth.ts (TDD GREEN) |
| `6fcf2f5` | test | Add failing tests for /api/auth/login route (TDD RED) |
| `881c57f` | feat | Implement login page, auth login/logout routes (TDD GREEN) |

## Verification Results

```
Tests: 27 passed (27) across 4 test files
TypeScript: npx tsc --noEmit --skipLibCheck — clean (0 errors)
```

Acceptance criteria met:
- [x] package.json has iron-session dependency
- [x] lib/session.ts line 1 is `import 'server-only'`
- [x] lib/session.ts sets maxAge to 60*60*24*30
- [x] lib/session.ts sets cookieName to 'invest-sim-session'
- [x] lib/auth.ts implements timingSafeEqual + length pre-check
- [x] lib/auth.ts references env.SITE_PASSWORD (not process.env directly)
- [x] app/login/page.tsx has `'use client'` directive
- [x] login page has exactly 1 `<input type="password">` (no username field — D-12)
- [x] login page error text is "パスワードが違います"
- [x] POST /api/auth/login returns 401 with `{ error: 'パスワードが違います' }` on mismatch
- [x] POST /api/auth/login uses `getIronSession<SessionData>(await cookies(), sessionOptions)`
- [x] POST /api/auth/logout calls `session.destroy()`
- [x] `npx tsc --noEmit --skipLibCheck` passes with 0 errors

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] vitest.config.ts missing — @/ alias not resolvable in tests**
- **Found during:** Task 2 TDD GREEN (route handler test run)
- **Issue:** Route handler `app/api/auth/login/route.ts` uses `@/lib/session` and `@/lib/auth` imports. Without a vitest.config.ts defining the `@/` alias, vitest cannot resolve these imports at test time.
- **Fix:** Created `vitest.config.ts` with `resolve.alias: { '@': path.resolve(__dirname, '.') }` and `test.environment: 'node'`.
- **Files modified:** `vitest.config.ts` (new)
- **Commit:** `881c57f`

## Known Stubs

None — login flow is fully wired. Session cookie is issued on correct password; the proxy gate (Plan 04) will consume it.

## Threat Flags

None — all surface matches the plan's threat model (T-01-09 through T-01-13 fully mitigated).

## Self-Check: PASSED
