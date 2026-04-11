# Feature Research

**Domain:** AI-driven paper trading simulator with reasoning observability
**Researched:** 2026-04-11
**Confidence:** MEDIUM-HIGH

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features without which the product fails its core promise: "reading Claude's reasoning to learn investment thinking."

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Daily trade execution log | Without this, reasoning has no context | LOW | Must store: symbol, direction, quantity, price, timestamp |
| Claude reasoning display (per trade) | THE core value proposition — missing = product is just a number dashboard | MEDIUM | Store full prompt + response; display formatted markdown |
| Portfolio value chart over time | Users expect to see if virtual ¥10M is growing or shrinking | MEDIUM | Needs daily snapshots; line chart with x=date, y=¥ value |
| Benchmark comparison overlay | Without SPY/TOPIX comparison, portfolio chart is meaningless | MEDIUM | Needs benchmark price fetch on same schedule as trades |
| Current positions list | Table stakes for any trading tool — what's held, at what cost basis | LOW | Symbol, quantity, avg cost, current price, unrealized P&L, % weight |
| Cash balance display | Users need to know how much uninvested capital remains | LOW | Part of portfolio summary; ¥10M - deployed capital |
| Trade history timeline | Shows decision sequence — prerequisite for reading reasoning in order | LOW | Date, symbol, buy/sell, price, shares, $ amount |
| Performance summary metrics | Sharpe ratio, max drawdown, total return — expected by anyone tracking a strategy | MEDIUM | See metrics section below |
| Password protection | Cloud-deployed, personal data — any public URL without auth is unacceptable | LOW | Simple env-var password via middleware; not full Auth.js |

### Differentiators (What Makes This a Learning Tool, Not Backtesting)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Reasoning panel expanded by default | Forces engagement with Claude's thinking, not just P&L | LOW | Reasoning should be primary content, not collapsed accordion |
| Per-trade prompt transparency | Show what data Claude received (price, news headlines, current portfolio) — makes reasoning reproducible | MEDIUM | Store input context alongside response; display in collapsible section |
| "Why this decision?" narrative | Claude explains reasoning in plain language before numbers | LOW | Part of prompt design — ask Claude to lead with narrative rationale |
| Reasoning search / filter | Find all trades where Claude mentioned "earnings" or "macro risk" | MEDIUM | Full-text search over stored reasoning logs |
| Confidence level per trade | Claude self-reports conviction level (high/medium/low) — teaches position sizing thinking | LOW | Part of prompt design — structured output field |
| Market context snapshot per trade | What macro/news context existed at decision time — prevents hindsight bias when reviewing | MEDIUM | Store news headlines used as input alongside reasoning |
| Decision timeline (chronological reasoning log) | Reading decisions in sequence reveals how Claude's thesis evolves | LOW | Simple reverse-chronological list view; filter by symbol or date range |
| Thesis tracking per position | "Why was this position opened / why was it held / why was it sold?" — narrative arc per holding | HIGH | Requires linking multiple reasoning entries per symbol; complex but high learning value |

### Anti-Features (Do Not Build)

Features that seem logical but undermine the learning goal, add complexity, or violate project constraints.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Real-time price streaming | "More data = better decisions" | 1-day-old data is sufficient for daily cycle; streaming adds WebSocket complexity and API costs with zero learning benefit | Batch price fetch once per day during trade execution |
| Short selling / leverage | "Realistic trading" | Violates explicit project scope; adds margin/interest calculation complexity; obscures reasoning focus | Long-only, cash-only; document the constraint in the UI |
| Intraday / hourly trade cycles | "Faster feedback loop" | Multiplies API cost (price data + Claude tokens) by 8x; no observability benefit over daily | Daily cycle; review reasoning each morning |
| Backtesting engine (historical simulation) | "Test the strategy on past data" | Survivorship bias trap; Claude cannot backtest its own current reasoning; adds weeks of complexity | Forward paper trading only — real forward data from day 1 |
| Strategy parameterization UI | "Let me tune the AI's risk tolerance" | Turns this into a strategy optimizer, not a reasoning observer; premature abstraction | Adjust via prompt engineering in code; document rationale in comments |
| Multi-user / social features | "Share with friends" | Disproportionate infrastructure cost; auth complexity; not the use case | Self-hosted single user; password gate is sufficient |
| Mobile native app | "Check on the go" | Web dashboard is accessible from mobile browser; native adds build complexity | Responsive web UI is sufficient |
| Options / futures / crypto | "More asset classes" | Adds instrument complexity (expiry, strike, contract size) that obscures core reasoning observation | US stocks + Japan stocks only as defined in PROJECT.md |
| Alert / notification system | "Tell me when Claude makes a trade" | The daily cycle is known (scheduled); push notifications add infrastructure; check dashboard at convenience | Daily scheduled job with simple email log (future v2) |
| Automated strategy switching | "If Claude performs badly, switch strategies" | Defeats the purpose of observing one consistent agent over time; comparisons require controlled conditions | Run single Claude agent with stable prompt; review and update prompt manually |
| Risk of Ruin / Kelly Criterion calculator | "Optimize position sizing" | Optimization-focused features shift focus from observation to performance-chasing | Display fixed position size rules Claude was given; let Claude reason about sizing in its own text |

---

## Feature Dependencies

```
[Password Gate]
    └──required by──> [Dashboard Access]
                          └──required by──> All other features

[Daily Trade Execution (Claude Agent)]
    └──produces──> [Trade Log Entry]
                      └──contains──> [Reasoning Text]
                      └──contains──> [Market Context Snapshot]
                      └──updates──> [Portfolio State]

[Portfolio State]
    └──drives──> [Portfolio Value Chart]
    └──drives──> [Current Positions List]
    └──drives──> [Cash Balance Display]
    └──drives──> [Performance Metrics]

[Benchmark Price Fetch]
    └──required by──> [Benchmark Comparison Overlay]
    └──runs on──> same schedule as [Daily Trade Execution]

[Trade Log Entry]
    └──displayed in──> [Trade History Timeline]
    └──displayed in──> [Decision Timeline]

[Reasoning Text] ──enhances──> [Trade History Timeline]
[Market Context Snapshot] ──enhances──> [Reasoning Text] (prevents hindsight)

[Performance Metrics] ──depends on──> [Portfolio Value Chart] (same daily snapshot data)
```

### Dependency Notes

- **Password Gate requires nothing external** — simple middleware check against env var; implement first
- **Daily Agent Execution is the data source for everything** — no agent = no data = empty dashboard; this is Phase 1 critical path
- **Benchmark fetch runs alongside trade execution** — same cron job, fetch SPY + TOPIX closes
- **Reasoning search requires reasoning to be stored as searchable text** — plain text or JSON field in DB, not binary blob
- **Thesis tracking per position** (differentiator) requires linking multiple trade log entries by symbol — add only after basic timeline works

---

## MVP Definition

### Launch With (v1) — The Observability Promise

Minimum needed to fulfill "reading Claude's daily reasoning to learn investment thinking."

- [ ] Daily Claude agent execution with tool use (price + news + current portfolio as inputs)
- [ ] Trade log entry persistence: symbol, direction, quantity, price, timestamp, reasoning text, market context
- [ ] Reasoning display per trade (full Claude response, formatted markdown, visible by default)
- [ ] Portfolio value chart (daily snapshots, line chart)
- [ ] Benchmark overlay (SPY for US, TOPIX for JP)
- [ ] Current positions list (symbol, qty, avg cost, current price, unrealized P&L, weight %)
- [ ] Cash balance display
- [ ] Trade history timeline (reverse-chronological, reasoning expandable)
- [ ] Performance metrics summary: total return %, Sharpe ratio, max drawdown, win rate, # trades
- [ ] Password protection (middleware, single password from env var)

### Add After Validation (v1.x) — Depth of Learning

Add once v1 is running and the reasoning log has accumulated meaningful data (2–4 weeks).

- [ ] Reasoning full-text search — trigger: "I want to find the trade where Claude mentioned X"
- [ ] Confidence level per trade — trigger: add structured output field to Claude prompt
- [ ] Per-trade prompt transparency panel — trigger: need to debug or understand an unusual decision
- [ ] Filter timeline by symbol or date range — trigger: position tracking across multiple buys of same stock

### Future Consideration (v2+) — Advanced Learning Features

Defer until v1 has proven its value and usage patterns are known.

- [ ] Thesis tracking per position (narrative arc per holding) — high complexity, high value
- [ ] Export reasoning log as markdown/PDF — for personal notes and review
- [ ] Email/webhook daily summary — lightweight "what happened today" notification
- [ ] Annotation layer — let user add notes to Claude's reasoning ("I disagree because...")

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Claude reasoning display (per trade) | HIGH | MEDIUM | P1 |
| Daily agent execution | HIGH | HIGH | P1 |
| Trade log persistence | HIGH | LOW | P1 |
| Portfolio value chart | HIGH | MEDIUM | P1 |
| Password protection | HIGH (security) | LOW | P1 |
| Current positions list | HIGH | LOW | P1 |
| Performance metrics (Sharpe, MDD, WR) | MEDIUM | MEDIUM | P1 |
| Benchmark comparison overlay | MEDIUM | MEDIUM | P1 |
| Trade history timeline | MEDIUM | LOW | P1 |
| Market context snapshot per trade | HIGH (learning) | LOW | P1 (store at ingestion time) |
| Reasoning full-text search | MEDIUM | MEDIUM | P2 |
| Per-trade prompt transparency panel | MEDIUM | LOW | P2 |
| Confidence level per trade | MEDIUM | LOW | P2 (prompt change only) |
| Thesis tracking per position | HIGH (learning) | HIGH | P3 |
| Email daily summary | LOW | MEDIUM | P3 |
| Annotation layer | MEDIUM | HIGH | P3 |

---

## Performance Metrics — Table Stakes Detail

Based on industry standards for trading strategy evaluation:

| Metric | Formula / Definition | Why Table Stakes | Display Recommendation |
|--------|---------------------|-----------------|------------------------|
| Total Return % | (current value - initial) / initial * 100 | Most basic measure — is the strategy up or down? | Large number, top of dashboard |
| Benchmark Relative Return | Total Return % - SPY/TOPIX return % for same period | Without this, total return is meaningless | Show as "+X% vs SPY" inline |
| Sharpe Ratio | (portfolio return - risk-free rate) / std dev of daily returns | Risk-adjusted return — is it luck or skill? | Show annualized; tooltip explains formula |
| Max Drawdown | Largest peak-to-trough decline in portfolio value | Worst-case scenario — how bad did it get? | Show as % and absolute ¥ amount |
| Win Rate | # winning trades / total trades | Basic strategy health indicator | Show alongside trade count: "12/20 (60%)" |
| Profit Factor | Gross profit / gross loss | Win rate alone is misleading; profit factor shows if wins are bigger than losses | P2 — add after core metrics work |
| Number of Trades | Total count of executed trades | Context for all other metrics | Simple integer |

---

## Competitor Feature Analysis

| Feature | TradingView Paper Trading | TradesViz | TradingAgents (open source) | Our Approach |
|---------|--------------------------|-----------|------------------------------|--------------|
| Reasoning log | None (no AI) | AI suggestions (post-hoc) | Full ReAct reasoning trace | Primary UI element, shown by default |
| Prompt transparency | N/A | N/A | Shown in debug mode | Store prompt inputs; expose in expandable panel |
| Portfolio chart | Yes, real-time | Yes, equity curve | Research output only | Daily snapshots, line chart with benchmark |
| Benchmark comparison | Yes | Yes (any symbol) | N/A | SPY + TOPIX overlays |
| Performance metrics | Basic (P&L, % return) | 100+ metrics | Returns focused | 5–7 essential metrics; avoid metric overload |
| Trade history | Yes, tabular | Yes, advanced filtering | Logged to CLI | Timeline with reasoning inline |
| Position list | Yes | Yes | N/A | Symbol, weight, P&L |
| Auth | Broker account | Account | None | Single password env var |
| Complexity | High (full trading platform) | High (100+ metrics) | High (multi-agent, research tool) | Minimal — observability first |

---

## Sources

- [TradingView Paper Trading — main functionality](https://www.tradingview.com/support/solutions/43000516466-paper-trading-main-functionality/)
- [TradesViz: Feature-filled Free Online Trading Journal](https://www.tradesviz.com/)
- [TradingAgents: Multi-Agents LLM Financial Trading Framework](https://github.com/TauricResearch/TradingAgents)
- [Top 5 Metrics for Evaluating Trading Strategies — Lux Algo](https://www.luxalgo.com/blog/top-5-metrics-for-evaluating-trading-strategies/)
- [Explainable AI UI Design (XAI) — Eleken](https://www.eleken.co/blog-posts/explainable-ai-ui-design-xai)
- [Anthropic — The "think" tool: Enabling Claude to stop and think](https://www.anthropic.com/engineering/claude-think-tool)
- [How to Design a User-Friendly Portfolio Management Dashboard — Medium/Extej](https://medium.com/@extej/how-to-design-a-user-friendly-interface-for-a-portfolio-management-dashboard-5bb3f7c14465)
- [Best Paper Trading Apps 2026 — StockBrokers.com](https://www.stockbrokers.com/guides/paper-trading)

---
*Feature research for: AI-driven virtual stock trading simulator — reasoning observability*
*Researched: 2026-04-11*
