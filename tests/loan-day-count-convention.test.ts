import { describe, expect, it } from 'vitest'
import {
  calculateLoanMonthlyInstallment,
  monthlyInterestRateFromAnnual,
  resolveLoanSchedule
} from '../src/finance_engine/instruments/loan'

describe('loan interest day-count convention (ADR 0025)', () => {
  it('defaults to nominal-12 monthly rate', () => {
    expect(monthlyInterestRateFromAnnual(0.0799)).toBeCloseTo(0.0799 / 12, 12)
    expect(calculateLoanMonthlyInstallment(12_000_000, 0.0799, 240)).toBeCloseTo(
      100298.13848711438,
      8
    )
  })

  it('applies 365-over-360 monthly factor and forint rounding for Hirdetmény installments', () => {
    expect(monthlyInterestRateFromAnnual(0.0799, '365-over-360')).toBeCloseTo(
      (0.0799 * 365) / (360 * 12),
      12
    )
    expect(
      calculateLoanMonthlyInstallment(12_000_000, 0.0799, 240, {
        interestDayCountConvention: '365-over-360',
        paymentRounding: 'forint'
      })
    ).toBe(101128)
    expect(
      calculateLoanMonthlyInstallment(12_000_000, 0.0849, 240, {
        interestDayCountConvention: '365-over-360',
        paymentRounding: 'forint'
      })
    ).toBe(104960)
    expect(
      calculateLoanMonthlyInstallment(12_000_000, 0.03, 240, {
        interestDayCountConvention: '365-over-360',
        paymentRounding: 'forint'
      })
    ).toBe(66802)
  })

  it('floors grace interest-only payments to whole forints under forint rounding', () => {
    const schedule = resolveLoanSchedule({
      principal: 12_000_000,
      annualRate: 0.03,
      termMonths: 240,
      gracePeriodMonths: 12,
      interestDayCountConvention: '365-over-360',
      paymentRounding: 'forint'
    })
    expect(schedule.graceInterestOnlyPayment).toBe(30416)
    expect(schedule.monthlyInstallment).toBe(69362)
    expect(schedule.paymentCount).toBe(240)
  })
})
