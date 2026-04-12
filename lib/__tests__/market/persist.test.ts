// Integration test for persist.ts — requires DATABASE_URL pointing at Neon dev DB.
// Run with: npx dotenv -e .env.local -- npx vitest run persist
//   or: export DATABASE_URL=$(grep '^DATABASE_URL=' .env.local | cut -d= -f2-) && npx vitest run persist

import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { vi } from 'vitest'

// Mock server-only so the module can be imported in test environment
vi.mock('server-only', () => ({}))

import { db } from '@/db'
import { priceSnapshots, newsSnapshots, fundamentalsSnapshots } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import {
  upsertPriceSnapshots,
  upsertNewsSnapshots,
  upsertFundamentalsSnapshots,
  writeMarketClosedRow,
} from '@/lib/market/persist'

// Use a sentinel date far in the past so tests don't collide with real data
const TEST_SYMBOL = 'AAPL' // must be whitelisted
const TEST_DATE = '1999-01-04'

async function cleanup() {
  await db.delete(priceSnapshots).where(
    and(
      eq(priceSnapshots.symbol, TEST_SYMBOL),
      eq(priceSnapshots.priceDate, TEST_DATE),
    ),
  )
  await db.delete(newsSnapshots).where(
    and(
      eq(newsSnapshots.symbol, TEST_SYMBOL),
      eq(newsSnapshots.newsDate, TEST_DATE),
    ),
  )
  await db.delete(fundamentalsSnapshots).where(
    and(
      eq(fundamentalsSnapshots.symbol, TEST_SYMBOL),
      eq(fundamentalsSnapshots.asOfDate, TEST_DATE),
    ),
  )
}

describe('persist (DATA-03, integration)', () => {
  beforeAll(cleanup)
  afterEach(cleanup)

  it('upsertPriceSnapshots is idempotent', async () => {
    const row = {
      symbol: TEST_SYMBOL,
      priceDate: TEST_DATE,
      open: '100.0',
      high: '101.0',
      low: '99.0',
      close: '100.5',
      rawClose: '100.5',
      volume: '1000000',
      currency: 'USD' as const,
      source: 'yahoo' as const,
      marketClosed: false,
      assetClass: 'equity' as const,
    }
    await upsertPriceSnapshots([row])
    await upsertPriceSnapshots([row])
    const result = await db
      .select()
      .from(priceSnapshots)
      .where(
        and(
          eq(priceSnapshots.symbol, TEST_SYMBOL),
          eq(priceSnapshots.priceDate, TEST_DATE),
        ),
      )
    expect(result.length).toBe(1)
    expect(result[0].close).toBe('100.5000')
  })

  it('writeMarketClosedRow writes null-close row with source=none', async () => {
    await writeMarketClosedRow('US', TEST_DATE, [TEST_SYMBOL])
    const result = await db
      .select()
      .from(priceSnapshots)
      .where(
        and(
          eq(priceSnapshots.symbol, TEST_SYMBOL),
          eq(priceSnapshots.priceDate, TEST_DATE),
        ),
      )
    expect(result.length).toBe(1)
    expect(result[0].marketClosed).toBe(true)
    expect(result[0].close).toBeNull()
    expect(result[0].source).toBe('none')
  })

  it('upsertFundamentalsSnapshots is idempotent', async () => {
    const f = {
      symbol: TEST_SYMBOL,
      peRatio: '28.5',
      eps: '6.2',
      marketCap: '2800000',
      week52High: '200',
      week52Low: '150',
      raw: {},
    }
    await upsertFundamentalsSnapshots([f], TEST_DATE)
    await upsertFundamentalsSnapshots([f], TEST_DATE)
    const result = await db
      .select()
      .from(fundamentalsSnapshots)
      .where(
        and(
          eq(fundamentalsSnapshots.symbol, TEST_SYMBOL),
          eq(fundamentalsSnapshots.asOfDate, TEST_DATE),
        ),
      )
    expect(result.length).toBe(1)
  })

  it('upsertNewsSnapshots appends (no unique constraint)', async () => {
    const n = {
      symbol: TEST_SYMBOL,
      headline: 'Test',
      url: 'https://example.com',
      sourceDomain: 'Test',
      publishedAt: new Date(),
      raw: {},
    }
    await upsertNewsSnapshots([n, n], TEST_DATE)
    const result = await db
      .select()
      .from(newsSnapshots)
      .where(
        and(
          eq(newsSnapshots.symbol, TEST_SYMBOL),
          eq(newsSnapshots.newsDate, TEST_DATE),
        ),
      )
    expect(result.length).toBe(2)
  })

  it('upsertPriceSnapshots returns 0 for empty array', async () => {
    const count = await upsertPriceSnapshots([])
    expect(count).toBe(0)
  })

  it('upsertNewsSnapshots returns 0 for empty array', async () => {
    const count = await upsertNewsSnapshots([], TEST_DATE)
    expect(count).toBe(0)
  })

  it('upsertFundamentalsSnapshots returns 0 for empty array', async () => {
    const count = await upsertFundamentalsSnapshots([], TEST_DATE)
    expect(count).toBe(0)
  })
})
