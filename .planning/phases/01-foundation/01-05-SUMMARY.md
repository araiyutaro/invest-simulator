---
phase: 01-foundation
plan: 05
subsystem: ai
tags: [ai, gemini, spike, function-calling, server-only]
dependency_graph:
  requires: [lib/env.ts]
  provides: [lib/ai/client.ts, .planning/research/AI-LAYER-SPIKE.md]
  affects: [Phase 3 Agent Pipeline]
tech_stack:
  added: ["@google/generative-ai@^0.24.1"]
  patterns: [gemini-function-calling, server-only-ai-client, agentic-loop-with-fake-tools]
key_files:
  created:
    - lib/ai/client.ts
    - .planning/research/AI-LAYER-SPIKE.md
  modified:
    - package.json
    - package-lock.json
    - .planning/PROJECT.md
    - .planning/STATE.md
  deleted:
    - app/spikes/gemini/route.ts (promoted/cleaned up)
decisions:
  - "AI Layer confirmed: @google/generative-ai v0.24.1 + gemini-2.5-flash (D-10)"
  - "gemini-2.0-flash no longer available to new API users — switched to gemini-2.5-flash (Rule 1)"
  - "Next.js 16 private-folder rule forces routing exclusion on _prefixed folders; SPIKE route lived at app/spikes/ (not app/_spikes/) during execution"
  - "Vercel Preview deploy verification deferred to human-action checkpoint / Phase 3 real-route integration"
metrics:
  duration: "~15 minutes"
  completed: "2026-04-11"
  tasks_completed: 3
  files_created: 2
  files_modified: 4
  files_deleted: 1
requirements: [SEC-02]
---

# Phase 1 Plan 05: Gemini AI Layer SPIKE Summary

**One-liner:** Validated `@google/generative-ai` + `gemini-2.5-flash` with a 2-step function-calling agentic loop (`get_price` → `place_order`) locally, confirmed the AI Layer decision, promoted the client to `lib/ai/client.ts` with a `server-only` guard, and deleted the spike folder.

## What Was Built

### `app/spikes/gemini/route.ts` (ephemeral)
Next.js Route Handler used only during the SPIKE. Implemented a Hello World Gemini agent:
- `runtime = 'nodejs'`, `maxDuration = 60`
- Two `FunctionDeclaration`s: `get_price(symbol)` and `place_order(symbol, action, quantity, reasoning)`; the `action` property uses `format: 'enum'` + `enum: ['BUY','SELL','HOLD']` as required by the `EnumStringSchema` type
- Fake tool runner returning deterministic dummy responses
- Agentic loop (`while (safety++ < 5)`) runs until `functionCalls()` is empty
- Returns `{ sdk, model, elapsedMs, usage, trace, finalText }` or `{ error, stack, elapsedMs }`
- Line 1: `import 'server-only'` (T-01-19 mitigation)
- Deleted in Task 3 per D-10 cleanup

### `lib/ai/client.ts` (production)
Promoted Gemini client:
- `import 'server-only'` (SEC-02, T-01-19)
- Exports `genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY)` and `GEMINI_MODEL = 'gemini-2.5-flash'`
- API key sourced from `lib/env.ts` (zod-validated), never `process.env` directly (T-01-20, D-21)
- Documented reason for not using `gemini-2.0-flash`

### `.planning/research/AI-LAYER-SPIKE.md`
SPIKE report (~135 lines) covering pivot context, test environment, local measurements (3 runs), Vercel Preview checkpoint notes, function-calling verdict, decision, and Phase 3 rollout plan.

## Local Measurements

| Run | elapsedMs | prompt | candidates | total | Trace |
|-----|-----------|--------|------------|-------|-------|
| 1 (cold) | 5324 | 364 | 33 | 397 | `get_price(AAPL)` → `place_order(BUY, 10, …long-term growth…)` |
| 2 (warm) | 4494 | 376 | 38 | 414 | `get_price(AAPL)` → `place_order(HOLD, 0, …no market news…)` |
| 3 (warm) | 4756 | 382 | 69 | 451 | `get_price(AAPL)` → `place_order(HOLD, 0, …stable long-term…)` |

1 日 1 回 × ~450 tokens は Gemini 無料枠内で無理なく運用可能。60 秒 Vercel serverless 上限にも十分余裕がある。

## Vercel Preview Verification

**Status:** NOT executed in this session. Task 2 was `checkpoint:human-action`; the user or a follow-up session must perform the Vercel Preview deploy + env-var temporary injection + cleanup described in `AI-LAYER-SPIKE.md > Vercel Preview Result > 残タスク`.

Local verification is sufficient to unblock Phase 3 planning because:
1. `@google/generative-ai` is a pure HTTP client (no subprocess, no binary engine)
2. Next.js `runtime = 'nodejs'` matches Vercel serverless exactly
3. No container / filesystem / shell dependencies (the original Claude Agent SDK concern does not apply here)
4. Phase 3 Agent Pipeline will naturally re-verify Preview behaviour when the real daily-cron route is deployed

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | `6caba81` | feat(01-05): add Gemini SPIKE route with function calling |
| 1 (fix) | `a8db7c6` | fix(01-05): use gemini-2.5-flash and rename _spikes to spikes |
| 2 | `82d753f` | docs(01-05): record Gemini AI Layer SPIKE results, confirm decision |
| 3 | `8b7464b` | feat(01-05): promote Gemini client to lib/ai/client.ts, delete spike |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `gemini-2.0-flash` returns 404 for new API users**
- **Found during:** Task 2 (first live call)
- **Issue:** Gemini API responds `[404 Not Found] This model models/gemini-2.0-flash is no longer available to new users`
- **Fix:** Switched model string to `gemini-2.5-flash` in both `app/spikes/gemini/route.ts` and `lib/ai/client.ts`. Same free-tier limits, same function-calling support, same price tier
- **Files modified:** `app/spikes/gemini/route.ts`, `lib/ai/client.ts`
- **Commit:** `a8db7c6`, `8b7464b`

**2. [Rule 1 - Bug] Next.js 16 private folder routing excluded `/_spikes`**
- **Found during:** Task 2 (first local dev GET returned 404)
- **Issue:** Next.js 16 convention: folders prefixed with `_` are private and **opted out of the routing system entirely** (verified in `node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md` L257-261). Plan specified `app/_spikes/gemini/route.ts`, which cannot be reached via HTTP
- **Fix:** Renamed `app/_spikes` → `app/spikes` (no underscore). Since Task 3 deletes the folder entirely, there is no persistent naming divergence
- **Files modified:** directory rename
- **Commit:** `a8db7c6`

**3. [Rule 1 - Bug] TypeScript `EnumStringSchema` requires `format: 'enum'`**
- **Found during:** Task 1 verification (`npx tsc --noEmit`)
- **Issue:** `{ type: SchemaType.STRING, enum: [...] }` does not satisfy the `EnumStringSchema` type without `format: 'enum'`
- **Fix:** Added `format: 'enum'` to the `action` property of `placeOrderDeclaration`
- **Commit:** `6caba81` (initial commit already included the fix after iteration)

**4. [Rule 1 - Bug] `call.args` typed as `object`, not `Record<string, unknown>`**
- **Found during:** Task 1 verification
- **Issue:** SDK types `call.args` as `object`, which does not match `runFakeTool(name, args: Record<string, unknown>)`
- **Fix:** Cast via `(call.args ?? {}) as Record<string, unknown>`
- **Commit:** `6caba81`

### Deferred Items

- **Vercel Preview live verification** (D-09): The Plan Task 2 checkpoint explicitly requires Preview deploy + env-var injection + cleanup. Local measurements are recorded, but the Preview round-trip was not performed in this session. Tracked as residual work in `STATE.md > Blockers/Concerns` and in `AI-LAYER-SPIKE.md > Vercel Preview Result > 残タスク`

## Decisions Made

1. **Adopt `gemini-2.5-flash`** as the production model (PROJECT.md Key Decisions updated)
2. **Keep 1 day × 1 run cadence** — token budget is negligible (~14k tokens/month)
3. **Use `runtime = 'nodejs'` + `maxDuration = 60`** on any Gemini-calling route handler
4. **All Gemini calls go through `lib/ai/client.ts`** — single point of SDK / model / env-key control
5. **Reject Anthropic Agent SDK permanently** — superseded by the already-committed pivot (505e44a) and confirmed redundant for this workload

## Requirements Satisfied

- **SEC-02** — AI Layer decision recorded in PROJECT.md Key Decisions with reference to `.planning/research/AI-LAYER-SPIKE.md`. `lib/ai/client.ts` enforces `server-only` guard. `GEMINI_API_KEY` sourced only via `lib/env.ts` (zod-validated)

## Self-Check: PASSED

- `lib/ai/client.ts` — FOUND, line 1 = `import 'server-only'`, exports `genAI` + `GEMINI_MODEL`
- `app/spikes/` — NOT present (confirmed `! test -d app/spikes`)
- `@google/generative-ai` in `package.json` dependencies — FOUND (^0.24.1)
- `.planning/research/AI-LAYER-SPIKE.md` — FOUND, 135+ lines, all 7 required headings present
- `.planning/PROJECT.md` AI Layer row — UPDATED to Confirmed with link to SPIKE report
- `.planning/STATE.md` — AI Layer blocker removed, replaced with Vercel Preview follow-up note
- TypeScript type check (`npx tsc --noEmit --skipLibCheck`) — PASSED
- Commits 6caba81, a8db7c6, 82d753f, 8b7464b — all FOUND in `git log`
