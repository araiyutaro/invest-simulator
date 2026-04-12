import { describe, it, expect } from 'vitest'
import {
  isMarketHoliday,
  US_HOLIDAYS_2026,
  JP_HOLIDAYS_2026,
} from '@/config/market-holidays'

describe('market holidays (D-16, D-17)', () => {
  it('US 2026-01-01 is a holiday', () => {
    expect(isMarketHoliday('US', '2026-01-01')).toBe(true)
  })

  it('US 2026-07-03 is observed Independence Day', () => {
    expect(isMarketHoliday('US', '2026-07-03')).toBe(true)
  })

  it('US 2026-07-04 is NOT in list (Saturday)', () => {
    expect(isMarketHoliday('US', '2026-07-04')).toBe(false)
  })

  it("JP 2026-05-05 is Children's Day", () => {
    expect(isMarketHoliday('JP', '2026-05-05')).toBe(true)
  })

  it('random weekday not in list returns false', () => {
    expect(isMarketHoliday('US', '2026-06-15')).toBe(false)
  })

  it('all entries are YYYY-MM-DD format', () => {
    const re = /^\d{4}-\d{2}-\d{2}$/
    expect(US_HOLIDAYS_2026.every((d) => re.test(d))).toBe(true)
    expect(JP_HOLIDAYS_2026.every((d) => re.test(d))).toBe(true)
  })

  it('US_HOLIDAYS_2026 has exactly 10 entries', () => {
    expect(US_HOLIDAYS_2026.length).toBe(10)
  })

  it('JP_HOLIDAYS_2026 has at least 18 entries', () => {
    expect(JP_HOLIDAYS_2026.length).toBeGreaterThanOrEqual(18)
  })
})
