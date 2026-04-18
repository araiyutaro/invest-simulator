---
phase: 05
plan: 01
subsystem: deployment-hardening
tags: [vercel-cron, auth, cron-secret, route-handler]
requirements: [OPS-01, OPS-02]
dependency_graph:
  requires:
    - "Phase 3 Plan 04 daily-run/route.ts (POST + auth)"
    - "lib/env.ts CRON_SECRET (Phase 1)"
  provides:
    - "Vercel Cron schedule declaration (vercel.json)"
    - "GET handler on /api/cron/daily-run (Vercel Cron entry point)"
    - "Shared handleDailyRun() helper (GET + POST both delegate)"
  affects:
    - "app/api/cron/daily-run/route.ts (refactor — pure)"
tech_stack:
  added: []
  patterns:
    - "Vercel Cron HTTP entry point (GET + Bearer)"
    - "Shared handler extraction (GET/POST delegators)"
key_files:
  created:
    - vercel.json
    - tests/api/cron/daily-run.test.ts
  modified:
    - app/api/cron/daily-run/route.ts
decisions:
  - "GET と POST を 1 つの handleDailyRun() ヘルパに集約 (重複ロジック排除)"
  - "vercel.json は最小構成 — crons のみ、headers/rewrites は書かない (Plan 05-02 で next.config.ts に集約)"
  - "Schedule は UTC 22:00 (= JST 07:00) — Hobby ±59 min は D-02 で許容済み"
metrics:
  duration: "~25 min"
  completed_at: "2026-04-13T23:50:16Z"
  tasks: 3
  files_changed: 3
  commits: 3
---

# Phase 05 Plan 01: Vercel Cron Wiring + GET Handler Summary

Phase 5 最大の罠 (Pitfall 1: Vercel Cron は GET で叩く) を解消し、`/api/cron/daily-run` を GET + POST 両対応にし、`vercel.json` で UTC 22:00 daily cron を宣言した。

## What Changed

### 1. vercel.json (created)

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    {
      "path": "/api/cron/daily-run",
      "schedule": "0 22 * * *"
    }
  ]
}
```

- `0 22 * * *` UTC = JST 07:00 daily
- Hobby plan: 1 daily cron OK、±59 min precision (D-02 accepted)
- 余計な keys なし (`headers` / `rewrites` / `redirects` は Plan 05-02 で next.config.ts に集約予定)
- env-var 定義なし (D-08: Vercel Dashboard UI only)

### 2. app/api/cron/daily-run/route.ts (refactor — pure)

- 既存 POST 本体を `async function handleDailyRun(request: NextRequest)` ヘルパに抽出
- `export async function GET(request)` を追加 → `handleDailyRun(request)` に委譲
  (旧コード: `return NextResponse.json({error:'method_not_allowed'}, {status:405})` → 削除)
- `export async function POST(request)` も `handleDailyRun(request)` に委譲する thin wrapper に
- Bearer 認証ロジックは handleDailyRun の冒頭にあるため、GET/POST 両方で自動的に強制される
- `export const maxDuration = 120` 維持 (D-12 / D-17)
- T-03-09/T-03-10/T-03-11 関連コメントは保持
- 業務ロジック (try ブロック内 ensurePortfolio→callGemini→executeDecisions→savePortfolioSnapshot) は **完全に未変更** — 純粋なリファクタ

### 3. tests/api/cron/daily-run.test.ts (created)

vitest unit test, 6 アサーション:

| # | Method | Auth header | Expect |
|---|--------|-------------|--------|
| 1 | GET | none | 401 + `error: 'unauthorized'` |
| 2 | GET | `Bearer wrong-secret` | 401 |
| 3 | GET | `Bearer ${CRON_SECRET}` | NOT 401, NOT 405 |
| 4 | POST | none | 401 |
| 5 | POST | `Bearer wrong` | 401 |
| 6 | (module) | — | `typeof GET === 'function' && typeof POST === 'function'` |

`@/lib/agent/data-loader`, `gemini-caller`, `executor`, `prompt-builder`, `@/lib/ai/client` を全て vi.mock し、route モジュールを DB / Gemini 接続なしでロード可能にした。env vars は `beforeAll` で `process.env` に注入。

## Verification Results

| Check | Result |
|-------|--------|
| `vitest run tests/api/cron/daily-run.test.ts` | **6 passed (0 failed)** |
| `tsc --noEmit` | **exit 0** |
| `node -e "require('./vercel.json').crons[0]"` | `{path:'/api/cron/daily-run', schedule:'0 22 * * *'}` |
| `grep "method_not_allowed" route.ts` | **0 matches** (旧 405 GET 削除確認) |
| `grep "handleDailyRun" route.ts` | 4 matches (定義 + GET 委譲 + POST 委譲 + コメント) |
| `grep "maxDuration = 120" route.ts` | 1 match (D-12 保持) |
| `pnpm next build` | **skipped** — worktree env に DB 接続なし、orchestrator が wave 完了後に実行する想定 (parallel executor 規約) |

## Threat Model Closure

| Threat ID | Status | Evidence |
|-----------|--------|----------|
| T-05-01 (Spoofing) | **mitigated** | Test 1/2/4/5 が `Bearer` 不一致 401 を GREEN で確認 |
| T-05-05 (DoS 405 loop) | **mitigated** | `method_not_allowed` 削除、GET → handleDailyRun → 200/401 |
| T-05-08 (Tampering) | accepted | vercel.json は git 管理、PR diff レビュー前提 |
| T-05-09 / T-05-10 | mitigated (existing) | Phase 3 D-16 idempotent INSERT は未変更 |

## Deviations from Plan

**None — plan executed exactly as written.**

ただし以下の運用判断:
- `pnpm next build` smoke test は parallel worktree では DB 接続が無いためスキップ (route.ts/vercel.json 共に build に固有のリスクなし、tsc が型を担保)
- worktree に `node_modules` がなかったため、親リポの `node_modules` を symlink (.gitignore 対象、コミット影響なし)

## Auth Gates

None.

## Known Stubs

None.

## Threat Flags

None — 新規 surface なし、既存 cron endpoint の HTTP method 拡張のみ。

## Commits

| Hash | Message |
|------|---------|
| `5f6dfac` | test(05-01): add failing auth-guard test for daily-run GET+POST |
| `50f0a5c` | feat(05-01): add GET handler to daily-run route for Vercel Cron |
| `b04dbda` | feat(05-01): add vercel.json with daily-run cron schedule |

## Reference

- Pitfall 1 in `.planning/phases/05-deployment-hardening/05-RESEARCH.md` (Vercel Cron は GET で叩く)
- Pattern 1/2 in same RESEARCH.md
- D-01 / D-02 / D-08 / D-12 in `05-CONTEXT.md`
- Vercel Cron docs: https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs

## Self-Check: PASSED

- FOUND: vercel.json
- FOUND: tests/api/cron/daily-run.test.ts
- FOUND: app/api/cron/daily-run/route.ts (modified)
- FOUND commit: 5f6dfac
- FOUND commit: 50f0a5c
- FOUND commit: b04dbda
- vitest GREEN (6/6)
- tsc clean
