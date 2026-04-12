// CLI script — run with `npx tsx scripts/capture-fixtures.ts`, NOT imported from app code.
//
// Captures Wave 0 offline fixtures so Wave 1+ unit tests run without network:
//   - yahoo-chart-7203-T.json        (yahoo chart() for Toyota 7203.T)
//   - finnhub-news-aapl.json         (Finnhub company-news for AAPL, fallback=hand-crafted)
//   - finnhub-basicfinancials-aapl.json (Finnhub stock/metric for AAPL, fallback=hand-crafted)
//   - stooq-7203-jp.csv              (Stooq CSV for 7203.jp, fallback=hand-crafted)
//   - stooq-error.html               (synthetic HTML error sample)
//
// All fixtures must be committable — no API keys, no PII.

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import YahooFinance from 'yahoo-finance2'

const yahooFinance = new YahooFinance()

const FIXTURE_DIR = resolve(process.cwd(), 'lib/__tests__/fixtures/market')

function fixturePath(name: string): string {
  return resolve(FIXTURE_DIR, name)
}

function writeFixture(name: string, content: string): void {
  const p = fixturePath(name)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, content, 'utf8')
  console.log(`[capture] wrote ${name} (${content.length} bytes)`)
}

// 1) yahoo JP — Toyota 7203.T. Use a recent ~3-month window that is almost
// certain to have data (today is 2026-04-12 per project clock).
async function captureYahooJp(): Promise<void> {
  try {
    const result = await yahooFinance.chart('7203.T', {
      period1: '2026-01-01',
      period2: '2026-04-10',
      interval: '1d',
    })
    writeFixture('yahoo-chart-7203-T.json', JSON.stringify(result, null, 2))
  } catch (err) {
    console.error('[capture] yahoo 7203.T failed, writing minimal hand-crafted fixture:', err)
    const hand = {
      meta: {
        currency: 'JPY',
        symbol: '7203.T',
        exchangeName: 'JPX',
        instrumentType: 'EQUITY',
        firstTradeDate: null,
        regularMarketTime: null,
        timezone: 'JST',
        exchangeTimezoneName: 'Asia/Tokyo',
        regularMarketPrice: 2650,
        chartPreviousClose: 2600,
        priceHint: 2,
        dataGranularity: '1d',
        range: '',
        validRanges: ['1d', '5d', '1mo'],
      },
      quotes: [
        { date: '2026-01-05T06:00:00.000Z', open: 2600, high: 2650, low: 2580, close: 2620, volume: 10000000, adjclose: 2620 },
        { date: '2026-01-06T06:00:00.000Z', open: 2620, high: 2680, low: 2610, close: 2670, volume: 11000000, adjclose: 2670 },
        { date: '2026-01-07T06:00:00.000Z', open: 2670, high: 2690, low: 2640, close: 2655, volume: 9500000, adjclose: 2655 },
        { date: '2026-01-08T06:00:00.000Z', open: 2655, high: 2700, low: 2650, close: 2690, volume: 10500000, adjclose: 2690 },
        { date: '2026-01-09T06:00:00.000Z', open: 2690, high: 2705, low: 2670, close: 2685, volume: 9800000, adjclose: 2685 },
      ],
      events: {},
    }
    writeFixture('yahoo-chart-7203-T.json', JSON.stringify(hand, null, 2))
  }
}

// 2) Finnhub news — use API key if present, else hand-crafted minimal payload.
async function captureFinnhubNews(): Promise<void> {
  const key = process.env.FINNHUB_API_KEY
  const fallback = [
    {
      category: 'company',
      datetime: 1712000000,
      headline: 'Apple fixture headline',
      id: 1,
      image: '',
      related: 'AAPL',
      source: 'Fixture',
      summary: 'Short summary',
      url: 'https://example.com',
    },
  ]
  if (!key) {
    writeFixture('finnhub-news-aapl.json', JSON.stringify(fallback, null, 2))
    return
  }
  try {
    const url = `https://finnhub.io/api/v1/company-news?symbol=AAPL&from=2026-04-01&to=2026-04-10&token=${key}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`finnhub news status ${res.status}`)
    const json = await res.json()
    // Sanitize: remove accidental api key echoes if any
    const text = JSON.stringify(json, null, 2)
    if (text.includes(key)) {
      throw new Error('finnhub news response contains api key — refusing to write')
    }
    writeFixture('finnhub-news-aapl.json', text)
  } catch (err) {
    console.error('[capture] finnhub news fetch failed, writing fallback:', err)
    writeFixture('finnhub-news-aapl.json', JSON.stringify(fallback, null, 2))
  }
}

// 3) Finnhub basic financials — same pattern.
async function captureFinnhubBasicFinancials(): Promise<void> {
  const key = process.env.FINNHUB_API_KEY
  const fallback = {
    metric: {
      peBasicExclExtraTTM: 28.5,
      epsBasicExclExtraItemsTTM: 6.2,
      marketCapitalization: 2800000,
      '52WeekHigh': 200.0,
      '52WeekLow': 150.0,
    },
    series: {},
    symbol: 'AAPL',
  }
  if (!key) {
    writeFixture('finnhub-basicfinancials-aapl.json', JSON.stringify(fallback, null, 2))
    return
  }
  try {
    const url = `https://finnhub.io/api/v1/stock/metric?symbol=AAPL&metric=all&token=${key}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`finnhub metric status ${res.status}`)
    const json = await res.json()
    const text = JSON.stringify(json, null, 2)
    if (text.includes(key)) {
      throw new Error('finnhub metric response contains api key — refusing to write')
    }
    writeFixture('finnhub-basicfinancials-aapl.json', text)
  } catch (err) {
    console.error('[capture] finnhub metric fetch failed, writing fallback:', err)
    writeFixture('finnhub-basicfinancials-aapl.json', JSON.stringify(fallback, null, 2))
  }
}

// 4) Stooq JP CSV — now gated behind apikey (see 02-SPIKE-RAW-CLOSE.md).
// Attempt fetch only if STOOQ_APIKEY is present. Otherwise write a hand-crafted
// valid CSV that tests can parse as the happy path.
async function captureStooqJp(): Promise<void> {
  const apikey = process.env.STOOQ_APIKEY
  const handCraftedCsv = [
    'Date,Open,High,Low,Close,Volume',
    '2026-01-05,2600.0000,2650.0000,2580.0000,2620.0000,10000000',
    '2026-01-06,2620.0000,2680.0000,2610.0000,2670.0000,11000000',
    '2026-01-07,2670.0000,2690.0000,2640.0000,2655.0000,9500000',
    '2026-01-08,2655.0000,2700.0000,2650.0000,2690.0000,10500000',
    '2026-01-09,2690.0000,2705.0000,2670.0000,2685.0000,9800000',
    '',
  ].join('\n')

  if (!apikey) {
    console.log('[capture] STOOQ_APIKEY not set — writing hand-crafted Stooq JP CSV fixture')
    writeFixture('stooq-7203-jp.csv', handCraftedCsv)
    return
  }
  try {
    const url = `https://stooq.com/q/d/l/?s=7203.jp&i=d&d1=20260101&d2=20260410&apikey=${apikey}`
    const res = await fetch(url)
    const contentType = res.headers.get('content-type') ?? ''
    const body = await res.text()
    if (
      !contentType.toLowerCase().includes('csv') &&
      !contentType.toLowerCase().includes('text/plain')
    ) {
      throw new Error(`stooq content-type unexpected: ${contentType}`)
    }
    if (body.trimStart().startsWith('<')) {
      throw new Error('stooq returned HTML')
    }
    if (body.includes('Get your apikey')) {
      throw new Error('stooq returned apikey-required message despite apikey present')
    }
    const firstLine = body.split('\n')[0]?.trim()
    if (firstLine !== 'Date,Open,High,Low,Close,Volume') {
      throw new Error(`stooq header unexpected: ${firstLine}`)
    }
    if (body.includes(apikey)) {
      throw new Error('stooq response contains api key — refusing to write')
    }
    writeFixture('stooq-7203-jp.csv', body)
  } catch (err) {
    console.error('[capture] stooq JP fetch failed, writing hand-crafted fallback:', err)
    writeFixture('stooq-7203-jp.csv', handCraftedCsv)
  }
}

// 5) Stooq error HTML — synthetic, no network call.
function captureStooqErrorHtml(): void {
  const html = '<html><head><title>Stooq</title></head><body>No data</body></html>\n'
  writeFixture('stooq-error.html', html)
}

async function main(): Promise<number> {
  mkdirSync(FIXTURE_DIR, { recursive: true })
  await captureYahooJp()
  await captureFinnhubNews()
  await captureFinnhubBasicFinancials()
  await captureStooqJp()
  captureStooqErrorHtml()
  console.log('[capture] done')
  return 0
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('[capture] unexpected error:', err)
    process.exit(1)
  })
