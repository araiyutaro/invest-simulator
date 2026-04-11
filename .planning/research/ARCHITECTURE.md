# Architecture Research

**Domain:** AI-driven virtual stock trading simulator (daily batch + read dashboard)
**Researched:** 2026-04-11
**Confidence:** HIGH (Claude Agent SDK docs official, Vercel cron docs official, SQLite/Neon tradeoffs verified)

---

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                     EXTERNAL DATA SOURCES                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ Alpha Vantage│  │   Finnhub    │  │  Yahoo Finance (JP)  │   │
│  │  / Stooq    │  │  (news/fund) │  │  / Stooq (JP)        │   │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘   │
└─────────┼─────────────────┼───────────────────────┼─────────────┘
          │                 │                       │
          ▼                 ▼                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                   DAILY AGENT PIPELINE (Vercel Cron)             │
│                   app/api/cron/daily-run/route.ts                │
│                                                                  │
│  ┌─────────────────┐    ┌──────────────────────────────────┐    │
│  │  Market Data    │    │     Claude Agent SDK Runner       │    │
│  │  Fetcher        │───▶│  (lib/agent/trading-agent.ts)    │    │
│  │  (lib/market/)  │    │                                  │    │
│  │                 │    │  Tools exposed to Claude:         │    │
│  │  - prices       │    │  - get_prices(symbols)           │    │
│  │  - news         │    │  - get_news(symbol)              │    │
│  │  - fundamentals │    │  - get_fundamentals(symbol)      │    │
│  └─────────────────┘    │  - get_portfolio()               │    │
│                         │  - get_positions()               │    │
│                         │  - place_order(...)              │    │
│                         │  - get_market_context()          │    │
│                         └──────────────┬─────────────────-─┘    │
│                                        │ decisions + reasoning   │
│                                        ▼                         │
│                         ┌──────────────────────────┐            │
│                         │  Virtual Trade Executor   │            │
│                         │  (lib/executor/)          │            │
│                         │                           │            │
│                         │  - Apply COD price        │            │
│                         │  - Flat 0.1% commission   │            │
│                         │  - Update cash balance    │            │
│                         │  - Record trade + reason  │            │
│                         └──────────────┬────────────┘           │
└──────────────────────────────────────────────────────────────────┘
                                         │ writes
                                         ▼
┌──────────────────────────────────────────────────────────────────┐
│                     PERSISTENCE LAYER                            │
│                     Neon Postgres + Prisma ORM                   │
│                                                                  │
│  portfolios │ positions │ trades │ decisions │ price_snapshots   │
└──────────────────────────────────────────────────────────────────┘
                                         │ reads
                                         ▼
┌──────────────────────────────────────────────────────────────────┐
│                     DASHBOARD (Next.js App Router)               │
│                                                                  │
│  app/                                                            │
│  ├── (auth)/login/      password gate (middleware)               │
│  ├── dashboard/         portfolio overview, P&L chart            │
│  ├── positions/         current holdings table                   │
│  ├── trades/            trade timeline + Claude reasoning        │
│  └── metrics/           Sharpe, drawdown, win rate               │
│                                                                  │
│  Data access: Server Components → Prisma direct queries          │
└──────────────────────────────────────────────────────────────────┘
```

---

## Component Boundaries

| Component | Responsibility | Lives In | Talks To |
|-----------|---------------|----------|----------|
| Cron Trigger | HTTP GET entry point, auth check, orchestrate pipeline | `app/api/cron/daily-run/route.ts` | MarketFetcher, AgentRunner |
| MarketFetcher | Fetch prices, news, fundamentals from external APIs; cache in DB | `lib/market/` | External APIs, Neon (price_snapshots) |
| ContextBuilder | Assemble Claude prompt context from DB snapshot + portfolio | `lib/agent/context-builder.ts` | Neon (read positions, portfolio) |
| AgentRunner | Run Claude Agent SDK query loop; expose custom tools; capture full transcript | `lib/agent/trading-agent.ts` | Claude Agent SDK, TradeExecutor (via tools) |
| TradeExecutor | Validate and apply virtual trade: check cash, compute COD price, write trade + updated position | `lib/executor/trade-executor.ts` | Neon (write trades, positions) |
| DecisionPersister | Save agent decision record with full reasoning text and session transcript | `lib/agent/decision-persister.ts` | Neon (write decisions) |
| Dashboard Pages | Server Components that query Neon directly for display; no API layer needed | `app/dashboard/`, `app/positions/`, etc. | Neon (read only) |
| Auth Middleware | Simple password check via `middleware.ts`; sets a cookie | `middleware.ts` | Next.js cookie |

**Boundary rule:** The cron route is the only entry point to the write path. Dashboard pages are read-only. TradeExecutor never calls external APIs — it only reads from already-fetched price_snapshots.

---

## Data Flow

### Daily Agent Pipeline (write path)

```
Vercel Cron (09:00 UTC) → GET /api/cron/daily-run
    │
    ├── 1. Verify CRON_SECRET header
    │
    ├── 2. MarketFetcher.fetchAll(watchlist)
    │       → GET prices (close of previous trading day)
    │       → GET news headlines (last 24h)
    │       → GET fundamentals (cached 7 days, refresh if stale)
    │       → WRITE price_snapshots to DB
    │
    ├── 3. ContextBuilder.build()
    │       → READ portfolio, positions from DB
    │       → Produce structured context object
    │
    ├── 4. AgentRunner.run(context)
    │       → Claude Agent SDK query() loop
    │       → Claude calls tools (get_prices, get_news, get_portfolio…)
    │       → Claude calls place_order(symbol, action, quantity, reasoning)
    │             └── TradeExecutor.execute() called inside tool handler
    │                   → Lookup COD price from price_snapshots
    │                   → Validate cash sufficiency
    │                   → WRITE trade record to DB
    │                   → UPDATE position in DB
    │                   → UPDATE portfolio cash balance in DB
    │       → Agent loop ends (result message)
    │       → WRITE decision record (full transcript, summary) to DB
    │
    └── 5. Return { success: true, tradesExecuted: N }
```

### Dashboard Read Path (no writes)

```
Browser → Next.js Server Component
    │
    ├── Auth: middleware checks session cookie
    │
    └── Prisma query (direct, no API hop)
          → Neon Postgres
          → Return typed data to Server Component
          → Render HTML
```

---

## Virtual Trade Execution Semantics

**Price used:** Close-of-day (COD) price from the previous trading day's price snapshot. This is the price stored by MarketFetcher before the agent runs. Rationale: the agent "decides overnight" and executes at yesterday's close — simple, reproducible, auditable.

**Commission model:** Flat 0.1% of trade value (both sides). No bid-ask spread simulation. Rationale: keeps the focus on reasoning quality, not execution realism; commission is visible in trade records.

**No slippage modeling.** This is a learning/observation tool, not a backtesting engine. Slippage complexity adds noise without learning value.

**Cash management:**
- Starting balance: ¥10,000,000
- Cash tracked in `portfolios.cash_jpy`
- BUY: deduct `quantity × price + commission`
- SELL: add `quantity × price - commission`
- TradeExecutor rejects orders that would make cash negative (returns error to Claude)

**Splits and corporate actions:** Not modeled in MVP. Position quantities and average cost are as-recorded. A note field on the position row will allow manual correction if needed.

**Market hours:** Agent runs once per day at a fixed UTC time. If a market is closed (weekend, holiday), MarketFetcher returns the last available price with a `market_closed: true` flag. The agent receives this in context and can decide to hold.

**Currency handling:** US stocks stored in USD, JP stocks in JPY. Portfolio totals converted to JPY at daily FX rate fetched alongside prices. FX rate stored in `price_snapshots`.

---

## Claude Agent SDK Integration

**Pattern:** `query()` streaming loop (TypeScript SDK `@anthropic-ai/claude-agent-sdk`). The agent is given a structured system prompt and custom tools. Built-in tools (Read, Bash, etc.) are NOT allowed — only domain tools.

**Tool interface sketch:**

```typescript
// All tools return structured JSON Claude can reason about

get_prices({ symbols: string[] })
  → { symbol: string; close: number; currency: string; date: string; market_closed: boolean }[]

get_news({ symbol: string; days?: number })
  → { headline: string; source: string; published_at: string; sentiment?: string }[]

get_fundamentals({ symbol: string })
  → { pe_ratio?: number; eps?: number; market_cap?: number; sector?: string; ... }

get_portfolio()
  → { cash_jpy: number; total_value_jpy: number; benchmark_return: number; portfolio_return: number }

get_positions()
  → { symbol: string; quantity: number; avg_cost: number; current_price: number; unrealized_pnl: number }[]

place_order({ symbol: string; action: "BUY" | "SELL"; quantity: number; reasoning: string })
  → { success: boolean; executed_price: number; commission: number; error?: string }

get_market_context()
  → { date: string; active_markets: string[]; watchlist: string[]; }
```

**Transcript persistence:** The `query()` loop yields typed message objects. Each message is buffered and after the loop completes, the full array is serialized as JSONB into `decisions.transcript`. The final `ResultMessage.result` is stored as `decisions.summary`.

**Session IDs:** Each daily run generates a new session (no resume between days). The session_id from the `SystemMessage` init event is stored on the `decisions` row for debugging.

**System prompt:** Injected once per run. Contains persona ("You are a virtual fund manager with ¥10M initial capital"), constraints ("long-only, no leverage"), and today's context object from ContextBuilder.

---

## Database Schema (rough shape)

```sql
-- One per deployment
portfolios (
  id              UUID PRIMARY KEY,
  name            TEXT,
  base_currency   TEXT DEFAULT 'JPY',
  initial_cash    BIGINT,         -- in minor units (sen)
  cash            BIGINT,         -- current cash
  created_at      TIMESTAMPTZ
)

-- Updated on every trade
positions (
  id              UUID PRIMARY KEY,
  portfolio_id    UUID REFERENCES portfolios,
  symbol          TEXT,           -- e.g. "7203.T", "AAPL"
  exchange        TEXT,           -- "NYSE", "TSE"
  quantity        INTEGER,
  avg_cost        NUMERIC(18,6),  -- in local currency
  currency        TEXT,
  opened_at       TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ,
  UNIQUE(portfolio_id, symbol)
)

-- Immutable trade log
trades (
  id              UUID PRIMARY KEY,
  portfolio_id    UUID REFERENCES portfolios,
  decision_id     UUID REFERENCES decisions,
  symbol          TEXT,
  action          TEXT CHECK (action IN ('BUY','SELL')),
  quantity        INTEGER,
  executed_price  NUMERIC(18,6),
  commission      NUMERIC(18,6),
  currency        TEXT,
  fx_rate_to_jpy  NUMERIC(12,6),
  executed_at     TIMESTAMPTZ
)

-- One per agent run, with full reasoning
decisions (
  id              UUID PRIMARY KEY,
  portfolio_id    UUID REFERENCES portfolios,
  session_id      TEXT,           -- Claude Agent SDK session_id
  run_date        DATE,
  summary         TEXT,           -- ResultMessage.result (human-readable)
  transcript      JSONB,          -- full message stream array
  prompt_tokens   INTEGER,
  completion_tokens INTEGER,
  created_at      TIMESTAMPTZ
)

-- Price data fetched each run (used by executor for COD price)
price_snapshots (
  id              UUID PRIMARY KEY,
  symbol          TEXT,
  price_date      DATE,
  close           NUMERIC(18,6),
  currency        TEXT,
  fx_rate_to_jpy  NUMERIC(12,6),
  market_closed   BOOLEAN DEFAULT FALSE,
  source          TEXT,
  fetched_at      TIMESTAMPTZ,
  UNIQUE(symbol, price_date)
)

-- Performance index (computed daily, for charts)
portfolio_snapshots (
  id              UUID PRIMARY KEY,
  portfolio_id    UUID REFERENCES portfolios,
  snapshot_date   DATE,
  total_value_jpy BIGINT,
  cash_jpy        BIGINT,
  positions_value_jpy BIGINT,
  benchmark_value NUMERIC(18,6), -- e.g. Nikkei or S&P500 index level
  created_at      TIMESTAMPTZ,
  UNIQUE(portfolio_id, snapshot_date)
)
```

---

## Recommended Project Structure

```
invest-simulator/
├── app/
│   ├── api/
│   │   └── cron/
│   │       └── daily-run/
│   │           └── route.ts       # Vercel cron entry point
│   ├── (auth)/
│   │   └── login/
│   │       └── page.tsx           # Password gate form
│   ├── dashboard/
│   │   └── page.tsx               # Portfolio overview (Server Component)
│   ├── positions/
│   │   └── page.tsx               # Holdings table
│   ├── trades/
│   │   └── page.tsx               # Trade timeline + reasoning
│   ├── metrics/
│   │   └── page.tsx               # Sharpe, drawdown, win rate
│   ├── layout.tsx
│   └── globals.css
├── lib/
│   ├── market/
│   │   ├── fetcher.ts             # Orchestrates all data sources
│   │   ├── sources/
│   │   │   ├── alpha-vantage.ts   # US price + fundamentals
│   │   │   ├── finnhub.ts         # News, alternate fundamentals
│   │   │   └── stooq.ts           # JP price fallback
│   │   └── types.ts               # MarketData, NewsItem, Fundamental
│   ├── agent/
│   │   ├── trading-agent.ts       # Claude Agent SDK query() runner
│   │   ├── context-builder.ts     # Assembles system prompt context
│   │   ├── tools.ts               # Tool definitions and handlers
│   │   └── decision-persister.ts  # Saves transcript + summary to DB
│   ├── executor/
│   │   └── trade-executor.ts      # Validates + applies virtual trade
│   ├── db/
│   │   ├── client.ts              # Prisma client singleton
│   │   └── queries/               # Domain-specific query helpers
│   │       ├── portfolio.ts
│   │       ├── positions.ts
│   │       ├── trades.ts
│   │       └── decisions.ts
│   └── auth/
│       └── session.ts             # Cookie-based simple auth helpers
├── middleware.ts                  # Auth guard on all non-login routes
├── prisma/
│   ├── schema.prisma
│   └── migrations/
└── vercel.json                    # Cron schedule definition
```

---

## Architectural Patterns

### Pattern 1: Cron-Triggered API Route (not Server Action)

**What:** The daily agent run lives in `app/api/cron/daily-run/route.ts` as a standard Route Handler (GET).

**Why Route Handler, not Server Action:** Vercel cron invokes an HTTP GET to a URL. Server Actions require a POST from a React component — they cannot be triggered by an external HTTP GET. Route Handlers are the correct primitive for externally-callable endpoints.

**Vercel config:**

```json
// vercel.json
{
  "crons": [{
    "path": "/api/cron/daily-run",
    "schedule": "0 9 * * 1-5"
  }]
}
```

**Security:** Check `Authorization: Bearer $CRON_SECRET` at the top of the handler. Vercel sends this header automatically.

### Pattern 2: Tool-Based Claude Agent (not raw messages API)

**What:** Use `@anthropic-ai/claude-agent-sdk` `query()` instead of the Anthropic Client SDK messages loop.

**Why:** The Agent SDK manages the tool-use loop automatically. Custom domain tools are registered as callbacks. The SDK handles the back-and-forth with Claude until it stops. This removes ~100 lines of boilerplate tool-loop code.

**Trade-off:** The Agent SDK is newer and adds a dependency, but it is now the officially recommended path for production agents (Claude code.ai docs, April 2026).

### Pattern 3: Server Components for Dashboard (no dedicated API layer)

**What:** Dashboard pages are Next.js Server Components that call Prisma directly. No `/api/` routes for dashboard data.

**Why:** This is a single-user app. Server Components eliminate the round-trip. Type safety is end-to-end without a REST contract. The dashboard is read-only so there are no mutation concerns.

**Trade-off:** Tight coupling between UI and DB. Acceptable for a personal tool; would need an API layer if multi-user or mobile client were added.

### Pattern 4: Idempotent Cron with Run-Date Guard

**What:** Before executing the agent pipeline, check if a `decisions` row for `run_date = today` already exists. If yes, return early.

**Why:** Vercel cron can deliver the same event twice (documented behavior). Without a guard, duplicate runs would double-execute trades.

```typescript
// app/api/cron/daily-run/route.ts
const existing = await prisma.decision.findFirst({ where: { run_date: today } });
if (existing) return Response.json({ skipped: true, reason: 'already_ran_today' });
```

---

## Build Order / Dependencies

```
Phase 1: Foundation
  DB schema + Prisma client (prisma/schema.prisma → lib/db/client.ts)
  Auth middleware (middleware.ts → lib/auth/session.ts)
  Minimal dashboard layout (app/layout.tsx, app/(auth)/login/)

Phase 2: Market Data
  lib/market/sources/ (one API at a time, US first)
  lib/market/fetcher.ts
  price_snapshots write path verified

Phase 3: Agent Pipeline
  lib/agent/tools.ts  ← depends on: market fetcher, DB queries
  lib/agent/context-builder.ts  ← depends on: DB queries (positions, portfolio)
  lib/executor/trade-executor.ts  ← depends on: DB (price_snapshots, trades, positions)
  lib/agent/trading-agent.ts  ← depends on: tools, executor
  lib/agent/decision-persister.ts  ← depends on: DB (decisions)
  app/api/cron/daily-run/route.ts  ← depends on: all of above

Phase 4: Dashboard
  lib/db/queries/  ← depends on: Phase 1 schema
  app/dashboard/page.tsx
  app/positions/page.tsx
  app/trades/page.tsx  ← decisions + reasoning readable here
  app/metrics/page.tsx

Phase 5: Deployment
  vercel.json cron config
  CRON_SECRET, ANTHROPIC_API_KEY, DATABASE_URL env vars on Vercel
  Verify cron fires on first weekday after deploy
```

**Critical dependency:** TradeExecutor depends on `price_snapshots` being written by MarketFetcher before the agent loop starts. The cron route must run fetcher → agent in strict sequence (not parallel).

---

## Anti-Patterns

### Anti-Pattern 1: SQLite on Vercel

**What people do:** Use SQLite because it is simple and zero-config.

**Why it is wrong:** Vercel serverless functions have ephemeral, non-shared storage. SQLite writes will be lost between invocations. The cron run would write trades to a SQLite file that the dashboard function never sees.

**Do this instead:** Neon Postgres (free tier: 0.5 GB, 191.9 compute hours/month — sufficient for this workload). Use `@neondatabase/serverless` driver for HTTP/WebSocket-based connection from Vercel functions. Integrate via Vercel Marketplace.

### Anti-Pattern 2: Calling External APIs Inside Place_Order Tool

**What people do:** Have the `place_order` tool fetch a live price from the market API at execution time.

**Why it is wrong:** This creates an implicit dependency between the trade executor and external APIs. External APIs have rate limits, latency, and can fail. It also means the "executed price" differs from the price Claude was shown in context, creating confusing audit trails.

**Do this instead:** MarketFetcher pre-fetches and caches all prices in `price_snapshots` before the agent runs. TradeExecutor reads from `price_snapshots` only — no external calls.

### Anti-Pattern 3: Streaming Agent Transcript to Response

**What people do:** Return the agent's streaming output directly in the HTTP response from the cron route.

**Why it is wrong:** If the agent run takes 60–180 seconds, Vercel's function timeout (300s default with Fluid Compute on free tier is 10s; Pro gets 300s) can kill the response before the agent finishes.

**Do this instead:** The cron route responds `{ accepted: true }` immediately after the pipeline starts, and the agent pipeline runs to completion writing to Neon. Alternatively on Hobby plan, minimize agent round-trips and use `maxDuration` in the route config. Note: Hobby Vercel only allows 1 cron per day which matches the requirement.

### Anti-Pattern 4: Storing Reasoning in a Separate Calls Table

**What people do:** Create a separate `agent_thoughts` table and try to parse structured thoughts from the stream.

**Why it is wrong:** Claude's reasoning in the Agent SDK comes as a continuous transcript of message types. Parsing it into structured rows is fragile and loses fidelity.

**Do this instead:** Store the full transcript as JSONB in `decisions.transcript`. The dashboard renders it as a readable timeline. This preserves full fidelity with zero parsing fragility.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Alpha Vantage | REST + API key, 25 req/day free | US stocks price + fundamentals; cache fundamentals 7 days |
| Finnhub | REST + API key, 60 req/min free | News headlines; good free tier |
| Stooq | HTTP CSV (no API key) | JP stock prices; unofficial but reliable fallback |
| Claude Agent SDK | `@anthropic-ai/claude-agent-sdk` npm | ANTHROPIC_API_KEY in env |
| Neon Postgres | `@neondatabase/serverless` + Prisma | DATABASE_URL in env; use serverless driver for Vercel |
| Vercel Cron | `vercel.json` + CRON_SECRET env | Triggers GET to `/api/cron/daily-run` |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| CronRoute → MarketFetcher | Direct function call | Sequential, not parallel |
| CronRoute → AgentRunner | Direct function call | Returns after full loop completes |
| AgentRunner → TradeExecutor | Via tool handler callback | place_order tool calls executor synchronously |
| Dashboard → DB | Prisma client (Server Component) | Read-only; no API layer |
| Middleware → Auth | Next.js cookies | Cookie set on /login POST; checked on all other routes |

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1 user (current) | Monolith fine; single Neon free tier DB; Hobby Vercel plan |
| Multi-user / friends | Add portfolios per user, simple auth upgrade (NextAuth), Vercel Pro for sub-minute crons |
| High-frequency or multi-portfolio | Extract agent pipeline to separate worker (Inngest or Railway cron); keep Next.js for dashboard only |

---

## Sources

- [Claude Agent SDK Overview (official)](https://code.claude.com/docs/en/agent-sdk/overview) — HIGH confidence
- [Vercel Cron Jobs (official)](https://vercel.com/docs/cron-jobs) — HIGH confidence
- [Vercel Managing Cron Jobs (official)](https://vercel.com/docs/cron-jobs/manage-cron-jobs) — HIGH confidence
- [Vercel Fluid Compute duration limits](https://vercel.com/changelog/higher-defaults-and-limits-for-vercel-functions-running-fluid-compute) — HIGH confidence
- [SQLite not compatible with Vercel (official KB)](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel) — HIGH confidence
- [Neon Postgres + Vercel integration](https://vercel.com/marketplace/neon) — HIGH confidence
- [Next.js Server Actions vs Route Handlers](https://makerkit.dev/blog/tutorials/server-actions-vs-route-handlers) — MEDIUM confidence
- Slippage modeling: QuantConnect docs + IBKR campus — MEDIUM confidence (used to inform the decision to skip slippage in MVP)

---

*Architecture research for: AI virtual stock trading simulator (Next.js + Claude Agent SDK + Neon Postgres + Vercel)*
*Researched: 2026-04-11*
