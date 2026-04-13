---
phase: "05"
plan: "02"
subsystem: deployment-hardening
tags: [security, headers, csp, hsts, next-config]
requires: []
provides:
  - global-security-headers
  - csp-baseline
affects:
  - next.config.ts
tech_stack:
  added: []
  patterns:
    - "next.config.ts async headers() for build-time global header injection"
key_files:
  created: []
  modified:
    - next.config.ts
decisions:
  - "Headers wired in next.config.ts (single source of truth) — not duplicated in proxy.ts or vercel.json"
  - "HSTS uses max-age=63072000 + includeSubDomains, NO preload (Pitfall 6: preload is irrevocable)"
  - "CSP retains 'unsafe-inline' for script-src and style-src to support Next.js App Router + Tailwind v4 inline style injection (Pitfall 5); nonce-based CSP deferred — requires dynamic rendering, out of Phase 5 scope"
metrics:
  duration_minutes: 4
  tasks_completed: 1
  files_modified: 1
  completed_date: "2026-04-14"
requirements_completed:
  - OPS-03
---

# Phase 05 Plan 02: Global Security Headers Summary

**One-liner:** Wired 6 security headers (HSTS, X-Content-Type-Options, Referrer-Policy, X-Frame-Options, Permissions-Policy, CSP) globally via `next.config.ts` `async headers()` for `/:path*`.

## What Was Built

`next.config.ts` now exports a `securityHeaders` constant and an `async headers()` config method that applies all 6 headers to every route at build time. Verified end-to-end with `pnpm next start` + `curl -sI` — all 6 header lines returned on `/login`.

### Header Inventory

| Header | Value | Threat Mitigated |
|---|---|---|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` | T-05-02 MITM HTTPS downgrade (2-year HSTS, no preload — see Pitfall 6) |
| `X-Content-Type-Options` | `nosniff` | T-05-12 MIME sniffing |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | T-05-13 cross-origin referrer leakage |
| `X-Frame-Options` | `DENY` | T-05-11 clickjacking (defense-in-depth with CSP `frame-ancestors 'none'`) |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | T-05-15 abuse of unused powerful APIs |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests` | T-05-11 clickjacking, T-05-14 XSS (partial — inline still allowed per Pitfall 5) |

## Pitfall References

- **Pitfall 5** (`05-RESEARCH.md`): Next.js RSC + Tailwind v4 inject inline `<style>` blocks at build time. CSP must include `'unsafe-inline'` for `style-src` (and `script-src` until nonce-based CSP is adopted). Migrating to nonce-based CSP requires dynamic rendering for every route — explicitly out of Phase 5 scope.
- **Pitfall 6** (`05-RESEARCH.md`): HSTS `preload` directive is effectively irrevocable (browser preload list removal takes weeks-months). Omitted intentionally; can be added in a future phase once production domain and DNS are stable.

## Verification Results

- `pnpm tsc --noEmit` → exit 0
- `pnpm next build` → exit 0 (Next.js 16.2.3, Turbopack, 11/11 static pages generated)
- `curl -sI http://localhost:3457/login | grep -iE "^(strict-transport-security|x-content-type-options|referrer-policy|x-frame-options|permissions-policy|content-security-policy)"` → 6 lines returned, all values match
- Static grep assertions: all acceptance criteria pass (HSTS preload absent, securityHeaders defined, async headers wired to `/:path*`)

## Deviations from Plan

None — plan executed exactly as written.

## Authentication Gates

None.

## Commits

- `6a3e563` — feat(05-02): add global security headers via next.config.ts

## Self-Check: PASSED

- FOUND: next.config.ts (modified, 55 insertions / 1 deletion)
- FOUND: commit 6a3e563
- FOUND: 6 security headers verified via live curl smoke test
