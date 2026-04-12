// Drizzle schema for invest-simulator (Phase 01-01)
// Source patterns verified: orm.drizzle.team/docs/column-types/pg 2026-04-11
// Decisions enforced: D-01 (JSONB transcript), D-02 (numeric 18,4), D-03 (asset_class),
//                     D-04 ((portfolio_id, run_date) UNIQUE), D-06 (trades.decision_id FK)

import {
  pgTable,
  uuid,
  numeric,
  jsonb,
  text,
  date,
  timestamp,
  boolean,
  integer,
  bigint,
  unique,
} from 'drizzle-orm/pg-core'

// ----------------------------------------------------------------------------
// JSONB Typed Payloads
// ----------------------------------------------------------------------------

/**
 * Full Gemini / AI agent transcript saved to `decisions.transcript` (D-01).
 *
 * Intentionally loose on raw_messages so future model migrations (e.g. Claude,
 * GPT) can reuse the same column without schema churn. Strict typing is left
 * to the Phase 03 agent pipeline that writes this payload.
 */
export type DecisionTranscript = {
  system_prompt: string
  user_prompt?: string
  raw_messages: Array<{
    role: 'user' | 'model' | 'system' | 'tool'
    content: unknown
  }>
  input_data_snapshot: {
    as_of: string // ISO timestamp
    universe: string[] // tickers the agent saw
    prices: Record<string, unknown>
    portfolio: unknown
  }
  tool_calls?: Array<{
    name: string
    args: unknown
    result?: unknown
  }>
  usage?: {
    input_tokens?: number
    output_tokens?: number
    total_tokens?: number
  }
}

// ----------------------------------------------------------------------------
// portfolios
// ----------------------------------------------------------------------------

export const portfolios = pgTable('portfolios', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  baseCurrency: text('base_currency').notNull().default('JPY'),
  initialCash: numeric('initial_cash', { precision: 18, scale: 4 }).notNull(),
  cash: numeric('cash', { precision: 18, scale: 4 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ----------------------------------------------------------------------------
// positions
// ----------------------------------------------------------------------------

export const positions = pgTable(
  'positions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    portfolioId: uuid('portfolio_id')
      .notNull()
      .references(() => portfolios.id),
    symbol: text('symbol').notNull(),
    exchange: text('exchange').notNull(),
    quantity: integer('quantity').notNull().default(0),
    avgCost: numeric('avg_cost', { precision: 18, scale: 4 }).notNull(),
    currency: text('currency').notNull(),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.portfolioId, t.symbol)]
)

// ----------------------------------------------------------------------------
// decisions  (defined BEFORE trades so trades can forward-reference via FK)
// ----------------------------------------------------------------------------

export const decisions = pgTable(
  'decisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    portfolioId: uuid('portfolio_id')
      .notNull()
      .references(() => portfolios.id),
    runDate: date('run_date').notNull(),
    summary: text('summary'),
    transcript: jsonb('transcript').$type<DecisionTranscript>().notNull(),
    tokenCostEstimate: numeric('token_cost_estimate', { precision: 18, scale: 4 }),
    confidence: text('confidence'),
    modelUsed: text('model_used'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.portfolioId, t.runDate)] // D-04: 冪等性
)

// ----------------------------------------------------------------------------
// trades  (D-06: decision_id FK -> decisions.id)
// ----------------------------------------------------------------------------

export const trades = pgTable('trades', {
  id: uuid('id').primaryKey().defaultRandom(),
  portfolioId: uuid('portfolio_id')
    .notNull()
    .references(() => portfolios.id),
  decisionId: uuid('decision_id')
    .notNull()
    .references(() => decisions.id), // D-06
  symbol: text('symbol').notNull(),
  action: text('action').notNull(), // 'BUY' | 'SELL'
  quantity: integer('quantity').notNull(),
  executedPrice: numeric('executed_price', { precision: 18, scale: 4 }).notNull(),
  commission: numeric('commission', { precision: 18, scale: 4 }).notNull(),
  currency: text('currency').notNull(),
  fxRateToJpy: numeric('fx_rate_to_jpy', { precision: 12, scale: 6 }),
  executedAt: timestamp('executed_at', { withTimezone: true }).notNull().defaultNow(),
})

// ----------------------------------------------------------------------------
// price_snapshots
// ----------------------------------------------------------------------------

export const priceSnapshots = pgTable(
  'price_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    symbol: text('symbol').notNull(),
    priceDate: date('price_date').notNull(),
    open: numeric('open', { precision: 18, scale: 4 }),
    high: numeric('high', { precision: 18, scale: 4 }),
    low: numeric('low', { precision: 18, scale: 4 }),
    close: numeric('close', { precision: 18, scale: 4 }),
    rawClose: numeric('raw_close', { precision: 18, scale: 4 }),
    volume: bigint('volume', { mode: 'bigint' }),
    currency: text('currency').notNull(),
    fxRateToJpy: numeric('fx_rate_to_jpy', { precision: 12, scale: 6 }),
    marketClosed: boolean('market_closed').notNull().default(false),
    assetClass: text('asset_class').notNull().default('equity'), // D-03: 'equity' | 'fx'
    source: text('source').notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.symbol, t.priceDate)]
)

// ----------------------------------------------------------------------------
// news_snapshots
// ----------------------------------------------------------------------------

export const newsSnapshots = pgTable('news_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  symbol: text('symbol').notNull(),
  newsDate: date('news_date').notNull(),
  headline: text('headline').notNull(),
  url: text('url'),
  sourceDomain: text('source_domain'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  raw: jsonb('raw').notNull(),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
})

// ----------------------------------------------------------------------------
// fundamentals_snapshots
// ----------------------------------------------------------------------------

export const fundamentalsSnapshots = pgTable(
  'fundamentals_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    symbol: text('symbol').notNull(),
    asOfDate: date('as_of_date').notNull(),
    peRatio: numeric('pe_ratio', { precision: 12, scale: 4 }),
    eps: numeric('eps', { precision: 12, scale: 4 }),
    marketCap: numeric('market_cap', { precision: 24, scale: 2 }),
    week52High: numeric('week_52_high', { precision: 18, scale: 4 }),
    week52Low: numeric('week_52_low', { precision: 18, scale: 4 }),
    raw: jsonb('raw').notNull(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.symbol, t.asOfDate)]
)

// ----------------------------------------------------------------------------
// portfolio_snapshots
// ----------------------------------------------------------------------------

export const portfolioSnapshots = pgTable(
  'portfolio_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    portfolioId: uuid('portfolio_id')
      .notNull()
      .references(() => portfolios.id),
    snapshotDate: date('snapshot_date').notNull(),
    totalValueJpy: numeric('total_value_jpy', { precision: 18, scale: 4 }).notNull(),
    cashJpy: numeric('cash_jpy', { precision: 18, scale: 4 }).notNull(),
    positionsValueJpy: numeric('positions_value_jpy', { precision: 18, scale: 4 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.portfolioId, t.snapshotDate)]
)
