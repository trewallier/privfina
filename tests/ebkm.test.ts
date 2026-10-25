import { describe, expect, it } from 'vitest'
import {
  buildEbkmFlowsFromLegs,
  buildHomeSavingsEbkmEqualMonthFlows,
  calculateEbkm,
  calculateEbkmFromHomeSavingsPackage,
  calculateEbkmFromLegs,
  calendarDaysBetween,
  ebkmPresentValue,
  ebkmYearFraction,
  HOME_SAVINGS_EBKM_PAYOUT_MONTH_INDEX,
  HOME_SAVINGS_EBKM_TERMINAL_ACCOUNT_FEE_NETTING,
  roundEbkmPercent,
  type EbkmDatedFlow
} from '../src/finance_engine/instruments/ebkm'

describe('calendarDaysBetween / ebkmYearFraction (3. melléklet t/365)', () => {
  it('returns 0 for the same calendar day', () => {
    expect(calendarDaysBetween('2026-10-10', '2026-10-10')).toBe(0)
    expect(ebkmYearFraction('2026-10-10', '2026-10-10')).toBe(0)
  })

  it('divides calendar days by 365', () => {
    expect(calendarDaysBetween('2026-01-01', '2027-01-01')).toBe(365)
    expect(ebkmYearFraction('2026-01-01', '2027-01-01')).toBe(1)
    expect(ebkmYearFraction('2026-10-10', '2026-11-10')).toBeCloseTo(31 / 365, 12)
  })
})

describe('roundEbkmPercent (6. § two decimals)', () => {
  it('rounds half-up to two decimal places', () => {
    expect(roundEbkmPercent(4.345)).toBe(4.35)
    expect(roundEbkmPercent(4.344)).toBe(4.34)
    expect(roundEbkmPercent(-0.575)).toBe(-0.58)
    expect(roundEbkmPercent(-0.574)).toBe(-0.57)
    expect(roundEbkmPercent(4.84)).toBe(4.84)
  })
})

describe('calculateEbkm (3. melléklet)', () => {
  it('solves a one-year single deposit / payout at 10%', () => {
    const flows: EbkmDatedFlow[] = [
      { yearFraction: 0, amount: -1000 },
      { yearFraction: 1, amount: 1100 }
    ]
    const ebkm = calculateEbkm(flows)
    expect(ebkm.rate).toBeCloseTo(0.1, 12)
    expect(ebkm.percentRounded).toBe(10)
    expect(ebkmPresentValue(ebkm.rate, flows)).toBeCloseTo(0, 10)
  })

  it('lowers EBKM when fees are added as deposit legs', () => {
    const base = calculateEbkmFromLegs({
      deposits: [
        { date: '2026-01-01', amount: 1000 },
        { date: '2026-07-01', amount: 1000 }
      ],
      payouts: [{ date: '2027-01-01', amount: 2100 }]
    })
    const withFee = calculateEbkmFromLegs({
      deposits: [
        { date: '2026-01-01', amount: 1000 },
        { date: '2026-01-01', amount: 50 },
        { date: '2026-07-01', amount: 1000 }
      ],
      payouts: [{ date: '2027-01-01', amount: 2100 }]
    })
    expect(withFee.rate).toBeLessThan(base.rate)
  })

  it('allows negative EBKM when fees dominate', () => {
    const ebkm = calculateEbkmFromLegs({
      deposits: [
        { date: '2026-01-01', amount: 1000 },
        { date: '2026-01-01', amount: 200 }
      ],
      payouts: [{ date: '2027-01-01', amount: 1000 }]
    })
    expect(ebkm.percentRounded).toBeLessThan(0)
  })

  it('rejects flows without both deposits and payouts', () => {
    expect(() => calculateEbkm([{ yearFraction: 0, amount: -100 }])).toThrow(
      /both deposits and payouts/i
    )
    expect(() => buildEbkmFlowsFromLegs({ deposits: [], payouts: [] })).toThrow(
      /at least one deposit/i
    )
  })
})

describe('home-savings Hirdetmény equal-month packaging', () => {
  it('locks payout month and terminal fee-netting constants', () => {
    expect(HOME_SAVINGS_EBKM_PAYOUT_MONTH_INDEX).toBe(121.7)
    expect(HOME_SAVINGS_EBKM_TERMINAL_ACCOUNT_FEE_NETTING).toBe(500)
  })

  it('builds opening + 120 deposit/fee months + terminal', () => {
    const flows = buildHomeSavingsEbkmEqualMonthFlows({
      monthlyDeposit: 20_000,
      termMonths: 120,
      accountOpeningFee: 26_000,
      accountFeeMonthly: 500,
      premiumAmount: 720_000,
      depositInterest: 12_113
    })
    const opening = flows.filter((flow) => flow.yearFraction === 0 && flow.amount === -26_000)
    const deposits = flows.filter((flow) => flow.amount === -20_000)
    const fees = flows.filter((flow) => flow.amount === -500)
    const terminal = flows.filter((flow) => flow.amount > 0)
    expect(opening).toHaveLength(1)
    expect(deposits).toHaveLength(120)
    expect(fees).toHaveLength(120)
    expect(terminal).toHaveLength(1)
    expect(terminal[0].yearFraction).toBeCloseTo(121.7 / 12, 12)
    expect(terminal[0].amount).toBe(20_000 * 120 + 720_000 + 12_113 - 500)
  })

  it('matches a locked promo 20k with-Premium golden', () => {
    const ebkm = calculateEbkmFromHomeSavingsPackage({
      monthlyDeposit: 20_000,
      termMonths: 120,
      accountOpeningFee: 26_000,
      accountFeeMonthly: 500,
      premiumAmount: 720_000,
      depositInterest: 12_113
    })
    expect(ebkm.percentRounded).toBe(4.35)
  })
})
