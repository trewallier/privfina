import { describe, expect, it } from 'vitest'
import {
  actActIsdaYearFraction,
  accrueInterestAmount,
  annualizeDkjSimpleReturnPct,
  calendarDaysBetweenIso,
  normalizeDayCountConvention
} from '../src/finance_engine/instruments/day_count'
import { accrueIsmertetoActActAmount } from '../src/finance_engine/instruments/ismerteto_accrued'
import { derivePmapAccruedInterestAmount } from '../src/finance_engine/instruments/pmap'
import { deriveFixmapAccruedInterestAmount } from '../src/finance_engine/instruments/fixmap'
import { deriveBmapAccruedInterestAmount } from '../src/finance_engine/instruments/bmap'
import {
  resolveCommercialDayCountAutofill
} from '../public/controller/market-data-autofill.js'

describe('ACT/ACT day-count (offering Tényleges/tényleges)', () => {
  it('normalizes ACT/ACT aliases without throwing', () => {
    expect(normalizeDayCountConvention('ACT/ACT')).toBe('ACT/ACT')
    expect(normalizeDayCountConvention('act/act')).toBe('ACT/ACT')
    expect(normalizeDayCountConvention('Actual/Actual')).toBe('ACT/ACT')
  })

  it('keeps ISDA Actual/Actual helper for generic accrueInterestAmount', () => {
    expect(actActIsdaYearFraction('2027-01-01', '2027-04-11')).toBeCloseTo(100 / 365, 12)
    const accrued = accrueInterestAmount({
      principal: 1_000_000,
      annualRatePct: 6.5,
      fromIso: '2026-08-03',
      toIso: '2027-02-03',
      dayCount: 'ACT/ACT'
    })
    expect(accrued).toBeCloseTo((1_000_000 * 6.5 * (184 / 365)) / 100, 8)
  })

  it('PMÁP ACT/ACT uses Ismertető short-first period fraction (ga)', () => {
    // PMÁP 2036/I1-style: issue 2026-07-20, first 2027-02-21, purchase mid first period
    const inputs = {
      principal: 1_000_000,
      purchaseDate: '2026-11-01',
      issueDate: '2026-07-20',
      firstCouponDate: '2027-02-21',
      dayCountConvention: 'ACT/ACT',
      annualCouponRatePct: 4.5
    }
    const dt1 = '2026-02-21'
    const denom = calendarDaysBetweenIso(dt1, '2027-02-21')
    const numer = calendarDaysBetweenIso('2026-07-20', '2026-11-01')
    const expected = (1_000_000 * 4.5 * numer) / (100 * denom)
    expect(derivePmapAccruedInterestAmount(inputs)).toBeCloseTo(expected, 8)
    expect(
      accrueIsmertetoActActAmount({
        principal: 1_000_000,
        annualRatePct: 4.5,
        purchaseDate: '2026-11-01',
        issueDate: '2026-07-20',
        firstCouponDate: '2027-02-21',
        frequencyMonths: 12
      })
    ).toBeCloseTo(expected, 8)
  })

  it('FixMÁP ACT/ACT uses Ismertető long-first with ga/n (n=4)', () => {
    // FixMÁP 2029/Q: issue 2026-07-20 < dt1 2026-07-24 → long first; purchase after dt1
    const inputs = {
      principal: 1_000_000,
      purchaseDate: '2026-09-01',
      issueDate: '2026-07-20',
      firstCouponDate: '2026-10-24',
      dayCountConvention: 'ACT/ACT',
      annualCouponRatePct: 5.5
    }
    const gBase = 5.5 / 4
    const dt0 = '2026-04-24'
    const dt1 = '2026-07-24'
    const d1 = '2026-10-24'
    const partA =
      (gBase * calendarDaysBetweenIso('2026-07-20', dt1)) /
      calendarDaysBetweenIso(dt0, dt1)
    const partB =
      (gBase * calendarDaysBetweenIso(dt1, '2026-09-01')) /
      calendarDaysBetweenIso(dt1, d1)
    const expected = (1_000_000 * (partA + partB)) / 100
    expect(deriveFixmapAccruedInterestAmount(inputs)).toBeCloseTo(expected, 8)
  })

  it('FixMÁP ACT/ACT short-first uses single ga/n fraction', () => {
    const inputs = {
      principal: 1_000_000,
      purchaseDate: '2026-09-01',
      issueDate: '2026-08-01',
      firstCouponDate: '2026-10-24',
      dayCountConvention: 'ACT/ACT',
      annualCouponRatePct: 5.5
    }
    const dt1 = '2026-07-24'
    const denom = calendarDaysBetweenIso(dt1, '2026-10-24')
    const numer = calendarDaysBetweenIso('2026-08-01', '2026-09-01')
    const expected = (1_000_000 * (5.5 / 4) * numer) / (100 * denom)
    expect(deriveFixmapAccruedInterestAmount(inputs)).toBeCloseTo(expected, 8)
  })

  it('BMÁP keeps ACT/360 accrued when dayCountConvention is ACT/ACT', () => {
    const accrued = deriveBmapAccruedInterestAmount(
      {
        principal: 1_000_000,
        purchaseDate: '2026-04-24',
        issueDate: '2026-04-01',
        dayCountConvention: 'ACT/ACT',
        annualCouponRatePct: 6.88
      },
      6.88
    )
    expect(accrued).toBeCloseTo((1_000_000 * 6.88 * 23) / (100 * 360), 10)
  })

  it('autofill ignores offering ACT/ACT for BMÁP/DKJ accrued convention', () => {
    expect(
      resolveCommercialDayCountAutofill(
        'bmap',
        { dayCount: 'ACT/ACT' },
        { dayCount: 'ACT/360' }
      )
    ).toBe('ACT/360')
    expect(
      resolveCommercialDayCountAutofill('bmap', { dayCount: 'ACT/ACT' }, {})
    ).toBe('ACT/360')
    expect(
      resolveCommercialDayCountAutofill(
        'pmap',
        { dayCount: 'ACT/ACT' },
        { dayCount: 'ACT/360' }
      )
    ).toBe('ACT/ACT')
    expect(
      resolveCommercialDayCountAutofill(
        'fixmap',
        { dayCount: 'ACT/ACT' },
        { dayCount: 'ACT/360' }
      )
    ).toBe('ACT/ACT')
  })

  it('rejects ACT/ACT for DKJ annualization', () => {
    expect(() => annualizeDkjSimpleReturnPct(1.2, 90, 'ACT/ACT')).toThrow(
      /ACT\/ACT is not valid for DKJ annualization/
    )
  })
})
