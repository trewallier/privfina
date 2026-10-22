import { describe, expect, it } from 'vitest'
import {
  calculateMortgageLoanFromProductSpec,
  loadMortgageLoanProductSpecFromFiles
} from '../src/finance_engine/engine'

describe('mortgage-loan product_specs mapper', () => {
  it('loads otp-1x1 and computes schedule at stated rate, fees, and ADR 0022 THM', () => {
    const product = loadMortgageLoanProductSpecFromFiles({ productCode: 'otp-1x1' })
    const result = calculateMortgageLoanFromProductSpec(product, {
      principal: 12_000_000,
      annualInterestRatePct: 7.99,
      termMonths: 240,
      startDate: '2026-04-01',
      loanPurpose: 'used-home-purchase'
    })

    expect(result.productCode).toBe('otp-1x1')
    expect(result.productSpecVersion).toBe('v2alpha1')
    expect(result.paymentCount).toBe(240)
    expect(result.graceInterestOnlyPayment).toBeUndefined()
    expect(result.totalCreditCostFees).toBe(90_000 + 58_765 + 20_000)
    expect(result.totalPaid).toBeCloseTo(result.totalRepayment + result.totalCreditCostFees, 8)
    // Stated-rate annuity (not the published 101 128 Ft packaging figure).
    expect(result.monthlyPayment).toBeCloseTo(100_298.13848711438, 8)
    // ADR 0022 percentRounded from engine schedule + fees (not yet the published 8.6).
    expect(result.thmPct).toBe(8.5)
    expect(result.monthlyPayment).toBeCloseTo(result.schedule.monthlyInstallment, 8)
  })

  it('maps csok-plusz grace then annuity from engine metadata at the stated rate', () => {
    const product = loadMortgageLoanProductSpecFromFiles({ productCode: 'csok-plusz' })
    const result = calculateMortgageLoanFromProductSpec(product, {
      principal: 12_000_000,
      annualInterestRatePct: 3,
      transactionalAnnualRatePct: 7.87,
      termMonths: 240,
      startDate: '2026-04-01',
      gracePeriodMonths: 12,
      loanPurpose: 'used-home-purchase'
    })

    expect(result.paymentCount).toBe(240)
    expect(result.graceInterestOnlyPayment).toBeCloseTo((12_000_000 * 0.03) / 12, 8)
    expect(result.schedule.gracePeriodMonths).toBe(12)
    expect(result.monthlyPayment).toBeGreaterThan(result.graceInterestOnlyPayment!)
    expect(result.thmPct).toBe(3.2)
  })

  it('applies otp-zold folyósítási waiver when discount is activated', () => {
    const product = loadMortgageLoanProductSpecFromFiles({ productCode: 'otp-zold' })
    const without = calculateMortgageLoanFromProductSpec(product, {
      principal: 12_000_000,
      annualInterestRatePct: 7.99,
      termMonths: 240,
      startDate: '2026-04-01',
      loanPurpose: 'new-home-purchase'
    })
    const withWaiver = calculateMortgageLoanFromProductSpec(product, {
      principal: 12_000_000,
      annualInterestRatePct: 7.99,
      termMonths: 240,
      startDate: '2026-04-01',
      loanPurpose: 'new-home-purchase',
      activeDiscountNames: ['otp-zold-folyositasi-dij-elengedes']
    })

    expect(withWaiver.totalCreditCostFees).toBeLessThan(without.totalCreditCostFees)
  })
})
