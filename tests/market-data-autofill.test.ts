import { describe, expect, it } from 'vitest'
import {
  MARKET_AUTOFILL_PROTECTED_FIELDS,
  buildMarketAutofillPatch,
  deriveRemainingDays,
  deriveTermMonths,
  pickPurchasePricePct
} from '../public/controller/market-data-autofill.js'

describe('market-data-autofill', () => {
  it('derives DKJ term buckets and remaining days', () => {
    expect(deriveTermMonths('2025-12-23', '2026-12-23')).toBe(12)
    expect(deriveTermMonths('2026-07-29', '2026-11-25')).toBe(3)
    expect(deriveRemainingDays('2026-11-02', '2026-12-23')).toBe(51)
  })

  it('prefers ask over bid for purchase price percent', () => {
    expect(pickPurchasePricePct({ ask: 99.35, bid: 99.15 })).toBe(99.35)
    expect(pickPurchasePricePct({ ask: null, bid: 99.615 })).toBe(99.615)
    expect(pickPurchasePricePct({ ask: null, bid: null })).toBeNull()
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

  it('refreshes series-driven fields but does not clobber non-empty quote fields', () => {
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

    // Series pick always aligns maturity/term with the chosen offering (select
    // defaults are never blank). Quote-backed fields stay user-owned when set.
    expect(fields).toEqual({
      maturityDate: '2026-12-23',
      termMonths: 12
    })
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

  it('maps PMÁP / BMÁP premium and issue dates; leaves inflation and dkj-base alone', () => {
    const pmap = buildMarketAutofillPatch({
      family: 'pmap',
      series: { issue: '2022-01-21', mat: '2027-03-24', prem: 0.75 },
      quote: { d: '2026-11-02', ask: 100.25, bid: 100.12 },
      current: { principal: '1000000', purchaseDate: '2026-06-01' }
    })
    expect(pmap.fields).toEqual({
      interestPremiumPct: 0.75,
      issueDate: '2022-01-21',
      startDate: '2022-01-21'
    })
    expect(pmap.fields).not.toHaveProperty('previousYearAverageInflationPct')
    expect(pmap.fields).not.toHaveProperty('principal')
    expect(pmap.fields).not.toHaveProperty('purchaseDate')

    const bmap = buildMarketAutofillPatch({
      family: 'bmap',
      series: { issue: '2017-10-03', mat: '2028-03-22', prem: 1.5 },
      quote: { d: '2026-11-02', ask: 101.7, bid: 101.5 },
      current: {}
    })
    expect(bmap.fields).toEqual({
      interestPremiumPct: 1.5,
      issueDate: '2017-10-03',
      startDate: '2017-10-03'
    })
    expect(bmap.fields).not.toHaveProperty('dkjBaseYieldPct')
  })

  it('documents protected amount / purchase-date fields', () => {
    expect(MARKET_AUTOFILL_PROTECTED_FIELDS).toEqual(['principal', 'faceValue', 'purchaseDate'])
  })
})
