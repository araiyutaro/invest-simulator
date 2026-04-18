---
phase: 1
slug: foundation
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-11
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^2 (project-new install via Wave 0) |
| **Config file** | `vitest.config.ts` (Wave 0 creates) |
| **Quick run command** | `npx vitest run --reporter=dot` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=dot`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green, plus manual login e2e verify (01-04 Task 2)
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | SEC-03 | T-01-01 | Drizzle schema compiles, types exported from server-only module | integration | `npx tsc --noEmit` + `npx vitest run tests/db/schema.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 1 | SEC-03 | T-01-02 | drizzle.config.ts points to direct Neon URL | manual | `npx drizzle-kit check` | N/A | ⬜ pending |
| 01-01-03 | 01 | 1 | SEC-03 | T-01-03 | [BLOCKING] drizzle-kit push creates all 6 tables in live Neon | manual | `npx drizzle-kit push && psql $DATABASE_URL_DIRECT -c "\dt"` | N/A | ⬜ pending (autonomous:false) |
| 01-02-01 | 02 | 1 | SEC-02 | T-01-04 | .env.example lists all 5 required keys with no values | unit | `grep -c '^[A-Z_]*=$' .env.example` == 5 | N/A | ⬜ pending |
| 01-02-02 | 02 | 1 | SEC-02 | T-01-05 | lib/env.ts server-only (import 'server-only'), zod-validated | unit | `npx vitest run tests/lib/env.test.ts` | ❌ W0 | ⬜ pending |
| 01-03-01 | 03 | 2 | SEC-01, SEC-03 | T-01-06 | iron-session getIronSession typed, cookie httpOnly+secure, maxAge=2592000 | unit | `npx vitest run tests/lib/session.test.ts` | ❌ W0 | ⬜ pending |
| 01-03-02 | 03 | 2 | SEC-01 | T-01-07 | /api/auth/login verifies password with timingSafeEqual, returns 401 on mismatch | integration | `npx vitest run tests/api/auth-login.test.ts` | ❌ W0 | ⬜ pending |
| 01-04-01 | 04 | 3 | SEC-01 | T-01-08 | proxy.ts exports `proxy` function, no middleware.ts, matcher config | unit | `npx vitest run tests/proxy.test.ts` + `! test -f middleware.ts` | ❌ W0 | ⬜ pending |
| 01-04-02 | 04 | 3 | SEC-01 | T-01-09 | E2E login flow — 7 manual test cases (unauth redirect, wrong pw 401, correct pw session cookie, reload persists, logout clears, /api/cron excluded, 30-day expiry) | manual | Human verify checklist | N/A | ⬜ pending |
| 01-05-01 | 05 | 2 | SEC-02 | T-01-10 | Agent SDK SPIKE hello-world returns structured buy/sell JSON | integration | `npx vitest run tests/spikes/agent-sdk.test.ts` | ❌ W0 | ⬜ pending |
| 01-05-02 | 05 | 2 | SEC-02 | T-01-11 | Standard SDK SPIKE hello-world returns structured buy/sell JSON | integration | `npx vitest run tests/spikes/standard-sdk.test.ts` | ❌ W0 | ⬜ pending |
| 01-05-03 | 05 | 2 | SEC-02 | T-01-12 | AI-LAYER-SPIKE.md report + PROJECT.md Key Decisions updated + loser code deleted | manual | `test -f .planning/research/AI-LAYER-SPIKE.md && ! test -d app/_spikes/{loser}` | N/A | ⬜ pending (autonomous:false) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Sampling continuity check:** No 3 consecutive automated-verify tasks are missing — each wave has at least 2 out of 3 tasks with automated commands. Manual-only tasks (01-01-03, 01-04-02, 01-05-03) are interleaved with automated tests.

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` — vitest config with tsconfig paths + node environment
- [ ] `tests/db/schema.test.ts` — stubs for SEC-03 schema compile test
- [ ] `tests/lib/env.test.ts` — stubs for SEC-02 env var validation
- [ ] `tests/lib/session.test.ts` — stubs for SEC-01 iron-session config
- [ ] `tests/api/auth-login.test.ts` — stubs for SEC-01 login route
- [ ] `tests/proxy.test.ts` — stubs for SEC-01 proxy.ts matcher/auth logic
- [ ] `tests/spikes/agent-sdk.test.ts` — SPIKE hello-world stub
- [ ] `tests/spikes/standard-sdk.test.ts` — SPIKE hello-world stub
- [ ] `package.json` — add `vitest`, `@vitest/ui`, `happy-dom` (if needed)

**Install commands** (Wave 0 task in Plan 01-01 or new Plan 01-00):
```bash
npm install -D vitest@^2 @vitest/ui
```

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `drizzle-kit push` applies schema to live Neon DB | SEC-03 | Requires user's Neon credentials, destructive to shared DB | Run `npx drizzle-kit push` with DATABASE_URL_DIRECT set, then `psql -c "\dt"` to list 6 tables |
| Login E2E flow (7 test cases) | SEC-01 | Session cookies require real browser, Next.js 16 dev server | Run `npm run dev`, follow checklist in 01-04-PLAN.md Task 2 |
| SPIKE decision + loser deletion | SEC-02 | Human judgment on code quality + Vercel Preview test | Deploy both SPIKEs to Preview, run both, measure response, decide winner, delete loser code |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags (all commands use `vitest run`, not `vitest`)
- [x] Feedback latency < 20s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending (will be approved when Wave 0 tests pass green)
