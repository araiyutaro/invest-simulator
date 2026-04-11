@AGENTS.md

<!-- GSD:project-start source:PROJECT.md -->
## Project

**invest-simulator**

実在する米国株・日本株の市場データを使って、Claude（AIエージェント）が毎日仮想資金で売買判断を行い、その思考プロセスと運用成果を追跡できる学習用Webアプリ。自分専用の「AI投資観察ダッシュボード」として、Claudeの判断理由を読み解きながら投資の考え方を学ぶことを目的とする。

**Core Value:** 毎日のClaudeの売買判断と「なぜそう考えたか」の理由を読むことで、投資の思考プロセスを学べること。パフォーマンスの良し悪しよりも、判断ログの読みやすさが最優先。

### Constraints

- **Tech stack**: Next.js（既存ブートストラップを活用） — 余分な再構築をしない
- **AI実行**: Claude Agent SDK — ユーザー指定
- **Budget**: 個人プロジェクト、無料/低コスト枠優先 — API・ホスティング共に
- **Deployment**: クラウドデプロイ前提（Vercel想定） — どこからでも閲覧したい
- **Auth**: 簡易パスワード保護のみ — 自分専用、認証プロバイダは過剰
- **Security**: クラウド公開URLになるため最低限の保護が必須 — APIキー・トレードログ流出防止
- **トレード範囲**: 現物ロング、米株+日本株 — 信用/ショート/暗号資産/FXは対象外
- **頻度**: 1日1回の判断サイクル — API制限とトークンコストを抑える
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### Core Technologies
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Next.js | 16.2.3 (already installed) | Framework | Already bootstrapped. App Router + Route Handlers cover dashboard UI, API endpoints, and Vercel Cron trigger endpoint in one repo |
| React | 19.2.4 (already installed) | UI | Comes with Next.js; no change needed |
| TypeScript | ^5 (already installed) | Type safety | Critical for financial data shapes and Claude tool call types |
| Tailwind CSS | v4 (already installed) | Styling | Already configured; v4 has native CSS cascade layers, no config file needed |
| Drizzle ORM | ^0.41 | DB access layer | Type-safe SQL, tiny runtime (~7KB), first-class Neon/PG support, migration CLI. Preferred over Prisma for serverless due to no binary engine |
| Neon (serverless Postgres) | latest | Persistence | Free tier: 0.5 GB, 1 compute; sufficient for trade history + logs of a personal project. Postgres gives JSONB for Claude prompt/response blobs. Vercel native integration available |
### AI Layer
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@anthropic-ai/sdk` | ^0.81 | Claude API client for daily trading decisions | **Use this, NOT the Claude Agent SDK.** The Agent SDK spawns Claude Code as a subprocess and requires containers (1 GiB RAM, 5 GiB disk, persistent shell). Vercel Hobby has a 45-min sandbox cap and requires `spawnClaudeCodeProcess` customisation. For a daily scheduled batch that calls Claude with market data and receives a structured JSON decision, the standard SDK with tool_use is simpler, cheaper, and serverless-compatible without any container plumbing |
### Market Data APIs
| API | Coverage | Free Tier | Rate Limit | Confidence |
|-----|----------|-----------|------------|------------|
| **Finnhub** (primary US) | US stocks, fundamentals, company news, SEC filings | Free: US only | 60 calls/min | HIGH |
| **yahoo-finance2** npm (primary JP + US fallback) | US + JP stocks (ticker format `7203.T`), OHLCV, quote summary | Unofficial, free, no key needed | Self-throttle; no official limit | MEDIUM |
| **Alpha Vantage** (fallback US fundamentals) | US stocks, earnings, EPS | Free: **25 req/day** hard cap | 5 req/min | HIGH |
| **J-Quants API** (official JP, future consideration) | JP stocks OHLCV, financials | Free: **12-week delay**, 5 calls/min | Not suitable for near-real-time | HIGH |
- **US stocks price/quotes:** Finnhub (60/min free, real-time US)
- **US stock news:** Finnhub `/company-news` endpoint (free)
- **US fundamentals (P/E, EPS):** Finnhub basic financials (free for US)
- **JP stocks price + fundamentals:** `yahoo-finance2` with `.T` suffix (e.g. `7203.T`). Unofficial but widely used, maintained, npm v3.14.0, TypeScript-typed
- **JP stock news:** `yahoo-finance2` `.news()` module covers JP tickers
- **Do NOT use J-Quants free tier** for this project — 12-week data delay makes it useless for any near-current decision-making
### Database
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Neon Postgres | serverless | Trade history, portfolio state, Claude prompts/responses, performance metrics | Vercel native integration. Free tier sufficient for personal project. JSONB column for Claude raw prompt/response blobs avoids schema churn as prompts evolve |
| Drizzle ORM | ^0.41 | Type-safe queries, migrations | Lightweight (no binary), SQL-like API, drizzle-kit for migration. Better serverless story than Prisma |
### Charting
| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| **lightweight-charts** (TradingView) | ^5 | Portfolio equity curve, individual stock OHLCV candlestick | 45 KB gzipped vs Chart.js 180 KB. Purpose-built for financial time series. Renders canvas not SVG — handles 1–2 years of daily bars without DOM thrash |
| **lightweight-charts-react-wrapper** | ^3 | React component wrapper for lightweight-charts | Provides declarative React API (`ChartContainer`, `LineSeries`, `CandlestickSeries`) compatible with Next.js App Router via `"use client"` boundary |
| **Recharts** | ^2.15 | Secondary charts: pie/bar for allocation, win-rate histogram | SVG-based React-native charting. Fine for low-data-point charts (e.g. 10-sector allocation). Do NOT use for time series with daily data |
### Scheduling
| Option | Cost | Precision | Limitations | Verdict |
|--------|------|-----------|-------------|---------|
| **Vercel Cron** (Hobby) | Free | Once per day max; fires within ±60 min of configured time | Only 1x/day on free tier — matches our requirement exactly | **USE THIS** |
| GitHub Actions schedule | Free | Exact cron syntax (every 5 min+) | Requires separate repo secret management; adds complexity for a pure Vercel project | Alternative if Vercel Cron timing drift is unacceptable |
### Authentication / Password Protection
| Option | Complexity | Verdict |
|--------|------------|---------|
| **Next.js Middleware + iron-session v8** | Low | **USE THIS** |
| NextAuth.js | High | Overkill for single-user, no OAuth needed |
| Basic Auth header via middleware | Low | Stateless but no persistent session cookie, browser prompts ugly UI |
### Technical Indicators
| Library | Version | Notes |
|---------|---------|-------|
| **technicalindicators** | ^3.1 | RSI, MACD, Bollinger Bands, SMA/EMA. TypeScript source. Feed to Claude as pre-computed context |
## Supporting Libraries
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | ^3.24 | Runtime schema validation | Validate Claude's JSON response before executing trades; validate API responses from market data sources |
| `date-fns` | ^4 | Date arithmetic | Market calendar logic (skip weekends, holidays), sliding windows for Sharpe calculation |
| `iron-session` | ^8 | Session management | Password-protection middleware |
| `technicalindicators` | ^3.1 | TA indicators | RSI, MACD, SMA/EMA for Claude context |
| `lightweight-charts` | ^5 | Financial charts | Time-series charting |
| `lightweight-charts-react-wrapper` | ^3 | React bindings | Wraps lightweight-charts for App Router components |
| `recharts` | ^2.15 | General charts | Allocation pie, histogram |
| `yahoo-finance2` | ^3.14 | JP + US market data | Server-side only (CORS restrictions); call from Route Handlers |
| `@anthropic-ai/sdk` | ^0.81 | Claude API | Daily trading decision batch |
## Development Tools
| Tool | Purpose | Notes |
|------|---------|-------|
| `drizzle-kit` | DB migrations | `drizzle-kit generate` + `drizzle-kit migrate`; run locally or in CI |
| Neon CLI / Vercel Integration | DB provisioning | Use Vercel x Neon integration to auto-inject `DATABASE_URL` |
| `tsx` / `ts-node` | Run TS scripts locally | For manual trigger of daily job during development |
## Installation
# Core data + DB
# Market data
# Charts
# Auth
# TA indicators
# Dev
## Alternatives Considered
| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| `@anthropic-ai/sdk` | `@anthropic-ai/claude-agent-sdk` | Agent SDK spawns Claude Code subprocess, needs container (1 GiB RAM, 5 GiB disk). Vercel Hobby sandbox caps at 45 min and requires custom `spawnClaudeCodeProcess`. Overkill for structured JSON trade-decision calls |
| Neon Postgres + Drizzle | Turso (SQLite) | SQLite has limited concurrent write throughput and fewer types (no JSONB). Postgres is safer for financial data schemas. Neon free tier is sufficient |
| Neon Postgres + Drizzle | Vercel KV (Redis) | KV is not suitable for relational trade history with joins; Postgres is the right tool |
| Neon Postgres + Drizzle | Prisma | Prisma binary engine adds cold-start latency on serverless; Drizzle has no binary, better Neon integration |
| Vercel Cron | GitHub Actions | GitHub Actions adds separate infra management for what is inherently a Vercel project. Vercel Cron is zero-config for this use case |
| lightweight-charts | Chart.js | Chart.js 180 KB bundle, SVG rendering, no first-class candlestick support |
| lightweight-charts | Recharts (for time series) | Recharts creates one SVG node per data point; 500+ daily bars freezes the browser |
| iron-session | NextAuth.js / Auth.js | Single-user personal project; NextAuth provider complexity is unjustified |
| `yahoo-finance2` | Alpha Vantage (JP stocks) | Alpha Vantage free tier has only 25 req/day and does NOT cover JP stocks |
| `yahoo-finance2` | J-Quants API (JP stocks) | J-Quants free tier has 12-week data delay — unusable for any current-price decision |
| Finnhub | Polygon.io | Polygon free tier is read-only websocket with limited REST; US stocks cost money beyond basic quotes |
## What NOT to Use
| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `@anthropic-ai/claude-agent-sdk` (for this project) | Requires container with persistent shell, 1 GiB RAM, Claude Code CLI subprocess. Vercel Hobby sandbox = 45 min cap. Structural mismatch for a stateless daily batch job | `@anthropic-ai/sdk` with tool_use and custom agentic loop |
| Alpha Vantage for JP stocks | No JP coverage | `yahoo-finance2` |
| J-Quants free tier | 12-week data delay makes current prices impossible | `yahoo-finance2` with `.T` suffix |
| Finnhub for JP stocks | JP coverage requires paid plan ($11.99+/month) | `yahoo-finance2` |
| Recharts for portfolio time series | SVG per data point; 1+ year of daily data = DOM thrash | `lightweight-charts` |
| Prisma ORM | Binary engine, higher cold-start on serverless Neon | Drizzle ORM |
| NextAuth / Auth.js | Multi-provider OAuth complexity for a single-user tool | `iron-session` v8 + env-var password |
| Browser-side `yahoo-finance2` | Library explicitly forbids browser use (CORS + cookie issues) | Call only from Next.js Route Handlers or server components |
## Free-Tier Constraints (explicit)
| Service | Free Tier Cap | Impact on Project |
|---------|--------------|-------------------|
| Alpha Vantage | 25 req/day total | Can only pull ~12 tickers/day at 2 calls each. Use for US fundamentals only, not prices |
| Finnhub | 60 calls/min, US only free | With 10 US tickers × 3 data types = 30 calls; well within limit |
| yahoo-finance2 | Unofficial, no SLA | Risk: Yahoo may block or break the library. Mitigation: cache daily, catch errors per ticker |
| J-Quants (free) | 12-week delay, 5 calls/min | DO NOT USE for this project |
| Neon Postgres | 0.5 GB, 1 compute, auto-suspends after 5 min idle | Fine for personal project; cold-start ~500 ms on first query — use connection pooling |
| Vercel Cron (Hobby) | Once per day maximum | Matches project's 1x/day requirement exactly |
| Vercel Hobby | 60-second serverless function timeout | Daily batch may need to be split into multiple requests or use Vercel Fluid Compute if Claude calls are slow |
## Version Compatibility
| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| Next.js 16.2.3 | React 19.2.4 | Already installed and compatible |
| Drizzle ORM ^0.41 | `@neondatabase/serverless` latest | Official Neon adapter for Drizzle documented |
| iron-session ^8 | Next.js App Router | v8 specifically rewrote for App Router `cookies()` API |
| lightweight-charts ^5 | React 19 via `lightweight-charts-react-wrapper` ^3 | Must use `"use client"` directive; canvas rendering, no SSR |
| `@anthropic-ai/sdk` ^0.81 | Node.js 18+, Next.js Route Handlers | Streams supported; works in serverless |
## Sources
- [Finnhub rate limits](https://finnhub.io/docs/api/rate-limit) — verified 60 calls/min free tier; JP requires paid
- [Alpha Vantage free tier](https://www.alphavantage.co/support/) — verified 25 req/day
- [yahoo-finance2 npm](https://www.npmjs.com/package/yahoo-finance2) — v3.14.0, server-side only confirmed
- [J-Quants API official](https://jpx-jquants.com/en) — 12-week delay on free plan, 5 calls/min
- [Claude Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview) — subprocess architecture confirmed
- [Claude Agent SDK hosting guide](https://code.claude.com/docs/en/agent-sdk/hosting) — container requirements: 1 GiB RAM, 5 GiB disk, Node 18+
- [Vercel + Claude Agent SDK sandbox](https://vercel.com/kb/guide/using-vercel-sandbox-claude-agent-sdk) — Hobby 45-min sandbox cap confirmed
- [Claude Agent SDK TypeScript reference](https://code.claude.com/docs/en/agent-sdk/typescript) — v0.2.101, Node 18+
- [Vercel Cron docs](https://vercel.com/docs/cron-jobs/usage-and-pricing) — once-per-day on Hobby plan confirmed
- [Neon vs Turso comparison](https://openalternative.co/compare/neon-postgres/vs/turso) — Neon 0.5 GB free tier, Drizzle recommendation for personal project
- [Drizzle + Neon official tutorial](https://orm.drizzle.team/docs/tutorials/drizzle-nextjs-neon) — Next.js App Router integration confirmed
- [iron-session v8 release](https://github.com/vvo/iron-session/releases/tag/v8.0.0) — App Router `getIronSession(cookies(), {...})` API confirmed
- [lightweight-charts React tutorial](https://tradingview.github.io/lightweight-charts/tutorials/react/simple) — official React integration docs
- [technicalindicators npm](https://www.npmjs.com/package/technicalindicators) — TypeScript, RSI/MACD confirmed
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, or `.github/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
