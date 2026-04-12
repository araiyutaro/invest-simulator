import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { env } from '@/lib/env'
import { fetchMarketData } from '@/lib/market/orchestrator'

// Per D-21 — route checks header; proxy.ts already bypasses /api/cron/*.
// Vercel Hobby function timeout is 60s (PITFALLS #3). This route runs
// incremental mode (~30 API calls, ~30-40s). Backfill must use the CLI.
export const maxDuration = 60

function unauthorized(reason: string) {
  return NextResponse.json({ error: 'unauthorized', reason }, { status: 401 })
}

export async function POST(request: NextRequest) {
  const header = request.headers.get('authorization') ?? ''
  const expected = `Bearer ${env.CRON_SECRET}`

  if (header !== expected) {
    return unauthorized('bad or missing authorization header')
  }

  try {
    const summary = await fetchMarketData({ mode: 'incremental' })
    return NextResponse.json(summary, { status: 200 })
  } catch (e) {
    const msg = (e as Error).message
    console.error('[cron/fetch-market-data] fatal:', msg)
    return NextResponse.json({ error: 'internal', message: msg }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 })
}
