import { cookies } from 'next/headers'
import { getIronSession } from 'iron-session'
import { sessionOptions, type SessionData } from '@/lib/session'

export async function POST(request: Request) {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  session.destroy()
  // 303 See Other: correct status for redirecting after a POST form submission.
  // DashboardHeader uses a native HTML form so the browser must follow a redirect.
  return Response.redirect(new URL('/login', request.url), 303)
}
