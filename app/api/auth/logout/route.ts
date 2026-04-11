import { cookies } from 'next/headers'
import { getIronSession } from 'iron-session'
import { sessionOptions, type SessionData } from '@/lib/session'

export async function POST() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  session.destroy()
  return Response.json({ success: true })
}
