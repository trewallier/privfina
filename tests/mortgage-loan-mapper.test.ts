import { describe, expect, it } from 'vitest'
import {
  calculateMortgageLoanFromProductSpec,
  loadMortgageLoanProductSpecFromFiles
} from '../src/finance_engine/engine'

describe('mortgage-loan product_specs mapper', () => {
  it('loads otp-1x1 and computes offering-faithful schedule, fees, and THM', () => {
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
    expect(result.totalCreditCostFees).toBe(193_965)
    expect(result.monthlyPayment).toBeCloseTo(101_128, 5)
    expect(result.thmPct).toBe(8.6)
    expect(result.totalPaid).toBeCloseTo(result.totalRepayment + result.totalCreditCostFees, 8)
    expect(result.monthlyPayment).toBeCloseTo(result.schedule.monthlyInstallment, 8)
  })

  it('maps csok-plusz offering-packaged grace then annuity', () => {
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
    expect(result.graceInterestOnlyPayment).toBe(30_416)
    expect(result.monthlyPayment).toBeCloseTo(69_362, 5)
    expect(result.thmPct).toBe(3.3)
    expect(result.schedule.gracePeriodMonths).toBe(12)
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
