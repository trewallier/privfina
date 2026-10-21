import { describe, expect, it } from 'vitest'
import { resolveMortgageCustomerRate } from '../src/finance_engine/instruments/loan_subsidy'

describe('resolveMortgageCustomerRate', () => {
  it('uses input percent rate for market products', () => {
    const resolved = resolveMortgageCustomerRate({
      annualInterestRatePct: 7.99,
      subsidy: { type: 'none' }
    })

    expect(resolved.annualRate).toBeCloseTo(0.0799, 10)
    expect(resolved.annualInterestRatePct).toBe(7.99)
    expect(resolved.isStateSubsidized).toBe(false)
  })

  it('keeps customer input rate for subsidized products and records subsidy metadata', () => {
    const resolved = resolveMortgageCustomerRate({
      annualInterestRatePct: 3,
      transactionalAnnualRatePct: 7.87,
      subsidy: {
        type: 'state-interest-subsidy',
        customerRate: 0.03,
        subsidyDurationMonths: 300
      }
    })

    expect(resolved.annualRate).toBeCloseTo(0.03, 10)
    expect(resolved.isStateSubsidized).toBe(true)
    expect(resolved.subsidyCustomerRatePct).toBeCloseTo(3, 10)
    expect(resolved.subsidyDurationMonths).toBe(300)
    expect(resolved.transactionalAnnualRatePct).toBe(7.87)
  })

  it('applies rate-discount basis points to the customer percent rate', () => {
    const resolved = resolveMortgageCustomerRate({
      annualInterestRatePct: 8.49,
      rateDiscountBp: 50
    })

    expect(resolved.annualInterestRatePct).toBeCloseTo(7.99, 10)
    expect(resolved.annualRate).toBeCloseTo(0.0799, 10)
  })

  it('throws when subsidized input rate disagrees with subsidy.customerRate', () => {
    expect(() =>
      resolveMortgageCustomerRate({
        annualInterestRatePct: 3.5,
        subsidy: {
          type: 'state-interest-subsidy',
          customerRate: 0.03,
          subsidyDurationMonths: 300
        }
      })
    ).toThrow(/must match subsidy\.customerRate/)
  })

  it('allows rate discounts after a matching subsidized customer rate', () => {
    const resolved = resolveMortgageCustomerRate({
      annualInterestRatePct: 3,
      rateDiscountBp: 50,
      subsidy: {
        type: 'state-interest-subsidy',
        customerRate: 0.03,
        subsidyDurationMonths: 300
      }
    })

    expect(resolved.subsidyCustomerRatePct).toBeCloseTo(3, 10)
    expect(resolved.annualInterestRatePct).toBeCloseTo(2.5, 10)
  })
})
