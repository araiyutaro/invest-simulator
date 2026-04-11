import 'server-only'
import { timingSafeEqual } from 'crypto'
import { env } from './env'

export function verifyPassword(input: string): boolean {
  const inputBuf = Buffer.from(input, 'utf8')
  const passwordBuf = Buffer.from(env.SITE_PASSWORD, 'utf8')

  // timingSafeEqual throws on length mismatch. Password length is not secret.
  if (inputBuf.length !== passwordBuf.length) return false

  return timingSafeEqual(inputBuf, passwordBuf)
}
