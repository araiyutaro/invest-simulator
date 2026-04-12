import 'server-only'
import { z } from 'zod'
import { env } from '@/lib/env'
import { getTicker } from './whitelist'
import { FinnhubError } from './errors'

const BASE = 'https://finnhub.io/api/v1'

// ---------------------------------------------------------------------------
// Zod schemas — validate raw Finnhub API responses before use
// ---------------------------------------------------------------------------

const NewsItemSchema = z.object({
  category: z.string().optional(),
  datetime: z.number(),
  headline: z.string(),
  id: z.number(),
  image: z.string().optional().default(''),
  related: z.string().optional().default(''),
  source: z.string().optional().default(''),
  summary: z.string().optional().default(''),
  url: z.string(),
})

const NewsResponseSchema = z.array(NewsItemSchema)

const BasicFinancialsSchema = z.object({
  metric: z
    .object({
      peBasicExclExtraTTM: z.number().optional(),
      epsBasicExclExtraItemsTTM: z.number().optional(),
      marketCapitalization: z.number().optional(),
      '52WeekHigh': z.number().optional(),
      '52WeekLow': z.number().optional(),
    })
    .passthrough(),
  series: z.any().optional(),
  symbol: z.string(),
})

// ---------------------------------------------------------------------------
// Public return types
// ---------------------------------------------------------------------------

export type NewsItem = {
  readonly symbol: string
  readonly headline: string
  readonly url: string
  readonly sourceDomain: string | null
  readonly publishedAt: Date
  readonly raw: unknown
}

export type Fundamentals = {
  readonly symbol: string
  readonly peRatio: string | null
  readonly eps: string | null
  readonly marketCap: string | null
  readonly week52High: string | null
  readonly week52Low: string | null
  readonly raw: unknown
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertUsTicker(symbol: string): void {
  const ticker = getTicker(symbol) // throws WhitelistViolationError if not whitelisted
  if (ticker.market !== 'US') {
    throw new FinnhubError(
      `Finnhub is US-only; ${symbol} is ${ticker.market}`,
      symbol,
    )
  }
}

function toStr(n: number | undefined): string | null {
  return typeof n === 'number' ? String(n) : null
}

// ---------------------------------------------------------------------------
// fetchCompanyNews
// ---------------------------------------------------------------------------

export async function fetchCompanyNews(
  symbol: string,
  from: string,
  to: string,
): Promise<readonly NewsItem[]> {
  assertUsTicker(symbol)

  const url = `${BASE}/company-news?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}&token=${env.FINNHUB_API_KEY}`
  const res = await fetch(url)

  if (res.status === 401) {
    throw new FinnhubError('unauthorized (bad FINNHUB_API_KEY)', symbol)
  }
  if (!res.ok) {
    throw new FinnhubError(`HTTP ${res.status}`, symbol)
  }

  const body: unknown = await res.json()
  const parsed = NewsResponseSchema.safeParse(body)

  if (!parsed.success) {
    throw new FinnhubError(
      `news parse failed: ${parsed.error.message}`,
      symbol,
    )
  }

  return parsed.data.map(
    (n): NewsItem => ({
      symbol,
      headline: n.headline,
      url: n.url,
      sourceDomain: n.source || null,
      publishedAt: new Date(n.datetime * 1000),
      raw: n,
    }),
  )
}

// ---------------------------------------------------------------------------
// fetchBasicFinancials
// ---------------------------------------------------------------------------

export async function fetchBasicFinancials(
  symbol: string,
): Promise<Fundamentals> {
  assertUsTicker(symbol)

  const url = `${BASE}/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all&token=${env.FINNHUB_API_KEY}`
  const res = await fetch(url)

  if (res.status === 401) {
    throw new FinnhubError('unauthorized (bad FINNHUB_API_KEY)', symbol)
  }
  if (!res.ok) {
    throw new FinnhubError(`HTTP ${res.status}`, symbol)
  }

  const body: unknown = await res.json()
  const parsed = BasicFinancialsSchema.safeParse(body)

  if (!parsed.success) {
    throw new FinnhubError(
      `basicFinancials parse failed: ${parsed.error.message}`,
      symbol,
    )
  }

  const m = parsed.data.metric
  return {
    symbol,
    peRatio: toStr(m.peBasicExclExtraTTM),
    eps: toStr(m.epsBasicExclExtraItemsTTM),
    marketCap: toStr(m.marketCapitalization),
    week52High: toStr(m['52WeekHigh']),
    week52Low: toStr(m['52WeekLow']),
    raw: parsed.data,
  }
}
