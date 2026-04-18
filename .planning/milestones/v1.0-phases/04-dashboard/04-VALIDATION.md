---
phase: 4
slug: dashboard
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-12
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.4 |
| **Config file** | vitest.config.ts (existing) |
| **Quick run command** | `npx vitest run lib/dashboard/` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run lib/dashboard/`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | DASH-01 | T-04-01 | server-only guard on query module | unit | `npx vitest run lib/dashboard/metrics.test.ts` | ❌ W0 | ⬜ pending |
| 04-01-02 | 01 | 1 | DASH-04 | — | N/A | unit | `npx vitest run lib/dashboard/metrics.test.ts` | ❌ W0 | ⬜ pending |
| 04-02-01 | 02 | 1 | DASH-02 | — | N/A | unit | `npx vitest run lib/dashboard/metrics.test.ts` | ❌ W0 | ⬜ pending |
| 04-03-01 | 03 | 2 | DASH-03 | T-04-02 | auth check in route handler | unit | `npx vitest run lib/dashboard/queries.test.ts` | ❌ W0 | ⬜ pending |
| 04-03-02 | 03 | 2 | DASH-05 | — | N/A | unit | `npx vitest run app/dashboard/components/*.test.tsx` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `lib/dashboard/metrics.ts` — %正規化・シャープレシオ・最大DD・勝率・含み損益計算
- [ ] `lib/dashboard/metrics.test.ts` — 正規化・指標計算のユニットテスト
- [ ] `lib/dashboard/queries.ts` — DBクエリ関数（ポートフォリオスナップショット・ポジション・トレード・transcript解析）
- [ ] `lib/dashboard/queries.test.ts` — transcript解析・BUY/SELLフィルタのユニットテスト

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| チャート3系列の目視確認 | DASH-01 | Canvas描画はDOM検査不可 | ブラウザでポートフォリオ・SPY・TOPIX 3本の折れ線が表示されることを確認 |
| ダークテーマの視認性 | DASH-01~05 | 色のコントラストは主観判断 | ブラウザで全セクションの文字・チャートが暗い背景で読めることを確認 |
| 確信度の色区別 | DASH-05 | 色の区別は目視確認 | high=緑系, medium=黄/オレンジ系, low=赤系のバッジが正しく表示されることを確認 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
