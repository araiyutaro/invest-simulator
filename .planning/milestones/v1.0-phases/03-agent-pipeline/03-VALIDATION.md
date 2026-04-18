---
phase: 3
slug: agent-pipeline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-12
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run --reporter=verbose`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | AGENT-01 | — | N/A | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 1 | AGENT-02 | — | N/A | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 03-01-03 | 01 | 1 | AGENT-03 | — | N/A | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 03-01-04 | 01 | 1 | AGENT-04 | — | N/A | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 03-01-05 | 01 | 1 | AGENT-05 | — | N/A | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 03-01-06 | 01 | 1 | AGENT-06 | T-03-01 | Prompt injection guard via XML tags | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 03-01-07 | 01 | 1 | AGENT-07 | — | N/A | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 2 | EXEC-01 | — | N/A | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 2 | EXEC-02 | — | N/A | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 03-02-03 | 02 | 2 | EXEC-03 | T-03-02 | Cash balance overflow rejected | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 03-02-04 | 02 | 2 | EXEC-04 | T-03-03 | Short/non-long orders blocked | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 03-02-05 | 02 | 2 | EXEC-05 | — | N/A | integration | `npx vitest run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `lib/agent/__tests__/prompt-builder.test.ts` — stubs for AGENT-01 through AGENT-07
- [ ] `lib/agent/__tests__/executor.test.ts` — stubs for EXEC-01 through EXEC-05
- [ ] `npm install technicalindicators` — TA indicator library (not yet installed)

*Existing vitest infrastructure covers test framework requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Gemini API actual response | AGENT-01 | Requires live API key | Call `/api/cron/daily-run` with valid `CRON_SECRET`, verify `decisions` row in DB |
| Idempotent guard live | EXEC-05 | Requires DB with existing decision | Call endpoint twice on same day, verify single `decisions` record |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
