import { describe, it, expect } from 'vitest'
import { isMarketClosed, lastBusinessDay, resolveTargetDate, isWeekendIso } from '@/lib/market/calendar'

describe('market calendar (DATA-04)', () => {
  describe('isWeekendIso', () => {
    it('2026-01-03 is Saturday', () => {
      expect(isWeekendIso('2026-01-03')).toBe(true)
    })
    it('2026-01-04 is Sunday', () => {
      expect(isWeekendIso('2026-01-04')).toBe(true)
    })
    it('2026-01-05 is Monday', () => {
      expect(isWeekendIso('2026-01-05')).toBe(false)
    })
  })

  describe('isMarketClosed', () => {
    it('US weekend (Saturday) is closed', () => {
      expect(isMarketClosed('US', '2026-01-03')).toBe(true)
    })
    it('US MLK Day 2026-01-19 is closed', () => {
      expect(isMarketClosed('US', '2026-01-19')).toBe(true)
    })
    it('US 2026-01-20 (Tuesday, no holiday) is open', () => {
      expect(isMarketClosed('US', '2026-01-20')).toBe(false)
    })
    it('JP Children\'s Day 2026-05-05 is closed', () => {
      expect(isMarketClosed('JP', '2026-05-05')).toBe(true)
    })
    it('JP 2026-05-07 (Thursday, no holiday) is open', () => {
      expect(isMarketClosed('JP', '2026-05-07')).toBe(false)
    })
    it('JP year-end 2026-12-31 is closed', () => {
      expect(isMarketClosed('JP', '2026-12-31')).toBe(true)
    })
  })

  describe('lastBusinessDay (D-19 cutoff)', () => {
    it('US before 16:30 ET returns previous business day', () => {
      // 2026-01-20 Tuesday 10:00 ET = 15:00 UTC
      const now = new Date('2026-01-20T15:00:00Z')
      expect(lastBusinessDay('US', now)).toBe('2026-01-16') // Fri prior (Mon=MLK)
    })

    it('US after 16:30 ET returns same day', () => {
      // 2026-01-20 Tuesday 17:00 ET = 22:00 UTC
      const now = new Date('2026-01-20T22:00:00Z')
      expect(lastBusinessDay('US', now)).toBe('2026-01-20')
    })

    it('US exactly at 16:30 ET returns same day', () => {
      // 2026-01-20 Tuesday 16:30 ET = 21:30 UTC
      const now = new Date('2026-01-20T21:30:00Z')
      expect(lastBusinessDay('US', now)).toBe('2026-01-20')
    })

    it('US Monday before cutoff walks back across weekend + MLK holiday', () => {
      // 2026-01-20 Tuesday 09:00 ET = 14:00 UTC; cutoff not reached
      // Previous day is MLK (Mon), before that weekend, then Fri 01-16
      const now = new Date('2026-01-20T14:00:00Z')
      expect(lastBusinessDay('US', now)).toBe('2026-01-16')
    })

    it('JP after 15:00 JST returns same day', () => {
      // 2026-01-05 Monday 15:30 JST = 06:30 UTC
      const now = new Date('2026-01-05T06:30:00Z')
      expect(lastBusinessDay('JP', now)).toBe('2026-01-05')
    })

    it('JP exactly at 15:00 JST returns same day', () => {
      // 2026-02-13 Friday 15:00 JST = 06:00 UTC
      const now = new Date('2026-02-13T06:00:00Z')
      expect(lastBusinessDay('JP', now)).toBe('2026-02-13')
    })

    it('JP before 15:00 JST walks back to previous business day', () => {
      // 2026-02-13 Friday 10:00 JST = 01:00 UTC
      const now = new Date('2026-02-13T01:00:00Z')
      expect(lastBusinessDay('JP', now)).toBe('2026-02-12') // Thursday
    })

    it('JP before cutoff on Monday walks back across weekend', () => {
      // 2026-01-05 Monday 10:00 JST = 01:00 UTC
      // cutoff not reached, so skip today; 1/4 Sun, 1/3 Sat, 1/2 holiday, 1/1 holiday
      // Need to walk back to 2025-12-30 (Tuesday) but we only have 2026 holidays
      // Use a different date: 2026-01-12 Mon before cutoff -> walk back to 2026-01-09 Fri
      const now = new Date('2026-01-12T01:00:00Z') // Mon 10:00 JST
      expect(lastBusinessDay('JP', now)).toBe('2026-01-09') // Previous Friday
    })

    it('JP walks back across consecutive holidays (Golden Week)', () => {
      // 2026-05-07 Thursday 15:30 JST = 06:30 UTC (after cutoff)
      // 05-07 is open -> should return 05-07
      const now = new Date('2026-05-07T06:30:00Z')
      expect(lastBusinessDay('JP', now)).toBe('2026-05-07')
    })

    it('JP before cutoff during Golden Week walks to before holidays', () => {
      // 2026-05-07 Thursday 10:00 JST = 01:00 UTC (before cutoff)
      // Walk back: 05-06 holiday, 05-05 holiday, 05-04 holiday, 05-03 Sun, 05-02 Sat, 05-01 Fri (open)
      const now = new Date('2026-05-07T01:00:00Z')
      expect(lastBusinessDay('JP', now)).toBe('2026-05-01')
    })
  })

  describe('resolveTargetDate', () => {
    it('incremental mode returns single-element array of lastBusinessDay', () => {
      const now = new Date('2026-01-20T22:00:00Z') // US Tue after cutoff
      const days = resolveTargetDate('US', 'incremental', 1, now)
      expect(days).toEqual(['2026-01-20'])
    })

    it('US backfill=5 returns 5 sequential business days', () => {
      // 2026-01-30 Friday 17:00 ET = 22:00 UTC
      const now = new Date('2026-01-30T22:00:00Z')
      const days = resolveTargetDate('US', 'backfill', 5, now)
      expect(days).toHaveLength(5)
      expect(days[4]).toBe('2026-01-30')
      expect(days.every(d => !isMarketClosed('US', d))).toBe(true)
    })

    it('backfill skips weekends', () => {
      // 2026-01-30 Fri after cutoff, backfill 6 should skip weekend
      const now = new Date('2026-01-30T22:00:00Z')
      const days = resolveTargetDate('US', 'backfill', 6, now)
      expect(days).toHaveLength(6)
      // Should include Mon 01-26 through Fri 01-30 minus weekend
      expect(days).toEqual([
        '2026-01-23', '2026-01-26', '2026-01-27',
        '2026-01-28', '2026-01-29', '2026-01-30',
      ])
    })

    it('backfill skips holidays', () => {
      // 2026-01-20 Tue after cutoff, backfill 3
      // MLK on 01-19, before that 01-18 Sun, 01-17 Sat, 01-16 Fri
      const now = new Date('2026-01-20T22:00:00Z')
      const days = resolveTargetDate('US', 'backfill', 3, now)
      expect(days).toEqual(['2026-01-15', '2026-01-16', '2026-01-20'])
    })
  })
})
