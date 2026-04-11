import { cookies } from 'next/headers'
import { getIronSession } from 'iron-session'
import { sessionOptions, type SessionData } from '@/lib/session'
import { verifyPassword } from '@/lib/auth'

export async function POST(request: Request) {
  let body: { password?: unknown }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const password = typeof body.password === 'string' ? body.password : ''

  if (!verifyPassword(password)) {
    // D-15: 401 + 「パスワードが違います」
    return Response.json({ error: 'パスワードが違います' }, { status: 401 })
  }

  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  session.isAuthenticated = true
  await session.save()

  return Response.json({ success: true })
}
