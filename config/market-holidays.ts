// NYSE 2026 holiday calendar [CITED: https://www.nyse.com/markets/hours-calendars]
// Early-close days (Nov 27 / Dec 24) are NOT listed here — market is open, half day.
export const US_HOLIDAYS_2026: readonly string[] = [
  '2026-01-01', // New Year's Day
  '2026-01-19', // MLK Jr. Day
  '2026-02-16', // Presidents' Day
  '2026-04-03', // Good Friday
  '2026-05-25', // Memorial Day
  '2026-06-19', // Juneteenth
  '2026-07-03', // Independence Day observed (Jul 4 = Sat)
  '2026-09-07', // Labor Day
  '2026-11-26', // Thanksgiving
  '2026-12-25', // Christmas
] as const

// JPX (TSE) 2026 holiday calendar [CITED: https://www.jpx.co.jp/english/corporate/about-jpx/calendar/]
export const JP_HOLIDAYS_2026: readonly string[] = [
  '2026-01-01', // New Year's Day
  '2026-01-02', // New Year holiday
  '2026-01-03', // New Year holiday
  '2026-01-12', // Coming of Age Day
  '2026-02-11', // National Foundation Day
  '2026-02-23', // Emperor's Birthday
  '2026-03-20', // Vernal Equinox Day
  '2026-04-29', // Showa Day
  '2026-05-04', // Greenery Day
  '2026-05-05', // Children's Day
  '2026-05-06', // Constitution Memorial Day (observed)
  '2026-07-20', // Marine Day
  '2026-08-11', // Mountain Day
  '2026-09-21', // Respect for the Aged Day
  '2026-09-22', // Autumnal Equinox Day
  '2026-10-12', // Sports Day
  '2026-11-03', // Culture Day
  '2026-11-23', // Labor Thanksgiving Day
  '2026-12-31', // Year-end (JPX closed)
] as const

export function isMarketHoliday(market: 'US' | 'JP', isoDate: string): boolean {
  const list = market === 'US' ? US_HOLIDAYS_2026 : JP_HOLIDAYS_2026
  return list.includes(isoDate)
}
