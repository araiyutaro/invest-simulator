// proxy.ts — Next.js 16 auth gate (renamed from middleware.ts in v16.0.0)
// Ref: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md
// The file must be named `proxy.ts` at project root and export a function named `proxy`.
import { NextResponse, type NextRequest } from 'next/server'
import { getIronSession } from 'iron-session'
import { sessionOptions, type SessionData } from '@/lib/session'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // D-14: Only /login and /api/cron/* (plus /api/auth/* to avoid redirect loop
  // on the login endpoint itself) bypass the auth gate.
  if (
    pathname === '/login' ||
    pathname.startsWith('/login/') ||
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/api/cron/')
  ) {
    return NextResponse.next()
  }

  // CRITICAL (01-RESEARCH.md Pitfall 2): inside proxy, use `request.cookies`,
  // NOT `cookies()` from `next/headers`. The latter requires an async storage
  // context that is not present in the proxy runtime.
  const session = await getIronSession<SessionData>(
    request.cookies as any,
    sessionOptions,
  )

  if (!session.isAuthenticated) {
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  // Exclude Next.js static/image optimization assets, favicon, and metadata
  // files (sitemap.xml, robots.txt). Everything else — including /api routes —
  // flows through the auth gate. (Phase 05 Plan 03, D-14 preserved)
  matcher: ['/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)'],
}
