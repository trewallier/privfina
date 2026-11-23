import { describe, expect, it } from 'vitest'
import {
  clampCouponRatePct,
  deriveCouponScheduleTos,
  isFixedCouponSchedule,
  resolveAnnualCouponRatePctFromRows
} from '../public/controller/commercial-investment-coupon-schedule-editor.js'

describe('commercial-investment-coupon-schedule-editor helpers', () => {
  it('treats empty, single, and uniform rates as fixed', () => {
    expect(isFixedCouponSchedule([])).toBe(true)
    expect(isFixedCouponSchedule([{ from: '2026-01-01', rate: 5 }])).toBe(true)
    expect(
      isFixedCouponSchedule([
        { from: '2026-01-01', rate: 5 },
        { from: '2027-01-01', rate: 5 }
      ])
    ).toBe(true)
  })

  it('treats divergent defined rates as stepped', () => {
    expect(
      isFixedCouponSchedule([
        { from: '2026-01-01', rate: 5 },
        { from: '2027-01-01', rate: 6 }
      ])
    ).toBe(false)
  })

  it('clamps rates into 0–100 with two-decimal rounding', () => {
    expect(clampCouponRatePct('-1')).toBe('0')
    expect(clampCouponRatePct('150')).toBe('100')
    expect(clampCouponRatePct('6.255')).toBe('6.26')
    expect(clampCouponRatePct('')).toBe('')
  })

  it('derives to as the day before the next from; last to is null', () => {
    expect(
      deriveCouponScheduleTos([
        { from: '2027-08-03', rate: 7 },
        { from: '2026-08-03', rate: 6.5 },
        { from: '2028-08-03', rate: 7.5 }
      ])
    ).toEqual([
      { from: '2026-08-03', to: '2027-08-02', rate: 6.5 },
      { from: '2027-08-03', to: '2028-08-02', rate: 7 },
      { from: '2028-08-03', to: null, rate: 7.5 }
    ])
  })

  it('resolves covering annual rate at purchase, else first defined', () => {
    const rows = [
      { from: '2026-08-03', to: '2027-08-02', rate: 6.5 },
      { from: '2027-08-03', to: '2028-08-02', rate: 7 },
      { from: '2028-08-03', to: null, rate: 7.5 }
    ]
    expect(resolveAnnualCouponRatePctFromRows(rows, '2027-02-03')).toBe(6.5)
    expect(resolveAnnualCouponRatePctFromRows(rows, '2027-09-01')).toBe(7)
    expect(resolveAnnualCouponRatePctFromRows(rows, '')).toBe(6.5)
  })
})
