import 'server-only'
import { findTicker } from '@/config/tickers'
import { WhitelistViolationError } from './errors'
import type { Ticker } from './types'

export function isWhitelisted(symbol: string): boolean {
  return findTicker(symbol) !== undefined
}

export function getTicker(symbol: string): Ticker {
  const t = findTicker(symbol)
  if (!t) throw new WhitelistViolationError(symbol)
  return t
}
