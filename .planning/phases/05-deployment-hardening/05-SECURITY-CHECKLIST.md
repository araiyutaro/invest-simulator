---
phase: 05
artifact: SECURITY-CHECKLIST
reusable: true
last_run: TBD
status: template
---

# Phase 05 — Security Checklist

Manual security verification to execute **before every production deploy**
and **after each major change** to auth/cron/env configuration.

Each item is runnable top-to-bottom. Record `Status`, `Date`, and `Notes`
per run. Copy this file to `.planning/phases/05-deployment-hardening/runs/NNNN-run.md`
if you want per-run history; otherwise just overwrite the Status boxes.

**Before you start:**
```bash
export DOMAIN="https://<your-vercel-domain>.vercel.app"
export CRON_SECRET="<paste from Vercel Dashboard>"
export DATABASE_URL_DIRECT="<local-only, for §6>"
```

**Legend:** ⬜ pending · ✅ pass · ❌ fail · ⚠️ accepted-risk

---

## 1. `.env*` が `.gitignore` に入っている

**Requirement:** D-13 §1, ASVS L1 §14.3.1
**Why:** ローカルの `.env.local` が git push で漏れるのを防ぐ。

**Run:**
```bash
git check-ignore -v .env .env.local .env.production 2>&1
```

**Expect:** 3 行とも `.gitignore:<N>:.env*` パターンで返る。1 つでも
`::.env*` (空の path 部分) や "not ignored" なら FAIL。

**Status:** ⬜ pending
**Date:** —
**Notes:** —

---

## 2. 全認証必須ルートが未認証時にリダイレクト/401 を返す

**Requirement:** D-13 §2, OPS-03, Threat T-05-17
**Why:** iron-session ゲート (proxy.ts) が全 UI/API を覆っていることを確認する。

**Run:**
```bash
for path in "/" "/dashboard" "/api/dashboard/timeline?portfolioId=00000000-0000-0000-0000-000000000000"; do
  echo "=== $path ==="
  curl -s -o /dev/null -w "%{http_code} → %{redirect_url}\n" "$DOMAIN$path"
done
```

**Expect:**
- `/` → `307 → https://<domain>/login`
- `/dashboard` → `307 → https://<domain>/login`
- `/api/dashboard/timeline?...` → `401 → ` (空 redirect_url、iron-session が redirect ではなく 401 を返す)

**Status:** ⬜ pending
**Date:** —
**Notes:** —

---

## 3. CRON_SECRET 不一致で 401

**Requirement:** D-13 §3, OPS-02, Threat T-05-01
**Why:** Cron エンドポイントが外部から勝手に叩かれても決定サイクルが走らないことを確認する。

**Run:**
```bash
# 3a. No Authorization header
curl -s -o /dev/null -w "no-header: %{http_code}\n" "$DOMAIN/api/cron/daily-run"

# 3b. Wrong Bearer
curl -s -o /dev/null -w "wrong-bearer: %{http_code}\n" \
  -H "Authorization: Bearer wrong-secret-xxxxxxxxxxxxxxxx" \
  "$DOMAIN/api/cron/daily-run"

# 3c. POST (manual debug path) with wrong bearer
curl -s -o /dev/null -w "post-wrong: %{http_code}\n" \
  -X POST -H "Authorization: Bearer wrong" \
  "$DOMAIN/api/cron/daily-run"

# 3d. Correct bearer (GET, as Vercel Cron would send)
curl -s -o /dev/null -w "correct-get: %{http_code}\n" \
  -H "Authorization: Bearer $CRON_SECRET" \
  "$DOMAIN/api/cron/daily-run"
```

**Expect:**
- `no-header: 401`
- `wrong-bearer: 401`
- `post-wrong: 401`
- `correct-get: 200` (fresh run) or `200` with JSON `{"status":"skipped","reason":"already_ran_today"}` (idempotent same-day)

**Status:** ⬜ pending
**Date:** —
**Notes:** —

---

## 4. proxy.ts matcher の静的資産除外

**Requirement:** D-13 §4
**Why:** 静的アセットや metadata ファイルが認証ゲートに引っかからないことを保証する。

**Run:**
```bash
grep -n "matcher" proxy.ts
```

**Expect:** 1 行、内容が
```
matcher: ['/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)'],
```

**Status:** ⬜ pending
**Date:** —
**Notes:** —

---

## 5. Vercel Function Logs に secret/PII が出ていない

**Requirement:** D-13 §5, ASVS L1 §14.3.2, Threat T-05-06
**Why:** 本番ログに API キー・セッション・プロンプト内 PII が書き出されていないことを確認する。

**Run:** Vercel Dashboard → Project → Logs → 直近 24h を選択 → "Download" で CSV エクスポート → 次のコマンド:
```bash
# 置換: LOGS.csv は export したファイル名
grep -iE "(sk-[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{20,}|postgres://|postgresql://|SESSION_SECRET|CRON_SECRET|SITE_PASSWORD|FINNHUB_API_KEY|GEMINI_API_KEY)" LOGS.csv
```

**Expect:** 出力行なし (grep 終了コード 1)。URL パスなどに `postgres` が現れる正常ログがあれば false positive として目視確認。

**Status:** ⬜ pending
**Date:** —
**Notes:** —

---

## 6. Neon DB ロール最小権限

**Requirement:** D-13 §6, ASVS L1 §14.1.1 (部分充足)
**Why:** アプリが DB スキーマ破壊権限を持たないことを保証する。

**⚠️ ACCEPTED RISK — Free tier 制約:**

Neon Free tier は 1 プロジェクト / 1 compute / 1 メインロール (`neondb_owner`) が
固定構成で、追加ロールの作成は console 管理外となる (RESEARCH.md §Pattern 9)。
個人プロジェクト・単一ユーザー運用 (DB 接続を持つ人員は 1 名) という
物理的アクセス制御で補強し、Phase 5 スコープでは accepted risk として記録する。

**将来の引き上げ条件:** Neon を Paid プランにアップグレードした時点、または
マルチユーザー運用が発生した時点で、別フェーズで SQL ベース `CREATE ROLE invest_app`
+ `GRANT SELECT, INSERT, UPDATE ON ...` を実装する。

**現状の権限ダンプ (記録用):**
```bash
psql "$DATABASE_URL_DIRECT" -c "\du"
psql "$DATABASE_URL_DIRECT" -c "SELECT grantee, privilege_type, table_name FROM information_schema.role_table_grants WHERE grantee = current_user AND table_schema='public';"
```

**Expect:** `neondb_owner` ロール、public スキーマの全テーブルに ALL 権限。これを
毎回のデプロイで確認 (変動がないこと)。

**Status:** ⚠️ accepted-risk
**Date:** 2026-04-13 (Phase 05 作成時)
**Notes:** Free tier 制約のため当面維持。PROJECT.md Key Decisions にも記録。

---

## 7. セキュリティヘッダが返る

**Requirement:** D-13 §7, OPS-03, Threats T-05-02/11/12/13/14/15
**Why:** next.config.ts `async headers()` の配線が本番でも生きていることを確認する。

**Run:**
```bash
curl -sI "$DOMAIN/login" | grep -iE "^(strict-transport-security|x-content-type-options|referrer-policy|content-security-policy|x-frame-options|permissions-policy)"
```

**Expect:** 6 行すべて出力される。各値の確認:
- `strict-transport-security: max-age=63072000; includeSubDomains` (NO `preload`)
- `x-content-type-options: nosniff`
- `referrer-policy: strict-origin-when-cross-origin`
- `x-frame-options: DENY`
- `permissions-policy: camera=(), microphone=(), geolocation=()`
- `content-security-policy: default-src 'self'; script-src 'self' 'unsafe-inline'; ...`

**追加:** Chrome DevTools で `$DOMAIN/dashboard` を開き、Console タブに
`Refused to execute inline script because it violates the following Content Security Policy directive`
が出ていないことを確認 (Pitfall 5 回帰検知)。

**Status:** ⬜ pending
**Date:** —
**Notes:** —

---

## Summary

| # | Item | Status |
|---|------|--------|
| 1 | `.env*` in .gitignore | ⬜ |
| 2 | Auth gate on all routes | ⬜ |
| 3 | CRON_SECRET guard (GET + POST) | ⬜ |
| 4 | proxy.ts matcher | ⬜ |
| 5 | No secrets in logs | ⬜ |
| 6 | DB role least privilege | ⚠️ accepted-risk |
| 7 | Security headers | ⬜ |

**Sign-off:** deploy promoted to production only when items 1-5 and 7 are ✅
and item 6 is ⚠️ accepted-risk (documented as-is).

---

*Template created: Phase 05 Plan 04 (2026-04-13). Reusable for every deploy.*
