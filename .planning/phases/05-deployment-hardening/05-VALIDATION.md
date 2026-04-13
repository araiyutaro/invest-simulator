---
phase: 05
slug: deployment-hardening
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-13
---

# Phase 05 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest + manual curl/grep verification |
| **Config file** | existing vitest config (if present) |
| **Quick run command** | `pnpm vitest run --reporter=dot` |
| **Full suite command** | `pnpm vitest run && pnpm tsc --noEmit && pnpm next build` |
| **Estimated runtime** | ~120 seconds |

Phase 5 is primarily a deployment/configuration phase. Most verification is **manual** (curl against preview/prod URLs, grep of Function Logs, visual confirmation in Vercel dashboard). Automated checks are limited to build, type, and route handler unit tests (GET/POST auth guard).

---

## Sampling Rate

- **After every task commit:** Run `pnpm tsc --noEmit` + route handler unit tests if modified
- **After every plan wave:** Run full suite (`pnpm vitest run && pnpm tsc --noEmit && pnpm next build`)
- **Before `/gsd-verify-work`:** Full suite must be green AND SECURITY-CHECKLIST manual items signed off
- **Max feedback latency:** 60 seconds for quick run, 180 seconds for full suite

---

## Per-Task Verification Map

Populated during planning. Each task must map to one of:
- `automated` — vitest/tsc/next build command
- `manual` — step in SECURITY-CHECKLIST.md or ROLLOUT.md with explicit curl/grep/expected output

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | OPS-01..04 | TBD | TBD | TBD | TBD | TBD | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/api/cron/daily-run.test.ts` — unit test for GET/POST auth guard (401 on missing/mismatched Bearer)
- [ ] SECURITY-CHECKLIST.md template committed before rollout

*Most Phase 5 deliverables (vercel.json, next.config.ts headers, .env.example, ROLLOUT.md, SECURITY-CHECKLIST.md) are configuration artifacts, not code requiring unit tests.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Vercel Cron auto-fires at UTC 22:00 | OPS-01 | Requires real Vercel production environment and wall-clock wait | Deploy → wait for next UTC 22:00 → check Vercel Function Logs for `/api/cron/daily-run` invocation → verify new row in `decisions` table |
| CRON_SECRET guard returns 401 | OPS-02 | Requires hitting live endpoint | `curl -X GET https://<domain>/api/cron/daily-run` → expect 401. `curl -H "Authorization: Bearer wrong" ...` → expect 401. `curl -H "Authorization: Bearer $CRON_SECRET" ...` → expect 200 |
| Unauthenticated dashboard access redirects to /login | OPS-03 | Browser behavior | Open incognito → https://<domain>/ → expect redirect to /login. `curl https://<domain>/api/dashboard/summary` → expect 401 |
| Security headers returned | Security checklist D-13 §7 | Requires production response inspection | `curl -I https://<domain>/` → grep `strict-transport-security`, `x-content-type-options: nosniff`, `referrer-policy: strict-origin-when-cross-origin`, `content-security-policy` |
| Fluid Compute duration within maxDuration=120s | OPS-04 | Only observable post-execution in Vercel Function Logs | Read Vercel Function Logs Duration column for each `/api/cron/daily-run` invocation → record value in SECURITY-CHECKLIST |
| No secret/PII in logs | Security checklist D-13 §5 | Requires inspecting deployed logs | `vercel logs --prod | grep -iE "(sk-|AIza|postgres://|password)"` → expect no matches |
| .env* in .gitignore | Security checklist D-13 §1 | Trivially automated via grep | `grep -E "^\.env" .gitignore` → expect `.env*` entries |
| Neon DB role has minimum privileges | Security checklist D-13 §6 | Neon Free tier has a single role — cannot restrict further | **Accepted risk**: document in SECURITY-CHECKLIST as "N/A on Neon Free tier, revisit if upgraded" |
| proxy.ts matcher excludes only `/_next/static` and `/favicon.ico` | Security checklist D-13 §4 | Visual code review | Read `proxy.ts` matcher config → confirm pattern |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify OR are listed in Manual-Only table above
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify (acceptable on config-only phase — all manual items must appear in SECURITY-CHECKLIST.md with expected outputs)
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 180s
- [ ] `nyquist_compliant: true` set in frontmatter after planning finalizes Per-Task Verification Map

**Approval:** pending
