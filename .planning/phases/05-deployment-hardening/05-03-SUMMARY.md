---
phase: 05
plan: 03
subsystem: deployment-hardening
tags: [proxy, env, vercel, security]
requirements: [OPS-03]
dependency_graph:
  requires:
    - lib/env.ts (Phase 01 — zod schema source of truth)
    - proxy.ts (Phase 01 D-14 — auth gate function-body bypass)
  provides:
    - proxy.ts matcher excluding sitemap.xml + robots.txt (Next.js 16 canonical)
    - .env.example documented inventory aligned with zod schema (D-08 source)
  affects:
    - Phase 05 Plan 04 (SECURITY-CHECKLIST will reference .env.example for Vercel Dashboard registration)
tech-stack:
  added: []
  patterns:
    - matcher metadata-file exclusion
    - env-var inventory drift prevention via grep audit gate
key-files:
  created:
    - .planning/phases/05-deployment-hardening/05-03-AUDIT.md
    - .planning/phases/05-deployment-hardening/05-03-SUMMARY.md
  modified:
    - proxy.ts
    - .env.example
decisions:
  - "Override CONTEXT.md D-07 legacy SESSION_PASSWORD → use SESSION_SECRET (matches lib/env.ts zod schema, code is contract)"
  - "DATABASE_URL_DIRECT documented as local-migrate-only; not registered in Vercel Production"
  - "CRON_SECRET marked PRODUCTION ONLY in .env.example to enforce Pitfall 8 in Vercel Dashboard registration"
metrics:
  duration: ~6 minutes
  completed: 2026-04-14
---

# Phase 05 Plan 03: Deployment Hardening — Proxy Matcher + Env Audit Summary

Tightened proxy.ts matcher to exclude metadata files and audited .env.example against the lib/env.ts zod schema as the documented source for manual Vercel Dashboard registration (D-08).

## Tasks

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Update proxy.ts matcher to exclude sitemap.xml + robots.txt | `9661eaa` | `proxy.ts` |
| 2 | Audit .env.example and align with lib/env.ts | `0c4c788` | `.env.example`, `.planning/phases/05-deployment-hardening/05-03-AUDIT.md` |

## proxy.ts matcher diff

**Before** (single-line matcher, comment mentioned only Next.js assets + favicon):
```ts
export const config = {
  // Exclude only Next.js static/image optimization assets and the favicon.
  // Everything else — including /api routes — flows through the auth gate.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

**After** (matcher widened to include metadata files; comment expanded):
```ts
export const config = {
  // Exclude Next.js static/image optimization assets, favicon, and metadata
  // files (sitemap.xml, robots.txt). Everything else — including /api routes —
  // flows through the auth gate. (Phase 05 Plan 03, D-14 preserved)
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)'],
}
```

**Function body** (`proxy()` and the `/login`, `/api/auth/*`, `/api/cron/*` bypass) is byte-identical — D-14 preserved.

## .env.example final variable inventory

| Variable | In lib/env.ts? | lib/env.ts line | Scope | Notes |
|----------|----------------|-----------------|-------|-------|
| `DATABASE_URL` | yes | 5 | runtime + migrate fallback | Neon pooled URL |
| `DATABASE_URL_DIRECT` | no (migrate-only) | n/a | local migrate only | drizzle.config.ts:5; not in Vercel Production |
| `GEMINI_API_KEY` | yes | 6 | runtime | Gemini 2.5 Flash |
| `SESSION_SECRET` | yes | 7 | runtime | ≥32 chars enforced by zod |
| `SITE_PASSWORD` | yes | 8 | runtime | timingSafeEqual compared |
| `CRON_SECRET` | yes | 9 | Vercel Production ONLY | Pitfall 8 — Preview disabled |
| `FINNHUB_API_KEY` | yes | 10 | runtime | Phase 02 market data |

`lib/env.ts` line numbers refer to the zod `envSchema` object (lines 4–11 in current file).

## Audit Result (Task 2 Step 2a)

```
drizzle.config.ts:5:const migrationUrl = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL
```

No env vars referenced in `lib/`, `app/`, or `db/` other than `lib/env.ts` itself. Inventory matches expected — proceeded to Step 2b without escalation.

Full audit captured at `.planning/phases/05-deployment-hardening/05-03-AUDIT.md`.

## Verification

| Check | Result |
|-------|--------|
| `pnpm tsc --noEmit` | exit 0 |
| `pnpm next build` (with stub env vars) | exit 0 — 11 routes generated, Proxy (Middleware) registered |
| proxy.ts grep acceptance criteria | all pass (matcher contains the 5 exclusions; function-body bypasses intact; getIronSession present) |
| .env.example node audit script | `env audit OK` |
| .env.example acceptance criteria greps | all pass (7 keys present, no `SESSION_PASSWORD`, `Vercel Dashboard` / `LOCAL MIGRATE ONLY` / `PRODUCTION ONLY` documented) |

Note: `pnpm install` was executed in the worktree to enable the build verification (worktree had no `node_modules`). The build initially failed due to missing env vars (env validation throws at import time — Phase 01 fast-fail design). Re-running with stub values (`DATABASE_URL=postgres://u:p@localhost:5432/d` etc.) produced a green build, confirming the matcher change does not break compilation or routing.

## Threat Model Coverage (mitigations applied)

| Threat | Disposition | Mitigation |
|--------|-------------|------------|
| T-05-17 (Elevation of Privilege — matcher over-exclusion) | mitigate | Task 1: matcher exclusion limited to Next.js asset prefixes + two well-known metadata files; all other routes flow through iron-session gate |
| T-05-18 (Information Disclosure — missing env crash) | mitigate | Task 2: .env.example mirrors lib/env.ts zod schema; zod fast-fails at import with field-only errors (verified during build attempt — no secret values exposed in stack trace) |
| T-05-03 (Information Disclosure — NEXT_PUBLIC misuse) | mitigate | Task 2: .env.example contains explicit "NEVER prefix any key with NEXT_PUBLIC" warning |
| T-05-19 (Tampering — CRON_SECRET in Preview env) | mitigate | Task 2: .env.example explicitly marks CRON_SECRET "PRODUCTION ONLY"; Plan 05-04 SECURITY-CHECKLIST will gate Vercel Dashboard scope |

## Deviations from Plan

### Notes (not deviations)

- **Acceptance criteria `grep -c "sitemap.xml" proxy.ts == 1`**: actual count is 2 because the new comment also mentions sitemap.xml/robots.txt by name (the plan instructed updating the comment to reference them). The intent — "sitemap.xml appears in the matcher exclusion list" — is satisfied. Same applies to `robots.txt` (count 2), `api/cron/` (count 2 — comment + condition), and `api/auth/` (count 2 — comment + condition). Function body and bypass logic are byte-identical to before.
- **`pnpm install` in worktree**: required because the worktree had no `node_modules`. Not a code change; environment setup only.
- **Stub env vars during `pnpm next build`**: required because `lib/env.ts` validates at import time and the worktree has no `.env.local`. Stub values were provided only to the build process, never committed.

No code-level deviations. Plan executed exactly as written.

## Threat Flags

None — no new security-relevant surface introduced. Both files modified are existing security control points; this plan tightens (proxy matcher) or documents (`.env.example`) the existing posture.

## Self-Check: PASSED

- proxy.ts: FOUND (modified, commit 9661eaa)
- .env.example: FOUND (modified, commit 0c4c788)
- .planning/phases/05-deployment-hardening/05-03-AUDIT.md: FOUND (created, commit 0c4c788)
- Commit 9661eaa: FOUND in git log
- Commit 0c4c788: FOUND in git log
