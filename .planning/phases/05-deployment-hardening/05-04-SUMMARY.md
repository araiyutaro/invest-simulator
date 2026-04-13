---
phase: 05
plan: 04
subsystem: deployment-hardening
tags: [docs, security, checklist, manual-verification]
requires:
  - .planning/phases/05-deployment-hardening/05-CONTEXT.md
  - .planning/phases/05-deployment-hardening/05-RESEARCH.md
  - .planning/phases/04-dashboard/04-SECURITY.md
provides:
  - reusable-security-checklist
  - manual-verification-runbook
affects:
  - .planning/phases/05-deployment-hardening/05-05-PLAN.md (ROLLOUT.md will link this checklist)
tech_stack:
  added: []
  patterns:
    - manual-verification-runbook
    - status-tracked-checklist (⬜/✅/❌/⚠️)
key_files:
  created:
    - .planning/phases/05-deployment-hardening/05-SECURITY-CHECKLIST.md
  modified: []
decisions:
  - "§6 Neon DB ロール最小権限は Free tier 制約により accepted-risk として記録 (RESEARCH.md §Pattern 9)"
  - "Checklist はテンプレートとして再利用、毎回のデプロイで Status 欄を更新する運用"
metrics:
  duration: ~5min
  tasks: 1
  files: 1
  completed: 2026-04-14
requirements: [OPS-02, OPS-03]
---

# Phase 05 Plan 04: Security Checklist Summary

Reusable manual security verification runbook covering all 7 D-13 items as a curl-executable, status-tracked template that ROLLOUT.md (Plan 05-05) consumes before every production deploy.

## What Was Built

`.planning/phases/05-deployment-hardening/05-SECURITY-CHECKLIST.md` (226 lines, 7 sections + Summary table).

Each of the 7 D-13 items is structured identically:
- **Requirement** — D-13 reference + ASVS L1 / OPS-XX / Threat ID mapping
- **Why** — one-line rationale tying back to a specific mitigation
- **Run** — copy-pasteable bash block using `$DOMAIN` / `$CRON_SECRET` / `$DATABASE_URL_DIRECT` env vars
- **Expect** — explicit pass criteria (HTTP codes, header values, grep results)
- **Status / Date / Notes** — three-line record block updated per run

## Items Covered

| # | Item | Verification Method | Initial Status |
|---|------|---------------------|----------------|
| 1 | `.env*` in `.gitignore` | `git check-ignore -v` | ⬜ pending |
| 2 | Auth gate on `/`, `/dashboard`, `/api/dashboard/*` | curl loop expecting 307 → /login or 401 | ⬜ pending |
| 3 | CRON_SECRET guard (no header / wrong bearer / POST / correct GET) | 4 curl variants expecting 401/401/401/200 | ⬜ pending |
| 4 | proxy.ts matcher excludes static assets | `grep -n "matcher" proxy.ts` | ⬜ pending |
| 5 | No secrets/PII in Vercel Function Logs | `grep -iE` regex covering 6 secret patterns | ⬜ pending |
| 6 | Neon DB role least privilege | psql `\du` + `role_table_grants` query | ⚠️ accepted-risk |
| 7 | Security headers (HSTS / CSP / XFO / etc.) | `curl -sI` expecting 6 headers + DevTools CSP check | ⬜ pending |

## Accepted Risk: §6 (Neon DB Role)

Neon Free tier provides exactly 1 main role (`neondb_owner`) per project with full schema privileges; the console does not expose `CREATE ROLE` workflows for the Free plan (RESEARCH.md §Pattern 9). The checklist explicitly marks this item as `⚠️ accepted-risk` with:

- **Compensating control:** single-operator physical access (1 person holds the DB connection string)
- **Re-evaluation trigger:** Neon Paid upgrade OR multi-user operation
- **Future plan template:** SQL-based `CREATE ROLE invest_app` + scoped `GRANT SELECT, INSERT, UPDATE` (out of Phase 5 scope)

The current role state is still recorded each run via the `\du` / `role_table_grants` dump for drift detection.

## How Plan 05-05 (ROLLOUT.md) Consumes This

Plan 05-05 builds the deploy runbook and references this checklist by relative path at the **post-deploy verification step**. ROLLOUT.md will:

1. Instruct the operator to export `$DOMAIN` / `$CRON_SECRET` / `$DATABASE_URL_DIRECT` (matching the "Before you start" block here)
2. Walk items 1–7 in order, copying Status updates back into either the same file or a per-run copy under `runs/NNNN-run.md`
3. Sign-off only when items 1-5 and 7 are ✅ and item 6 is ⚠️ accepted-risk (per the Summary table at the end of the checklist)

## Deviations from Plan

None — plan executed exactly as written. The full checklist template was provided verbatim in the `<action>` block and reproduced 1:1.

## Verification

- File exists at `.planning/phases/05-deployment-hardening/05-SECURITY-CHECKLIST.md`
- 226 lines (≥120 required)
- 8 `## ` headings (7 items + Summary; ≥7 required)
- 7 `⬜ pending` markers (items 1,2,3,4,5,7 + Summary table cells; ≥6 required)
- 4 `accepted-risk` mentions (§6 status, §6 inline, Summary cell, sign-off line; ≥2 required)
- 2 `Bearer wrong` occurrences (§3 wrong-bearer + post-wrong tests; ≥1 required)
- 1 `max-age=63072000; includeSubDomains` (§7 expected HSTS value; ==1 required)
- 1 `preload` mention (explicit "NO preload" note; ≥1 required)
- 1 `sitemap.xml` mention (§4 matcher expected content; ≥1 required)
- 7 `$DOMAIN` placeholder uses across §2, §3, §7 (≥5 required)

All acceptance criteria from the plan met.

## Self-Check: PASSED

- File `.planning/phases/05-deployment-hardening/05-SECURITY-CHECKLIST.md` — FOUND
- Commit `0c83948` — FOUND on branch worktree-agent-a24abb33
