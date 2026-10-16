import { describe, expect, it } from 'vitest'
import {
  createLoanRepaymentPreview,
  generateLoanInstrumentCashFlows
} from '../src/finance_engine/engine'
import { CashFlowDirection } from '../src/finance_engine/models'
import { createLoanRepaymentPreview as createBrowserLoanPreview, generateLoanInstrumentBundle } from '../public/instruments.js'

describe('loan grace period and end-of-grace interest capitalization', () => {
  const baseInput = {
    principal: 12000,
    annualRate: 0.12,
    termMonths: 15,
    startDate: '2026-01-01',
    repaymentDayOfMonth: 1,
    includeDisbursement: true,
    category: 'loan'
  }

  it('keeps default annuity behavior when grace options are unset', () => {
    const preview = createLoanRepaymentPreview(baseInput)
    const flows = generateLoanInstrumentCashFlows(baseInput)
    const outflows = flows.filter((flow) => flow.direction === CashFlowDirection.Outflow)

    expect(preview.gracePeriodMonths).toBe(0)
    expect(preview.paymentCount).toBe(15)
    expect(preview.amortizationMonths).toBe(15)
    expect(preview.amortizingPrincipal).toBe(12000)
    expect(outflows).toHaveLength(15)
    expect(outflows.every((flow) => flow.amount === preview.monthlyInstallment)).toBe(true)
  })

  it('uses interest-only payments during grace when capitalization is off', () => {
    const preview = createLoanRepaymentPreview({
      ...baseInput,
      gracePeriodMonths: 3,
      capitalizeInterestAtGraceEnd: false
    })
    const flows = generateLoanInstrumentCashFlows({
      ...baseInput,
      gracePeriodMonths: 3,
      capitalizeInterestAtGraceEnd: false
    })
    const outflows = flows.filter((flow) => flow.direction === CashFlowDirection.Outflow)

    expect(preview.graceInterestOnlyPayment).toBeCloseTo(120, 8)
    expect(preview.monthlyInstallment).toBeCloseTo(1066.185464, 5)
    expect(preview.paymentCount).toBe(15)
    expect(preview.amortizingPrincipal).toBe(12000)
    expect(outflows).toHaveLength(15)
    expect(outflows.slice(0, 3).every((flow) => Math.abs(flow.amount - 120) < 1e-9)).toBe(true)
    expect(outflows.slice(3).every((flow) => Math.abs(flow.amount - preview.monthlyInstallment) < 1e-9)).toBe(
      true
    )
  })

  it('capitalizes unpaid grace interest and amortizes the higher principal', () => {
    const preview = createLoanRepaymentPreview({
      ...baseInput,
      gracePeriodMonths: 3,
      capitalizeInterestAtGraceEnd: true
    })
    const flows = generateLoanInstrumentCashFlows({
      ...baseInput,
      gracePeriodMonths: 3,
      capitalizeInterestAtGraceEnd: true
    })
    const outflows = flows.filter((flow) => flow.direction === CashFlowDirection.Outflow)

    expect(preview.amortizingPrincipal).toBeCloseTo(12363.612, 6)
    expect(preview.monthlyInstallment).toBeCloseTo(1098.49195, 5)
    expect(preview.graceInterestOnlyPayment).toBe(0)
    expect(preview.paymentCount).toBe(12)
    expect(outflows).toHaveLength(12)
    expect(outflows[0].date).toBe('2026-04-01')
    expect(outflows.every((flow) => Math.abs(flow.amount - preview.monthlyInstallment) < 1e-9)).toBe(true)
    expect(preview.totalInterest).toBeGreaterThan(
      createLoanRepaymentPreview({
        ...baseInput,
        gracePeriodMonths: 3,
        capitalizeInterestAtGraceEnd: false
      }).totalInterest
    )
  })

  it('rejects grace period that consumes the entire term', () => {
    expect(() =>
      createLoanRepaymentPreview({
        ...baseInput,
        gracePeriodMonths: 15
      })
    ).toThrow(/less than the loan term/i)
  })

  it('keeps browser loan path in parity with the TypeScript engine for capitalization', () => {
    const enginePreview = createLoanRepaymentPreview({
      ...baseInput,
      gracePeriodMonths: 3,
      capitalizeInterestAtGraceEnd: true
    })
    const browserPreview = createBrowserLoanPreview({
      principal: 12000,
      annualRate: 0.12,
      termMonths: 15,
      gracePeriodMonths: 3,
      capitalizeInterestAtGraceEnd: true
    })
    const bundle = generateLoanInstrumentBundle({
      label: 'Grace capitalize',
      principal: 12000,
      annualRate: 0.12,
      termValue: 15,
      termUnit: 'months',
      startDate: '2026-01-01',
      repaymentDayOfMonth: 1,
      gracePeriodMonths: 3,
      capitalizeInterestAtGraceEnd: true,
      includeDisbursement: true,
      category: 'loan'
    })

    expect(browserPreview.monthlyInstallment).toBeCloseTo(enginePreview.monthlyInstallment, 8)
    expect(browserPreview.totalInterest).toBeCloseTo(enginePreview.totalInterest, 8)
    expect(browserPreview.paymentCount).toBe(enginePreview.paymentCount)
    expect(bundle.config.gracePeriodMonths).toBe(3)
    expect(bundle.config.capitalizeInterestAtGraceEnd).toBe(true)
    expect(bundle.generatedFlows.filter((flow) => flow.direction === 'outflow')).toHaveLength(12)
  })
})
