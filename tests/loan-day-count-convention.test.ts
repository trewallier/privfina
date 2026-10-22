import { describe, expect, it } from 'vitest'
import {
  ACT_360_YEAR_DAYS,
  ACT_365_YEAR_DAYS,
  ACT_366_YEAR_DAYS,
  EQUAL_MONTH_DAYS_LEAP,
  EQUAL_MONTH_DAYS_NON_LEAP,
  calculateLoanMonthlyInstallment,
  monthlyInterestRateFromAnnual,
  resolveLoanSchedule
} from '../src/finance_engine/instruments/loan'

describe('loan interest day-count conventions (ADR 0025)', () => {
  it('defaults to 30/360 (r/12)', () => {
    expect(monthlyInterestRateFromAnnual(0.0799)).toBeCloseTo(0.0799 / 12, 12)
    expect(monthlyInterestRateFromAnnual(0.0799, '30/360')).toBeCloseTo(0.0799 / 12, 12)
    expect(calculateLoanMonthlyInstallment(12_000_000, 0.0799, 240)).toBeCloseTo(
      100298.13848711438,
      8
    )
  })

  it('ACT/360 equal-month matches OTP formula r×(365/12)/360 and Hirdetmény installments', () => {
    expect(EQUAL_MONTH_DAYS_NON_LEAP).toBeCloseTo(365 / 12, 12)
    expect(monthlyInterestRateFromAnnual(0.0799, 'act/360')).toBeCloseTo(
      (0.0799 * EQUAL_MONTH_DAYS_NON_LEAP) / ACT_360_YEAR_DAYS,
      12
    )
    // kamat = tőke × r × (365/12) / 360
    expect(12_000_000 * monthlyInterestRateFromAnnual(0.03, 'act/360')).toBeCloseTo(
      12_000_000 * 0.03 * (365 / 12) / 360,
      8
    )

    expect(
      calculateLoanMonthlyInstallment(12_000_000, 0.0799, 240, {
        interestDayCountConvention: 'act/360',
        paymentRounding: 'forint'
      })
    ).toBe(101128)
    expect(
      calculateLoanMonthlyInstallment(12_000_000, 0.0849, 240, {
        interestDayCountConvention: 'act/360',
        paymentRounding: 'forint'
      })
    ).toBe(104960)
    expect(
      calculateLoanMonthlyInstallment(12_000_000, 0.03, 240, {
        interestDayCountConvention: 'act/360',
        paymentRounding: 'forint'
      })
    ).toBe(66802)
  })

  it('ACT/365 and ACT/366 equal-month factors equal r/12 (leap years do not change installments)', () => {
    expect(monthlyInterestRateFromAnnual(0.0799, 'act/365')).toBeCloseTo(
      (0.0799 * EQUAL_MONTH_DAYS_NON_LEAP) / ACT_365_YEAR_DAYS,
      12
    )
    expect(monthlyInterestRateFromAnnual(0.0799, 'act/365')).toBeCloseTo(0.0799 / 12, 12)
    expect(monthlyInterestRateFromAnnual(0.0799, 'act/366')).toBeCloseTo(
      (0.0799 * EQUAL_MONTH_DAYS_LEAP) / ACT_366_YEAR_DAYS,
      12
    )
    expect(monthlyInterestRateFromAnnual(0.0799, 'act/366')).toBeCloseTo(0.0799 / 12, 12)
    expect(
      calculateLoanMonthlyInstallment(12_000_000, 0.0799, 240, {
        interestDayCountConvention: 'act/365',
        paymentRounding: 'forint'
      })
    ).toBe(
      calculateLoanMonthlyInstallment(12_000_000, 0.0799, 240, {
        interestDayCountConvention: '30/360',
        paymentRounding: 'forint'
      })
    )
  })

  it('floors ACT/360 grace interest-only payments to whole forints', () => {
    const schedule = resolveLoanSchedule({
      principal: 12_000_000,
      annualRate: 0.03,
      termMonths: 240,
      gracePeriodMonths: 12,
      interestDayCountConvention: 'act/360',
      paymentRounding: 'forint'
    })
    expect(schedule.graceInterestOnlyPayment).toBe(30416)
    expect(schedule.monthlyInstallment).toBe(69362)
    expect(schedule.paymentCount).toBe(240)
  })
})
