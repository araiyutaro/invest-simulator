---
phase: 04
slug: dashboard
status: verified
threats_open: 0
threats_total: 9
threats_closed: 9
asvs_level: 1
created: 2026-04-13
---

# Phase 04 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| client → /dashboard | Authenticated session cookie; dashboard page render | iron-session cookie |
| client → /api/dashboard/timeline | User-supplied `offset`, `limit`, `portfolioId` query params | ints + UUID string |
| Server Component → Client Component | Page fetches DB data and passes only serializable primitives | metrics, chart points, positions, cash, timeline |
| DB → Server | Drizzle parameterized queries; `server-only` module guard | portfolio / positions / snapshots / decisions |
| JSONB transcript → parser | AI transcript stored as JSONB, defensively parsed | agent decisions |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-04-01 | Spoofing | DashboardHeader sign-out form | accept | proxy.ts gates `/dashboard`; `/api/auth/logout` destroys session via `getIronSession().destroy()` and 303-redirects to `/login` | closed |
| T-04-02 | Information Disclosure | `lib/dashboard/queries.ts` | mitigate | `import 'server-only'` at line 1 prevents DB module bundling into any Client Component | closed |
| T-04-03 | Tampering | `parseTimelineFromDecision` in `queries.ts:59-102` | mitigate | Null/non-object/non-array guards, whitelisted action & confidence values, typeof-safe coercion, empty-array fallback | closed |
| T-04-04 | Information Disclosure | `app/dashboard/page.tsx` | mitigate | Server Component only; DB credentials never cross the boundary; Client Components receive serializable primitives only | closed |
| T-04-05 | Denial of Service | `page.tsx` Promise.all | accept | 4 parallel queries is bounded per-request fan-out; single-user app behind auth gate | closed |
| T-04-06 | Spoofing | `app/api/dashboard/timeline/route.ts` | mitigate | Explicit `getIronSession` check inside the Route Handler returns 401 when unauthenticated — defense-in-depth on top of proxy.ts | closed |
| T-04-07 | Tampering | `offset`/`limit` query params | mitigate | `toSafeInt` uses `Number()` + `Number.isFinite` + `Math.floor`; `offset` clamped with `Math.max(0, …)`; `limit` clamped with `Math.min(100, Math.max(1, …))` | closed |
| T-04-08 | Tampering | `portfolioId` query param | mitigate | UUID regex `/^[0-9a-f-]{36}$/i` validation rejects non-matching values with HTTP 400 before any DB query | closed |
| T-04-09 | Information Disclosure | error response in timeline route | mitigate | Bare `catch` returns a generic Japanese message with HTTP 500; no stack trace, error name, or DB detail leaked | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| R-04-01 | T-04-01 | Sign-out は best-effort UX。サーバ側で session.destroy() + 303 redirect を実施しており、クッキー漏えいの攻撃表面はセッション Cookie のみ（httpOnly + sameSite=lax）。proxy.ts が /dashboard を常に認証保護するため、sign-out を仮にバイパスされても次回の dashboard アクセスで再認証が強制される。 | user | 2026-04-13 |
| R-04-05 | T-04-05 | 個人プロジェクトかつ認証ゲート背後。1 リクエストあたり 4 クエリ並列は許容範囲。Neon 側のコネクションプールが natural back-pressure として機能。 | user | 2026-04-13 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-04-13 | 9 | 9 | 0 | gsd-security-auditor (sonnet) |

### Audit Notes (2026-04-13)

- All 9 STRIDE threats from 04-01/02/03/04-PLAN.md verified against implementation.
- Auditor read `proxy.ts`, `lib/session.ts`, `lib/dashboard/queries.ts`, `app/dashboard/page.tsx`, `app/dashboard/components/DashboardHeader.tsx`, `app/api/auth/logout/route.ts`, `app/api/dashboard/timeline/route.ts` as read-only.
- No implementation gaps. No unregistered threats surfaced.
- Proxy matcher `['/((?!_next/static|_next/image|favicon.ico).*)']` confirms both `/dashboard` and `/api/dashboard/timeline` are covered.
- Session config has `httpOnly: true`, `secure: true in production`, `sameSite: 'lax'` — ancillary support for T-04-01 / T-04-06.
- `parseTimelineFromDecision` is pure (no I/O, no mutation) — unit-testable and defense-in-depth against malformed JSONB.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter
