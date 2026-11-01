import { describe, expect, it } from 'vitest'
import {
  MARKET_AUTOFILL_PROTECTED_FIELDS,
  budapestTodayIso,
  buildMarketAutofillPatch,
  deriveFirstCouponDate,
  deriveLastAvailabilityDate,
  deriveRemainingDays,
  deriveTermMonths,
  formatSeriesAvailabilityLabel,
  isSeriesAvailableOn,
  parseSeriesNameYear,
  pickEffectiveInterestPct,
  pickPurchasePricePct
} from '../public/controller/market-data-autofill.js'

describe('market-data-autofill', () => {
  it('derives DKJ term buckets and remaining days', () => {
    expect(deriveTermMonths('2025-12-23', '2026-12-23')).toBe(12)
    expect(deriveTermMonths('2026-07-29', '2026-11-25')).toBe(3)
    expect(deriveRemainingDays('2026-11-02', '2026-12-23')).toBe(51)
  })

  it('derives first coupon from maturity month/day schedule', () => {
    expect(deriveFirstCouponDate('2022-01-21', '2027-03-24', 12)).toBe('2022-03-24')
    expect(deriveFirstCouponDate('2017-10-03', '2028-03-22', 3)).toBe('2017-12-22')
  })

  it('prefers ask over bid for purchase price percent', () => {
    expect(pickPurchasePricePct({ ask: 99.35, bid: 99.15 })).toBe(99.35)
    expect(pickPurchasePricePct({ ask: null, bid: 99.615 })).toBe(99.615)
    expect(pickPurchasePricePct({ ask: null, bid: null })).toBeNull()
  })

  it('prefers ask yield over bid yield for effective interest', () => {
    expect(pickEffectiveInterestPct({ ay: 5.1, by: 5.2 })).toBe(5.1)
    expect(pickEffectiveInterestPct({ ay: null, by: 5.2 })).toBe(5.2)
    expect(pickEffectiveInterestPct({ ay: null, by: null })).toBeNull()
  })

  it('parses paper-name year and last-availability heuristic', () => {
    expect(parseSeriesNameYear('2027/I')).toBe(2027)
    expect(parseSeriesNameYear('D261223')).toBe(2026)
    expect(deriveLastAvailabilityDate({ name: '2027/I', issue: '2022-01-21' })).toBe(
      '2027-01-21'
    )
    expect(deriveLastAvailabilityDate({ name: 'D261223', issue: '2025-12-23' })).toBe(
      '2026-12-23'
    )
    expect(isSeriesAvailableOn({ name: '2027/I', issue: '2022-01-21' }, '2026-11-01')).toBe(
      true
    )
    expect(isSeriesAvailableOn({ name: '2027/I', issue: '2022-01-21' }, '2027-01-22')).toBe(
      false
    )
    expect(formatSeriesAvailabilityLabel({ name: '2028/N', issue: '2017-10-03' }, '2026-11-01')).toBe(
      '2028/N — available'
    )
    expect(formatSeriesAvailabilityLabel({ name: '2020/A', issue: '2015-03-01' }, '2026-11-01')).toBe(
      '2020/A — past'
    )
    expect(budapestTodayIso(new Date('2026-11-01T12:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('fills empty DKJ fields from series + quote without touching amounts', () => {
    const { fields, sourced } = buildMarketAutofillPatch({
      family: 'dkj',
      series: {
        id: 'D261223',
        issue: '2025-12-23',
        mat: '2026-12-23',
        status: 'active'
      },
      quote: { d: '2026-11-02', bid: 99.15, ask: 99.35, by: 6.05, ay: 4.61, ai: 0 },
      current: { faceValue: '100000', purchasePricePct: '', settlementDate: '' },
      mode: 'fill-empty'
    })

    expect(fields).toMatchObject({
      maturityDate: '2026-12-23',
      termMonths: 12,
      settlementDate: '2026-11-02',
      purchasePricePct: 99.35,
      remainingDays: 51
    })
    expect(fields).not.toHaveProperty('faceValue')
    expect(sourced).toEqual(
      expect.arrayContaining([
        'maturityDate',
        'termMonths',
        'settlementDate',
        'purchasePricePct',
        'remainingDays'
      ])
    )
  })

  it('refreshes series-driven DKJ fields including remaining days on series change', () => {
    const { fields } = buildMarketAutofillPatch({
      family: 'dkj',
      series: { issue: '2025-12-23', mat: '2026-12-23' },
      quote: { d: '2026-11-02', ask: 99.35, bid: 99.15 },
      current: {
        maturityDate: '2027-01-01',
        purchasePricePct: '95',
        settlementDate: '2026-10-01',
        termMonths: '6',
        remainingDays: '30'
      },
      mode: 'fill-empty'
    })

    expect(fields).toEqual({
      maturityDate: '2026-12-23',
      termMonths: 12,
      remainingDays: deriveRemainingDays('2026-10-01', '2026-12-23')
    })
    expect(fields.remainingDays).toBe(83)
  })

  it('force-quote updates quote fields only', () => {
    const { fields } = buildMarketAutofillPatch({
      family: 'dkj',
      series: { issue: '2025-12-23', mat: '2026-12-23' },
      quote: { d: '2026-11-02', ask: 99.35, bid: 99.15 },
      current: {
        maturityDate: '2027-01-01',
        purchasePricePct: '95',
        settlementDate: '2026-10-01',
        faceValue: '250000'
      },
      mode: 'force-quote'
    })

    expect(fields.purchasePricePct).toBe(99.35)
    expect(fields.settlementDate).toBe('2026-11-02')
    expect(fields).not.toHaveProperty('maturityDate')
    expect(fields).not.toHaveProperty('faceValue')
  })

  it('maps PMÁP / BMÁP to temporary 0 + ask yield and first coupon', () => {
    const pmap = buildMarketAutofillPatch({
      family: 'pmap',
      series: { issue: '2022-01-21', mat: '2027-03-24', prem: 0.75 },
      quote: { d: '2026-11-02', ask: 100.25, bid: 100.12, ay: 4.0, by: 4.1 },
      current: { principal: '1000000', purchaseDate: '2026-06-01' }
    })
    expect(pmap.fields).toEqual({
      previousYearAverageInflationPct: 0,
      interestPremiumPct: 4.0,
      issueDate: '2022-01-21',
      startDate: '2022-01-21',
      firstCouponDate: '2022-03-24'
    })
    expect(pmap.fields).not.toHaveProperty('principal')
    expect(pmap.fields).not.toHaveProperty('purchaseDate')

    const bmap = buildMarketAutofillPatch({
      family: 'bmap',
      series: { issue: '2017-10-03', mat: '2028-03-22', prem: 1.5 },
      quote: { d: '2026-11-02', ask: 101.7, bid: 101.5, ay: 5.1, by: 5.2 },
      current: {}
    })
    expect(bmap.fields).toEqual({
      dkjBaseYieldPct: 0,
      interestPremiumPct: 5.1,
      issueDate: '2017-10-03',
      startDate: '2017-10-03',
      firstCouponDate: '2017-12-22'
    })
  })

  it('falls back to series premium when quote yield is missing', () => {
    const bmap = buildMarketAutofillPatch({
      family: 'bmap',
      series: { issue: '2017-10-03', mat: '2028-03-22', prem: 1.5 },
      quote: { d: '2026-11-02', ask: 101.7, bid: 101.5, ay: null, by: null },
      current: {}
    })
    expect(bmap.fields.interestPremiumPct).toBe(1.5)
    expect(bmap.fields).not.toHaveProperty('dkjBaseYieldPct')
    expect(bmap.fields.firstCouponDate).toBe('2017-12-22')
  })

  it('documents protected amount / purchase-date fields', () => {
    expect(MARKET_AUTOFILL_PROTECTED_FIELDS).toEqual(['principal', 'faceValue', 'purchaseDate'])
  })
})
