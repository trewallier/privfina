import { describe, expect, it } from 'vitest'
import {
  actActIsdaYearFraction,
  accrueInterestAmount,
  annualizeDkjSimpleReturnPct,
  normalizeDayCountConvention
} from '../src/finance_engine/instruments/day_count'
import { derivePmapAccruedInterestAmount } from '../src/finance_engine/instruments/pmap'
import { deriveFixmapAccruedInterestAmount } from '../src/finance_engine/instruments/fixmap'

describe('ACT/ACT day-count (offering Tényleges/tényleges)', () => {
  it('normalizes ACT/ACT aliases without throwing', () => {
    expect(normalizeDayCountConvention('ACT/ACT')).toBe('ACT/ACT')
    expect(normalizeDayCountConvention('act/act')).toBe('ACT/ACT')
    expect(normalizeDayCountConvention('Actual/Actual')).toBe('ACT/ACT')
  })

  it('computes ISDA Actual/Actual year fraction within a non-leap year', () => {
    // 2027 is not a leap year; 100 days → 100/365
    expect(actActIsdaYearFraction('2027-01-01', '2027-04-11')).toBeCloseTo(100 / 365, 12)
  })

  it('splits ISDA Actual/Actual across a leap-year boundary', () => {
    // 2024 leap: 2024-12-01 → 2025-01-01 = 31/366; 2025-01-01 → 2025-01-31 = 30/365
    const expected = 31 / 366 + 30 / 365
    expect(actActIsdaYearFraction('2024-12-01', '2025-01-31')).toBeCloseTo(expected, 12)
  })

  it('accrues with ACT/ACT without throwing (PMÁP-style mid-period)', () => {
    const accrued = accrueInterestAmount({
      principal: 1_000_000,
      annualRatePct: 6.5,
      fromIso: '2026-08-03',
      toIso: '2027-02-03',
      dayCount: 'ACT/ACT'
    })
    // 184 days entirely in 2026 (non-leap) → 184/365
    expect(accrued).toBeCloseTo((1_000_000 * 6.5 * (184 / 365)) / 100, 8)
  })

  it('PMÁP and FixMÁP accrued paths accept offering ACT/ACT', () => {
    const inputs = {
      principal: 1_000_000,
      purchaseDate: '2027-02-03',
      issueDate: '2026-08-03',
      dayCountConvention: 'ACT/ACT',
      annualCouponRatePct: 6.5
    }
    const pmap = derivePmapAccruedInterestAmount(inputs)
    const fixmap = deriveFixmapAccruedInterestAmount(inputs)
    expect(pmap).toBeCloseTo((1_000_000 * 6.5 * (184 / 365)) / 100, 8)
    expect(fixmap).toBe(pmap)
  })

  it('rejects ACT/ACT for DKJ annualization', () => {
    expect(() => annualizeDkjSimpleReturnPct(1.2, 90, 'ACT/ACT')).toThrow(
      /ACT\/ACT is not valid for DKJ annualization/
    )
  })
})
