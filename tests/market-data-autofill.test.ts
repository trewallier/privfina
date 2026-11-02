import { describe, expect, it } from 'vitest'
import {
  MARKET_AUTOFILL_PROTECTED_FIELDS,
  budapestTodayIso,
  buildMarketAutofillPatch,
  couponsFileToCouponSchedule,
  marketableFieldsMissingFromPatch,
  deriveFirstCouponDate,
  deriveLastAvailabilityDate,
  deriveRemainingDays,
  deriveTermMonths,
  formatSeriesAvailabilityLabel,
  isSeriesAvailableOn,
  parseSeriesNameYear,
  pickCouponRatePct,
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

  it('prefers series.offered over name-year heuristic', () => {
    expect(isSeriesAvailableOn({ name: '2020/A', offered: true }, '2026-11-01')).toBe(true)
    expect(isSeriesAvailableOn({ name: '2027/J', offered: false }, '2026-11-01')).toBe(false)
    expect(
      formatSeriesAvailabilityLabel(
        { name: '2027/J', issue: '2022-09-30', offered: true },
        '2026-11-01'
      )
    ).toBe('2027/J — available')
  })

  it('always overwrites DKJ auto fields without sourcing settlement or amounts', () => {
    const { fields, sourced } = buildMarketAutofillPatch({
      family: 'dkj',
      series: { issue: '2025-12-23', mat: '2026-12-23' },
      quote: { d: '2026-11-02', ask: 99.35, bid: 99.15 },
      current: { settlementDate: '2026-11-02', faceValue: '100000' }
    })
    expect(fields).toEqual({
      maturityDate: '2026-12-23',
      termMonths: 12,
      purchasePricePct: 99.35,
      remainingDays: 51
    })
    expect(sourced).toEqual([
      'maturityDate',
      'termMonths',
      'purchasePricePct',
      'remainingDays'
    ])
    expect(fields).not.toHaveProperty('faceValue')
    expect(fields).not.toHaveProperty('settlementDate')
  })

  it('maps coupons file into scalar rate and couponSchedule for PMÁP/BMÁP', () => {
    const coupons = {
      cols: ['from', 'to', 'rate'],
      rows: [
        ['2025-03-24', '2026-03-23', 3.5],
        ['2026-03-24', '2027-03-23', 4.5]
      ]
    }
    expect(couponsFileToCouponSchedule(coupons)).toEqual([
      { from: '2025-03-24', to: '2026-03-23', rate: 3.5 },
      { from: '2026-03-24', to: '2027-03-23', rate: 4.5 }
    ])

    const pmap = buildMarketAutofillPatch({
      family: 'pmap',
      series: { issue: '2022-01-21', mat: '2027-03-24', offered: true },
      quote: { d: '2026-11-02', ask: 100.25, bid: 100.12, ay: 9.9, by: 9.8 },
      coupons,
      current: { principal: '1000000', purchaseDate: '2026-06-01' }
    })
    expect(pmap.fields).toEqual({
      annualCouponRatePct: 4.5,
      couponSchedule: [
        { from: '2025-03-24', to: '2026-03-23', rate: 3.5 },
        { from: '2026-03-24', to: '2027-03-23', rate: 4.5 }
      ],
      maturityDate: '2027-03-24',
      issueDate: '2022-01-21',
      startDate: '2022-01-21',
      firstCouponDate: '2022-03-24'
    })
    expect(pmap.fields).not.toHaveProperty('principal')
    expect(pmap.fields).not.toHaveProperty('purchaseDate')

    const bmap = buildMarketAutofillPatch({
      family: 'bmap',
      series: { issue: '2017-10-03', mat: '2028-03-22' },
      quote: { d: '2026-11-02', ask: 101.7, bid: 101.5, ay: 5.1, by: 5.2 },
      coupons: {
        cols: ['from', 'to', 'rate'],
        rows: [['2026-03-22', '2026-06-21', 5.47]]
      },
      current: { purchaseDate: '2026-04-01' }
    })
    expect(bmap.fields).toEqual({
      annualCouponRatePct: 5.47,
      couponSchedule: [{ from: '2026-03-22', to: '2026-06-21', rate: 5.47 }],
      maturityDate: '2028-03-22',
      issueDate: '2017-10-03',
      startDate: '2017-10-03',
      firstCouponDate: '2017-12-22'
    })
  })

  it('omits annualCouponRatePct when coupon schedule has no defined rate', () => {
    const bmap = buildMarketAutofillPatch({
      family: 'bmap',
      series: { issue: '2017-10-03', mat: '2028-03-22' },
      quote: { d: '2026-11-02', ask: 101.7, bid: 101.5, ay: null, by: null },
      coupons: { cols: ['from', 'to', 'rate'], rows: [['2027-01-01', null, null]] },
      current: { purchaseDate: '2026-04-01' }
    })
    expect(bmap.fields.annualCouponRatePct).toBeUndefined()
    expect(bmap.fields.couponSchedule).toEqual([{ from: '2027-01-01', to: null, rate: null }])
    expect(bmap.fields.maturityDate).toBe('2028-03-22')
    expect(bmap.fields.firstCouponDate).toBe('2017-12-22')
  })

  it('picks coupon rate for a purchase date', () => {
    expect(
      pickCouponRatePct(
        {
          rows: [
            ['2025-01-01', '2025-12-31', 3],
            ['2026-01-01', '2026-12-31', 4.5]
          ]
        },
        '2026-06-01'
      )
    ).toBe(4.5)
  })

  it('documents protected amount / purchase-settlement fields', () => {
    expect(MARKET_AUTOFILL_PROTECTED_FIELDS).toEqual([
      'principal',
      'faceValue',
      'purchaseDate',
      'settlementDate'
    ])
  })

  it('lists marketable fields missing from a new patch so series switches can clear stale rates', () => {
    expect(
      marketableFieldsMissingFromPatch('bmap', ['issueDate', 'startDate', 'firstCouponDate'])
    ).toEqual(['annualCouponRatePct', 'maturityDate', 'couponSchedule'])
    expect(
      marketableFieldsMissingFromPatch('dkj', [
        'maturityDate',
        'termMonths',
        'purchasePricePct',
        'remainingDays'
      ])
    ).toEqual([])
    expect(marketableFieldsMissingFromPatch('pmap', [])).toEqual([
      'annualCouponRatePct',
      'maturityDate',
      'startDate',
      'issueDate',
      'firstCouponDate',
      'couponSchedule'
    ])
  })

  it('overwrites rates on series switch and leaves missing coupon fields out of the patch', () => {
    const withYield = buildMarketAutofillPatch({
      family: 'bmap',
      series: { issue: '2017-10-03', mat: '2028-03-22' },
      quote: { d: '2026-11-02', ask: 101.7, bid: 101.5, ay: 5.1, by: 5.2 },
      coupons: { rows: [['2017-10-03', null, 5.47]] },
      current: { purchaseDate: '2026-04-01' }
    })
    expect(withYield.fields.annualCouponRatePct).toBe(5.47)
    expect(withYield.fields.maturityDate).toBe('2028-03-22')
    expect(withYield.fields.couponSchedule).toEqual([
      { from: '2017-10-03', to: null, rate: 5.47 }
    ])

    const withoutYield = buildMarketAutofillPatch({
      family: 'bmap',
      series: { issue: '2018-01-01', mat: '2029-03-22' },
      quote: { d: '2026-11-02', ask: 100, bid: 99.9, ay: null, by: null },
      coupons: null,
      current: {
        annualCouponRatePct: '5.1',
        maturityDate: '2028-03-22',
        issueDate: '2017-10-03',
        startDate: '2017-10-03',
        firstCouponDate: '2017-12-22'
      }
    })
    expect(withoutYield.fields).not.toHaveProperty('annualCouponRatePct')
    expect(withoutYield.fields).not.toHaveProperty('couponSchedule')
    expect(withoutYield.fields.maturityDate).toBe('2029-03-22')
    expect(marketableFieldsMissingFromPatch('bmap', withoutYield.sourced)).toEqual(
      expect.arrayContaining(['annualCouponRatePct', 'couponSchedule'])
    )
  })
})
