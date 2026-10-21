import { describe, expect, it } from 'vitest'
import { resolveLoanSchedule } from '../src/finance_engine/instruments/loan'
import {
  computeThmPct,
  expandScheduleToMonthlyPayments
} from '../src/finance_engine/instruments/thm'

describe('computeThmPct', () => {
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
