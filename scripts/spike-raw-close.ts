// CLI script — run with `npx tsx scripts/spike-raw-close.ts`, NOT imported from app code.
//
// Wave 0 SPIKE: resolve D-08 (raw_close semantics) by comparing yahoo-finance2
// chart() output against Stooq CSV across the AAPL 4:1 split window (2020-08-31).
//
// Side effects on success:
//   - writes lib/__tests__/fixtures/market/yahoo-chart-aapl.json
//   - writes lib/__tests__/fixtures/market/stooq-aapl-us.csv
//
// Exit codes:
//   0 — both sources returned data and comparison table printed
//   1 — either source failed (network, parse, content-type mismatch)

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import YahooFinance from 'yahoo-finance2'

// yahoo-finance2 v3 requires instantiation (was default singleton in v2).
const yahooFinance = new YahooFinance()

const SYMBOL = 'AAPL'
const PERIOD1 = '2020-08-18'
const PERIOD2 = '2020-09-12'

const FIXTURE_DIR = resolve(process.cwd(), 'lib/__tests__/fixtures/market')
const YAHOO_FIXTURE = resolve(FIXTURE_DIR, 'yahoo-chart-aapl.json')
const STOOQ_FIXTURE = resolve(FIXTURE_DIR, 'stooq-aapl-us.csv')

type YahooQuote = {
  date: Date | string
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  adjclose?: number | null
  volume: number | null
}

function iso(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toISOString().slice(0, 10)
}

async function fetchYahoo(): Promise<YahooQuote[]> {
  // yahoo-finance2 v3 chart() returns { meta, quotes, events }
  const result = await yahooFinance.chart(SYMBOL, {
    period1: PERIOD1,
    period2: PERIOD2,
    interval: '1d',
  })
  mkdirSync(dirname(YAHOO_FIXTURE), { recursive: true })
  writeFileSync(YAHOO_FIXTURE, JSON.stringify(result, null, 2), 'utf8')
  return (result.quotes ?? []) as YahooQuote[]
}

type StooqRow = {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

type StooqResult =
  | { ok: true; rows: StooqRow[] }
  | { ok: false; reason: 'apikey_required' | 'html_error' | 'other'; bodySnippet: string }

async function fetchStooq(): Promise<StooqResult> {
  const d1 = PERIOD1.replaceAll('-', '')
  const d2 = PERIOD2.replaceAll('-', '')
  const apikey = process.env.STOOQ_APIKEY
  const url = `https://stooq.com/q/d/l/?s=aapl.us&i=d&d1=${d1}&d2=${d2}${apikey ? `&apikey=${apikey}` : ''}`
  const res = await fetch(url)
  const contentType = res.headers.get('content-type') ?? ''
  const body = await res.text()

  // Capture whatever Stooq returned as a fixture side-effect for auditability
  mkdirSync(dirname(STOOQ_FIXTURE), { recursive: true })
  writeFileSync(STOOQ_FIXTURE, body, 'utf8')

  // Stooq changed its free-tier policy: CSV endpoint now returns a text/plain
  // message "Get your apikey:" when no apikey parameter is present. This is a
  // CRITICAL finding for D-12 / D-08 — Stooq is no longer a headless fallback.
  if (body.includes('Get your apikey')) {
    return { ok: false, reason: 'apikey_required', bodySnippet: body.slice(0, 200) }
  }
  if (body.trimStart().startsWith('<')) {
    return { ok: false, reason: 'html_error', bodySnippet: body.slice(0, 200) }
  }

  const lines = body.trim().split('\n')
  const header = lines[0]?.trim()
  if (header !== 'Date,Open,High,Low,Close,Volume') {
    return { ok: false, reason: 'other', bodySnippet: body.slice(0, 200) }
  }
  const rows: StooqRow[] = lines.slice(1).map((line) => {
    const [date, open, high, low, close, volume] = line.split(',')
    return {
      date,
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
      volume: Number(volume),
    }
  })
  return { ok: true, rows }
}

async function main(): Promise<number> {
  let yahooQuotes: YahooQuote[] = []
  let stooqResult: StooqResult = { ok: false, reason: 'other', bodySnippet: '' }

  try {
    yahooQuotes = await fetchYahoo()
  } catch (err) {
    console.error('[spike] yahoo fetch failed:', err)
    return 1
  }

  try {
    stooqResult = await fetchStooq()
  } catch (err) {
    console.error('[spike] stooq fetch threw unexpectedly:', err)
    stooqResult = { ok: false, reason: 'other', bodySnippet: String(err) }
  }

  const stooqRows: StooqRow[] = stooqResult.ok ? stooqResult.rows : []
  if (!stooqResult.ok) {
    console.warn(
      `[spike] Stooq unavailable (reason=${stooqResult.reason}). SPIKE continues with yahoo-only analysis.`,
    )
    console.warn('[spike] Stooq body snippet:', stooqResult.bodySnippet.replace(/\n/g, ' '))
  }

  const stooqByDate = new Map<string, StooqRow>(
    stooqRows.map((row) => [row.date, row]),
  )

  console.log('SYMBOL=' + SYMBOL)
  console.log('WINDOW=' + PERIOD1 + '..' + PERIOD2)
  console.log(
    'date       | yahoo_close | yahoo_adjclose | stooq_close | diff_pct',
  )
  console.log(
    '-----------|-------------|----------------|-------------|---------',
  )

  let maxDiffPct = 0
  let compared = 0
  for (const q of yahooQuotes) {
    const d = iso(q.date)
    const stooq = stooqByDate.get(d)
    const yc = q.close ?? Number.NaN
    const yadj = q.adjclose ?? Number.NaN
    const sc = stooq?.close ?? Number.NaN
    let diffPct = Number.NaN
    if (Number.isFinite(yc) && Number.isFinite(sc) && sc !== 0) {
      diffPct = (Math.abs(yc - sc) / sc) * 100
      if (Number.isFinite(diffPct) && diffPct > maxDiffPct) {
        maxDiffPct = diffPct
      }
      compared += 1
    }
    const fmt = (n: number) =>
      Number.isFinite(n) ? n.toFixed(4).padStart(11, ' ') : '        N/A'
    const fmtDiff = (n: number) =>
      Number.isFinite(n) ? n.toFixed(4).padStart(8, ' ') : '     N/A'
    console.log(
      `${d} | ${fmt(yc)} | ${fmt(yadj).padStart(14, ' ')} | ${fmt(sc)} | ${fmtDiff(diffPct)}`,
    )
  }

  // Detect yahoo raw vs adjusted divergence on the split date window.
  // For AAPL 4:1 split on 2020-08-31, expect close == adjclose (yahoo chart()
  // returns adjusted-only close for both fields) OR close != adjclose
  // (meaning yahoo gives raw + adjusted separately).
  let yahooCloseEqualsAdj = true
  for (const q of yahooQuotes) {
    const yc = q.close ?? Number.NaN
    const ya = q.adjclose ?? Number.NaN
    if (Number.isFinite(yc) && Number.isFinite(ya) && Math.abs(yc - ya) > 1e-4) {
      yahooCloseEqualsAdj = false
      break
    }
  }

  console.log('')
  console.log('YAHOO_ROWS=' + yahooQuotes.length)
  console.log('STOOQ_ROWS=' + stooqRows.length)
  console.log('STOOQ_OK=' + stooqResult.ok)
  if (!stooqResult.ok) {
    console.log('STOOQ_REASON=' + stooqResult.reason)
  }
  console.log('ROWS_COMPARED=' + compared)
  console.log('YAHOO_CLOSE_EQUALS_ADJCLOSE=' + yahooCloseEqualsAdj)
  console.log('MAX_DIFF_PCT=' + maxDiffPct.toFixed(6))

  if (yahooQuotes.length === 0) {
    console.error('[spike] empty yahoo result — cannot resolve D-08')
    return 1
  }
  return 0
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('[spike] unexpected error:', err)
    process.exit(1)
  })
