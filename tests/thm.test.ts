import { describe, expect, it } from 'vitest'
import { resolveLoanSchedule } from '../src/finance_engine/instruments/loan'
import {
  buildThmFlowsFromMonthly,
  calculateThm,
  computeThmPct,
  expandScheduleToMonthlyPayments,
  netDrawdownWithUpfrontCosts,
  roundThmPercent,
  thmPresentValue,
  yearFractionActualDays,
  yearFractionEqualMonths,
  type ThmFlow
} from '../src/finance_engine/instruments/thm'

describe('yearFractionEqualMonths (5. § (2) d)', () => {
  it('maps twelve equal months to one year', () => {
    expect(yearFractionEqualMonths(12)).toBe(1)
  })

  it('maps one month to 1/12', () => {
    expect(yearFractionEqualMonths(1)).toBeCloseTo(1 / 12, 12)
  })
})

describe('yearFractionActualDays (5. § (3))', () => {
  it('returns 0 for the same calendar day', () => {
    expect(yearFractionActualDays('2024-03-01', '2024-03-01')).toBe(0)
  })

  it('uses actual day count over a non-leap lookback year', () => {
    // 31 days from 2023-01-01 to 2023-02-01; lookback year from 2023-02-01 is 365 days.
    expect(yearFractionActualDays('2023-01-01', '2023-02-01')).toBeCloseTo(31 / 365, 12)
  })

  it('uses 366-day divisor when the lookback year from the end date is a leap span', () => {
    // From 2024-03-01 back one year is 2023-03-01 → 366 days (includes 2024-02-29).
    expect(yearFractionActualDays('2024-02-01', '2024-03-01')).toBeCloseTo(29 / 366, 12)
  })
})

describe('roundThmPercent (5. § (2) e)', () => {
  it('rounds half-up to one decimal place', () => {
    expect(roundThmPercent(8.54)).toBe(8.5)
    expect(roundThmPercent(8.55)).toBe(8.6)
    expect(roundThmPercent(8.549)).toBe(8.5)
    expect(roundThmPercent(3.25)).toBe(3.3)
    expect(roundThmPercent(9.2)).toBe(9.2)
  })
})

describe('netDrawdownWithUpfrontCosts (1. melléklet C_k)', () => {
  it('reduces the drawdown by costs due by first disbursement', () => {
    expect(netDrawdownWithUpfrontCosts(12_000_000, 168_765)).toBe(12_000_000 - 168_765)
  })
})

describe('calculateThm (5. § / 1. melléklet)', () => {
  it('matches EAR of a fee-free monthly annuity and rounds per decree', () => {
    const nominalAnnual = 0.0799
    const schedule = resolveLoanSchedule({
      principal: 12_000_000,
      annualRate: nominalAnnual,
      termMonths: 240
    })
    const payments = expandScheduleToMonthlyPayments(schedule)
    const flows = buildThmFlowsFromMonthly({
      principal: 12_000_000,
      monthlyOutflows: payments.map((amount, index) => ({
        monthIndex: index + 1,
        amount
      }))
    })

    const thm = calculateThm(flows)
    const expectedEar = Math.pow(1 + nominalAnnual / 12, 12) - 1

    expect(thm.rate).toBeCloseTo(expectedEar, 10)
    expect(thm.percentRounded).toBe(roundThmPercent(expectedEar * 100))
    expect(Math.abs(thmPresentValue(thm.rate, flows))).toBeLessThan(1e-4)
  })

  it('sets t1 = 0 so the first drawdown is undiscounted', () => {
    const flows: ThmFlow[] = [
      { yearFraction: 0, amount: 1000 },
      { yearFraction: 1, amount: -1100 }
    ]
    const thm = calculateThm(flows)
    expect(thm.rate).toBeCloseTo(0.1, 12)
    expect(thmPresentValue(thm.rate, flows)).toBeCloseTo(0, 10)
  })

  it('raises THM when upfront costs are netted into C_k', () => {
    const schedule = resolveLoanSchedule({
      principal: 12_000_000,
      annualRate: 0.0799,
      termMonths: 240
    })
    const payments = expandScheduleToMonthlyPayments(schedule)
    const outflows = payments.map((amount, index) => ({
      monthIndex: index + 1,
      amount
    }))

    const zeroFee = calculateThm(
      buildThmFlowsFromMonthly({ principal: 12_000_000, monthlyOutflows: outflows })
    )
    const withFees = calculateThm(
      buildThmFlowsFromMonthly({
        principal: 12_000_000,
        upfrontFees: 168_765,
        monthlyOutflows: outflows
      })
    )

    expect(withFees.rate).toBeGreaterThan(zeroFee.rate)
    expect(withFees.percentRounded).toBeGreaterThanOrEqual(zeroFee.percentRounded)
  })

  it('raises THM when a fee is paid after disbursement as D_l', () => {
    const schedule = resolveLoanSchedule({
      principal: 1_000_000,
      annualRate: 0.05,
      termMonths: 12
    })
    const payments = expandScheduleToMonthlyPayments(schedule)
    const baseFlows = buildThmFlowsFromMonthly({
      principal: 1_000_000,
      monthlyOutflows: payments.map((amount, index) => ({
        monthIndex: index + 1,
        amount
      }))
    })
    const withLaterFee: ThmFlow[] = [
      ...baseFlows,
      { yearFraction: yearFractionEqualMonths(1), amount: -50_000 }
    ]

    const base = calculateThm(baseFlows)
    const withFee = calculateThm(withLaterFee)

    expect(withFee.rate).toBeGreaterThan(base.rate)
  })

  it('rejects empty or one-sided cash flows', () => {
    expect(() => calculateThm([])).toThrow(/at least one cash flow/i)
    expect(() => calculateThm([{ yearFraction: 0, amount: 100 }])).toThrow(
      /inflows and outflows/i
    )
    expect(() =>
      calculateThm([
        { yearFraction: 0, amount: -100 },
        { yearFraction: 1, amount: -100 }
      ])
    ).toThrow(/inflows and outflows/i)
  })
})

describe('computeThmPct (ADR 0021 monthly convenience)', () => {
  it('annualizes the monthly IRR as an effective annual rate when fees are zero', () => {
    const nominalAnnual = 0.0799
    const schedule = resolveLoanSchedule({
      principal: 12_000_000,
      annualRate: nominalAnnual,
      termMonths: 240
    })
    const payments = expandScheduleToMonthlyPayments(schedule)
    const thm = computeThmPct({
      principal: 12_000_000,
      upfrontFees: 0,
      monthlyPayments: payments
    })

    const expectedEar = (Math.pow(1 + nominalAnnual / 12, 12) - 1) * 100
    expect(thm.thmPct).toBeCloseTo(expectedEar, 4)
    expect(thm.monthlyRate).toBeCloseTo(nominalAnnual / 12, 8)
  })

  it('stays consistent with calculateThm under equal-month year fractions', () => {
    const schedule = resolveLoanSchedule({
      principal: 12_000_000,
      annualRate: 0.0799,
      termMonths: 240
    })
    const payments = expandScheduleToMonthlyPayments(schedule)
    const monthly = computeThmPct({
      principal: 12_000_000,
      upfrontFees: 168_765,
      monthlyPayments: payments
    })
    const annex = calculateThm(
      buildThmFlowsFromMonthly({
        principal: 12_000_000,
        upfrontFees: 168_765,
        monthlyOutflows: payments.map((amount, index) => ({
          monthIndex: index + 1,
          amount
        }))
      })
    )

    expect(annex.rate * 100).toBeCloseTo(monthly.thmPct, 8)
  })

  it('raises THM when upfront fees reduce net proceeds', () => {
    const schedule = resolveLoanSchedule({
      principal: 12_000_000,
      annualRate: 0.0799,
      termMonths: 240
    })
    const payments = expandScheduleToMonthlyPayments(schedule)
    const zeroFee = computeThmPct({
      principal: 12_000_000,
      upfrontFees: 0,
      monthlyPayments: payments
    })
    const withFees = computeThmPct({
      principal: 12_000_000,
      upfrontFees: 168_765,
      monthlyPayments: payments
    })

    expect(withFees.thmPct).toBeGreaterThan(zeroFee.thmPct)
    expect(withFees.netProceeds).toBe(12_000_000 - 168_765)
  })

  it('expands grace then annuity payment vectors', () => {
    const schedule = resolveLoanSchedule({
      principal: 12_000_000,
      annualRate: 0.03,
      termMonths: 240,
      gracePeriodMonths: 12,
      capitalizeInterestAtGraceEnd: false
    })
    const payments = expandScheduleToMonthlyPayments(schedule)

    expect(payments).toHaveLength(240)
    expect(payments[0]).toBeCloseTo(schedule.graceInterestOnlyPayment, 8)
    expect(payments[12]).toBeCloseTo(schedule.monthlyInstallment, 8)
  })
})
