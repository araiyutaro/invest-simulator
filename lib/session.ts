import 'server-only'
import { env } from './env'

export type SessionData = {
  isAuthenticated: boolean
}

export const sessionOptions = {
  password: env.SESSION_SECRET,
  cookieName: 'invest-sim-session',
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30, // D-13: 30 days
    sameSite: 'lax' as const,
    path: '/',
  },
}

export const defaultSession: SessionData = {
  isAuthenticated: false,
}
