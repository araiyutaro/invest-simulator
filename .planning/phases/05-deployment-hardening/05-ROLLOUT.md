---
phase: 05
artifact: ROLLOUT
reusable: true
first_run: TBD
status: template
---

# Phase 05 — Deployment Rollout Runbook

Executable 7-step rollout for Vercel Production deploy. Follow D-15 literally.
Reusable on subsequent deploys (steps 1-2 only on first deploy; 3-7 every time).

**Prereqs:**
- [x] Plan 05-01 committed (vercel.json + daily-run GET handler)
- [x] Plan 05-02 committed (next.config.ts security headers)
- [x] Plan 05-03 committed (proxy.ts matcher + .env.example)
- [x] Plan 05-04 committed ([05-SECURITY-CHECKLIST.md](./05-SECURITY-CHECKLIST.md))

---

## Step 1 — Link Vercel project (first deploy only)

**Action (dashboard-only — D-08):**
1. Open https://vercel.com/new
2. "Import Git Repository" → select `invest-simulator` repo
3. Framework Preset: Next.js (auto-detected)
4. Root Directory: `./` (default)
5. Build Command: default (`next build`)
6. Do NOT click "Deploy" yet — go to Step 2 first

**Do NOT:**
- Run `vercel link` CLI (D-08: dashboard only)
- Enable Vercel Deployment Protection (D-06: iron-session only)

**Status:** ✅ done
**Date:** 2026-04-14
**Production URL:** https://invest-simulator-rosy.vercel.app/

---

## Step 2 — Register environment variables (first deploy, and on rotation)

**Action:** Vercel Dashboard → Project → Settings → Environment Variables.
Register each variable below. Scope them per this table:

| Variable | Production | Preview | Development |
|---|---|---|---|
| `DATABASE_URL` | ✓ | ✓ (shared Neon, D-05) | ✗ |
| `GEMINI_API_KEY` | ✓ | ✓ | ✗ |
| `SESSION_SECRET` | ✓ | ✓ (same value all envs, D-06) | ✗ |
| `SITE_PASSWORD` | ✓ | ✓ | ✗ |
| `CRON_SECRET` | **✓ ONLY** | ✗ (Pitfall 8) | ✗ |
| `FINNHUB_API_KEY` | ✓ | ✓ | ✗ |

Do NOT register `DATABASE_URL_DIRECT` in Vercel — it is local-migrate only
(see .env.example comment).

**Secret generation (local machine, before pasting into Dashboard):**
```bash
openssl rand -base64 48   # SESSION_SECRET
openssl rand -hex 32      # CRON_SECRET
```

**Verification inside Dashboard:** After saving, list should show all 6 vars
with correct scope badges.

**Do NOT:**
- Use `vercel env add` CLI (D-08)
- Enable CRON_SECRET on Preview (Pitfall 8)
- Prefix anything with `NEXT_PUBLIC_` (D-21)

**Status:** ✅ done
**Date:** 2026-04-14
**Notes:** record the last-rotation date for SESSION_SECRET here (D-09 annual rotation) — initial registration 2026-04-14

---

## Step 3 — Commit + push Phase 5 changes

**Action:**
```bash
# From repo root; expects all Plan 05-01/02/03/04 commits already on the branch
git status
git log --oneline -10
git push origin master
```

**Expect:**
- Vercel Dashboard → Deployments → new "Building" row appears
- Build log shows "Detected `vercel.json` with 1 cron job: `/api/cron/daily-run` @ `0 22 * * *`"
- Build completes with status "Ready"
- A production URL is assigned

**If build fails:**
- Check build log for env var zod errors (missing var in Dashboard → fix Step 2)
- Check for `vercel.json` schema errors (fix JSON, re-push)

**Status:** ✅ done
**Date:** 2026-04-14
**Production URL:** https://invest-simulator-rosy.vercel.app/
**Deploy SHA:** 82adbd5 (user confirmed "ready" — build Ready)

---

## Step 4 — Manual curl smoke test (immediately after deploy)

**Action:**
```bash
export DOMAIN="https://<your-domain>.vercel.app"
export CRON_SECRET="<paste from Vercel Dashboard>"

# 4a. Unauthenticated dashboard → redirect to /login
curl -s -o /dev/null -w "dashboard: %{http_code} → %{redirect_url}\n" "$DOMAIN/dashboard"

# 4b. /login is accessible
curl -s -o /dev/null -w "login: %{http_code}\n" "$DOMAIN/login"

# 4c. Cron GET with no auth → 401
curl -s -o /dev/null -w "cron-no-auth: %{http_code}\n" "$DOMAIN/api/cron/daily-run"

# 4d. Cron GET with wrong Bearer → 401 (defense-in-depth probe)
curl -s -o /dev/null -w "cron-wrong-bearer: %{http_code}\n" \
  -H "Authorization: Bearer wrong-secret-xxxxxxxxxxxxxxxx" \
  "$DOMAIN/api/cron/daily-run"

# 4e. Cron GET with correct Bearer → 200 (runs the daily cycle ONCE manually)
curl -i -H "Authorization: Bearer $CRON_SECRET" "$DOMAIN/api/cron/daily-run"
```

**Expect:**
- `dashboard: 307 → https://<domain>/login`
- `login: 200`
- `cron-no-auth: 401`
- `cron-wrong-bearer: 401`
- `4e` → HTTP/2 200 + JSON body like `{"status":"success","decisionId":"...","trades":N,...}`
  OR (if same-day re-run) `{"status":"skipped","reason":"already_ran_today"}`

**Then verify DB state:**
```bash
psql "$DATABASE_URL_DIRECT" -c "SELECT run_date, portfolio_id, cost_usd FROM decisions ORDER BY created_at DESC LIMIT 3;"
```
Expect: today's run_date row present with a non-null decision row.

**If 4e returns 405:** Plan 05-01 Task 2 refactor failed. Roll back and re-check
daily-run/route.ts GET export.

**Status:** ✅ done
**Date:** 2026-04-15
**Notes:**
- 4a dashboard: 307 → https://invest-simulator-rosy.vercel.app/login ✅
- 4b login: 200 ✅
- 4c cron-no-auth: 401 ✅
- 4d cron-wrong-bearer (GET): 401 ✅
- 4d cron-wrong-bearer (POST): 401 ✅ (extra probe)
- 4e cron correct-Bearer: HTTP/2 200 + `{"status":"success","decisionId":"7c1b9e8e-f268-4e44-954b-7d64b5770032","trades":1,"skipped":0,"costUsd":0.006279,"newCashJpy":151383.936}`
- Gemini 実呼び出し成功 — 1件約定、コスト $0.0063
- x-vercel-id: hnd1::iad1 (HND1 Tokyo region serving, IAD1 compute)
- Phase 5 最大の罠 (Cron GET) が本番で完全動作確認

---

## Step 5 — Run SECURITY-CHECKLIST manually

**Action:** Open [05-SECURITY-CHECKLIST.md](./05-SECURITY-CHECKLIST.md) and execute
items §1-§7 top-to-bottom. Record Status/Date/Notes in that file.

**Expect:** items 1, 2, 3, 4, 5, 7 all ✅; item 6 ⚠️ accepted-risk.

**Sign-off:** if any item (other than §6) is ❌, roll back the deploy or fix
forward before proceeding to Step 6.

**Status:** ✅ done (§1-§4, §7 automated; §5, §6 noted below)
**Date:** 2026-04-15
**Notes:** See 05-SECURITY-CHECKLIST.md for per-item records.

**Status:** ⬜ pending
**Date:** —

---

## Step 6 — Wait for first automatic cron fire (UTC 22:00)

**Action:** Wait until the next UTC 22:00 (= JST 07:00). Vercel Hobby has ±59 min
delivery precision (Pitfall 2) → actual fire time is any time between 22:00:00 and
22:59:59 UTC. Do not treat "not exactly 22:00" as a bug.

**After wall-clock 23:00 UTC, verify:**
1. Vercel Dashboard → Project → Logs → filter `requestPath:/api/cron/daily-run`
2. A new invocation row is present with User-Agent `vercel-cron/1.0`
3. Status code 200
4. **Duration column** reading — record this number (D-10, maxDuration measurement)
5. DB query:
   ```bash
   psql "$DATABASE_URL_DIRECT" -c "SELECT run_date, portfolio_id, cost_usd FROM decisions WHERE run_date = CURRENT_DATE;"
   ```
   Expect: 1 row for today (the Step 4 manual row is same-day, so this depends on
   whether you ran Step 4 on the current or previous calendar day — check `run_date`).

**Duration record:**
| Date (UTC) | Duration (ms) | Notes |
|---|---|---|
| — | — | — |

**If Duration > 90s (75% of maxDuration=120):** log a warning and begin tracking
trends. If Duration > 120s → function timeout → **this is an incident**; file
against Deferred Idea "Inngest/QStash fallback". Phase 05 does NOT implement the
fallback (D-11).

**If no invocation appears by 23:30 UTC:** check Vercel Dashboard → Cron Jobs page
to confirm the job is registered; if missing, Plan 05-01 Task 3 `vercel.json`
was not picked up on deploy → re-push.

**Status:** ⬜ pending
**Date:** —
**Notes:** —

---

## Step 7 — Confirm idempotent second-day run

**Action:** Wait until the NEXT calendar-day UTC 22:00 (+ ±59 min window). Verify:
```bash
psql "$DATABASE_URL_DIRECT" -c "SELECT run_date, COUNT(*) FROM decisions GROUP BY run_date ORDER BY run_date DESC LIMIT 3;"
```

**Expect:** Each run_date has exactly 1 row (COUNT = 1). If any date has 2+, the
idempotent `ON CONFLICT DO NOTHING` (D-16) is broken → regression from Phase 3.

**Also verify:** Vercel Cron Jobs page shows 2 successful invocations.

**Status:** ⬜ pending
**Date:** —

---

## Post-rollout — Accepted Risks summary

After Step 7 ✅, record in PROJECT.md Key Decisions:

| ID | Decision | Rationale |
|---|---|---|
| 05-AR-1 | Neon Free tier single-role, no DB-level RBAC | SECURITY-CHECKLIST §6; operator-level access control only |
| 05-AR-2 | Vercel Hobby ±59 min cron precision | Accepted; JST morning run is non-time-critical |
| 05-AR-3 | CSP uses `'unsafe-inline'` for script/style | Next.js RSC + Tailwind v4 requirement; nonce-based CSP deferred |
| 05-AR-4 | HSTS without `preload` | Pitfall 6: preload is irrevocable; re-enable only when domain is permanent |
| 05-AR-5 | No Inngest/QStash fallback for 120s overflow | D-11: address only on actual incident |

---

## Reusable checklist for subsequent deploys

On every subsequent deploy (not first-time):

1. ⬜ Re-run Step 3 (commit + push)
2. ⬜ Re-run Step 4 (curl smoke test)
3. ⬜ Re-run Step 5 (SECURITY-CHECKLIST)
4. ⬜ Spot-check next cron fire in Vercel Logs (no 24h wait needed)
5. ⬜ Skip Step 1 and Step 2 unless env vars rotated

---

*Template created: Phase 05 Plan 05 (2026-04-13). Reusable for every deploy.*
