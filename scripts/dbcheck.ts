import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { portfolios, portfolioSnapshots, positions, trades, decisions, priceSnapshots } from '@/db/schema'

const sql = neon(process.env.DATABASE_URL!)
const db = drizzle({ client: sql })

async function main() {
  const ps = await db.select().from(portfolios)
  const snaps = await db.select().from(portfolioSnapshots)
  const pos = await db.select().from(positions)
  const tr = await db.select().from(trades)
  const dec = await db.select({ id: decisions.id, portfolioId: decisions.portfolioId, runDate: decisions.runDate, transcript: decisions.transcript }).from(decisions)
  const prices = await db.select({ symbol: priceSnapshots.symbol, priceDate: priceSnapshots.priceDate, close: priceSnapshots.close, marketClosed: priceSnapshots.marketClosed }).from(priceSnapshots)
  console.log(JSON.stringify({
    portfolios: ps,
    portfolioSnapshots: snaps,
    positionsCount: pos.length,
    tradesCount: tr.length,
    decisionsCount: dec.length,
    decisions: dec,
    priceSnapshotsCount: prices.length,
    priceSample: prices.slice(0, 20),
  }, null, 2))
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
