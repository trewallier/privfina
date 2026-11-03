import { describe, expect, it } from 'vitest'
import {
  deriveBmapAccruedInterestAmount,
  generateBmapQuarterlyCouponFlows
} from '../src/finance_engine/instruments/bmap'
import {
  derivePmapAccruedInterestAmount,
  generatePmapAnnualCouponFlows
} from '../src/finance_engine/instruments/pmap'
import {
  deriveDkjRemainingDays,
  annualizeDkjSimpleReturnPct,
  resolveAccrualStartIso
} from '../src/finance_engine/instruments/day_count'

describe('govsec accrual start + schedule gaps + DKJ day math', () => {
  it('resolves accrual start from the last coupon on/before purchase', () => {
    expect(
      resolveAccrualStartIso({
        purchaseDate: '2026-05-15',
        issueDate: '2024-03-22',
        startDate: '2024-03-22',
        couponSchedule: [
          { from: '2025-03-22', to: '2026-03-21', rate: 6.5 },
          { from: '2026-03-22', to: '2027-03-21', rate: 6.88 }
        ]
      })
    ).toBe('2026-03-22')
  })

  it('mid-period BMÁP accrued uses prior coupon, not issue (overstate guard)', () => {
    const fromIssue = deriveBmapAccruedInterestAmount({
      principal: 1_000_000,
      annualCouponRatePct: 6.88,
      issueDate: '2024-03-22',
      purchaseDate: '2026-05-15'
      // no schedule → falls back to issueDate
    })
    const midPeriod = deriveBmapAccruedInterestAmount({
      principal: 1_000_000,
      annualCouponRatePct: 6.88,
      issueDate: '2024-03-22',
      purchaseDate: '2026-05-15',
      couponSchedule: [
        { from: '2025-03-22', to: '2026-03-21', rate: 6.5 },
        { from: '2026-03-22', to: '2027-03-21', rate: 6.88 }
      ]
    })
    expect(midPeriod).toBeLessThan(fromIssue)
    // ~54 ACT/360 days from 2026-03-22 → 2026-05-15 at 6.88% on 1e6
    expect(midPeriod).toBeCloseTo((1_000_000 * 6.88 * 54) / (100 * 360), 4)
  })

  it('mid-period PMÁP accrued uses prior coupon from schedule', () => {
    const accrued = derivePmapAccruedInterestAmount({
      principal: 1_000_000,
      annualCouponRatePct: 4.9,
      issueDate: '2023-04-20',
      purchaseDate: '2026-08-01',
      couponSchedule: [
        { from: '2025-04-20', to: '2026-04-19', rate: 4.5 },
        { from: '2026-04-20', to: '2027-04-19', rate: 4.9 }
      ]
    })
    expect(accrued).toBeCloseTo((1_000_000 * 4.9 * 103) / (100 * 360), 4)
  })

  it('skips coupons with null rate and schedule gaps (no flat-rate invent)', () => {
    const flows = generateBmapQuarterlyCouponFlows(
      {
        principal: 100_000,
        annualCouponRatePct: 6.88,
        purchaseDate: '2026-01-01',
        issueDate: '2025-12-01',
        maturityDate: '2027-03-01',
        firstCouponDate: '2026-03-01',
        couponSchedule: [
          { from: '2026-03-01', to: '2026-05-31', rate: 6.88 },
          { from: '2026-06-01', to: '2026-08-31', rate: null },
          // gap: no covering period for 2026-09-01
          { from: '2026-12-01', to: '2027-02-28', rate: 7.0 }
        ]
      },
      100_000,
      6.88
    )
    const couponDates = flows
      .filter((f) => f.direction === 'inflow' && f.amount !== 100_000)
      .map((f) => f.date)
    // March (defined) + December (defined); June null and September gap skipped.
    expect(couponDates).toEqual(['2026-03-01', '2026-12-01'])
  })

  it('without schedule, holds flat annualCouponRatePct through maturity', () => {
    const flows = generatePmapAnnualCouponFlows(
      {
        principal: 100_000,
        annualCouponRatePct: 4.9,
        purchaseDate: '2025-01-01',
        issueDate: '2024-01-01',
        maturityDate: '2027-01-01',
        firstCouponDate: '2026-01-01'
      },
      100_000,
      4.9
    )
    const coupons = flows.filter((f) => f.direction === 'inflow' && f.amount !== 100_000)
    expect(coupons.map((f) => f.date)).toEqual(['2026-01-01', '2027-01-01'])
  })

  it('DKJ remaining days and ACT/360 annualization live in finance_engine', () => {
    expect(deriveDkjRemainingDays('2026-11-02', '2026-12-23')).toBe(51)
    expect(annualizeDkjSimpleReturnPct(1.0, 51, 'ACT/360')).toBeCloseTo(1.0 * (360 / 51), 10)
    expect(annualizeDkjSimpleReturnPct(1.0, 51, 'ACT/365F')).toBeCloseTo(1.0 * (365 / 51), 10)
  })
})
