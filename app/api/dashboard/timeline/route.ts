// Route Handler — Plan 04-04 Task 2
// GET /api/dashboard/timeline?offset=&limit=&portfolioId=
//
// Threat mitigations:
//   T-04-06 (Spoofing): getIronSession check on every request (defense-in-depth
//     even though proxy.ts already gates /api/dashboard/*).
//   T-04-07 (Tampering): offset/limit coerced through Number() + Math.floor +
//     Math.min/max to guarantee a safe integer range. Drizzle parameterises SQL.
//   T-04-08 (Tampering): portfolioId validated against a strict UUID regex.
//   T-04-09 (Information Disclosure): catch block returns generic error only.

import { NextResponse, type NextRequest } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'

import { sessionOptions, type SessionData } from '@/lib/session'
import { getTimelineData } from '@/lib/dashboard/queries'

const UUID_RE = /^[0-9a-f-]{36}$/i

function toSafeInt(raw: string | null, fallback: number): number {
  const n = Number(raw ?? fallback)
  if (!Number.isFinite(n)) return fallback
  return Math.floor(n)
}

export async function GET(request: NextRequest) {
  const session = await getIronSession<SessionData>(
    await cookies(),
    sessionOptions
  )
  if (!session.isAuthenticated) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)

  const offset = Math.max(0, toSafeInt(searchParams.get('offset'), 0))
  const limit = Math.min(100, Math.max(1, toSafeInt(searchParams.get('limit'), 20)))

  const portfolioId = searchParams.get('portfolioId')
  if (!portfolioId || !UUID_RE.test(portfolioId)) {
    return NextResponse.json({ error: 'invalid portfolioId' }, { status: 400 })
  }

  try {
    const data = await getTimelineData(portfolioId, limit, offset)
    return NextResponse.json(data)
  } catch {
    return NextResponse.json(
      { error: 'データの読み込みに失敗しました' },
      { status: 500 }
    )
  }
}
