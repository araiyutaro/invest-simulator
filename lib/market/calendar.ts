import 'server-only'
import { formatInTimeZone } from 'date-fns-tz'
import { subDays } from 'date-fns'
import { isMarketHoliday } from '@/config/market-holidays'
import type { Market } from './types'

const TZ: Record<Market, string> = {
  US: 'America/New_York',
  JP: 'Asia/Tokyo',
}

const CUTOFF_HOUR: Record<Market, number> = { US: 16, JP: 15 }
const CUTOFF_MIN: Record<Market, number> = { US: 30, JP: 0 }

/**
 * Checks if an ISO date string (YYYY-MM-DD) falls on a weekend.
 * Constructs date at UTC midnight to avoid timezone drift.
 */
export function isWeekendIso(isoDate: string): boolean {
  const d = new Date(`${isoDate}T00:00:00Z`)
  const dow = d.getUTCDay()
  return dow === 0 || dow === 6
}

/**
 * Returns true if the given market is closed on the given ISO date.
 * Checks weekends first, then market-specific holidays.
 */
export function isMarketClosed(market: Market, isoDate: string): boolean {
  if (isWeekendIso(isoDate)) return true
  if (isMarketHoliday(market, isoDate)) return true
  return false
}

/**
 * Returns the most recent settled trading day for `market` as YYYY-MM-DD.
 *
 * D-19 cutoff rule: if `now` is before market close on its local calendar day,
 * that day is "not yet settled" and we walk back to the previous business day.
 *
 * US close = 16:30 America/New_York
 * JP close = 15:00 Asia/Tokyo
 */
export function lastBusinessDay(market: Market, now: Date = new Date()): string {
  const tz = TZ[market]
  const localIso = formatInTimeZone(now, tz, 'yyyy-MM-dd')
  const localHour = Number(formatInTimeZone(now, tz, 'H'))
  const localMin = Number(formatInTimeZone(now, tz, 'm'))

  const cutoffHour = CUTOFF_HOUR[market]
  const cutoffMin = CUTOFF_MIN[market]
  const afterCutoff =
    localHour > cutoffHour ||
    (localHour === cutoffHour && localMin >= cutoffMin)

  // Start candidate: today if cutoff reached, else yesterday
  let candidate = afterCutoff ? localIso : isoMinusDays(localIso, 1)

  // Walk back through weekends and holidays
  while (isMarketClosed(market, candidate)) {
    candidate = isoMinusDays(candidate, 1)
  }

  return candidate
}

/**
 * Returns an array of business days for the given market.
 *
 * - `incremental`: returns a single-element array with the last business day
 * - `backfill`: returns `daysBack` most recent business days ending at lastBusinessDay,
 *   ordered chronologically (oldest first)
 */
export function resolveTargetDate(
  market: Market,
  mode: 'incremental' | 'backfill',
  daysBack = 1,
  now: Date = new Date(),
): readonly string[] {
  const end = lastBusinessDay(market, now)

  if (mode === 'incremental') return [end]

  const out: string[] = []
  let cursor = end
  while (out.length < daysBack) {
    if (!isMarketClosed(market, cursor)) {
      out.push(cursor)
    }
    cursor = isoMinusDays(cursor, 1)
  }

  return out.reverse()
}

/**
 * Subtracts n days from an ISO date string, returning a new ISO date string.
 * Uses UTC to avoid DST issues.
 */
function isoMinusDays(isoDate: string, n: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  const out = subDays(d, n)
  return out.toISOString().slice(0, 10)
}
