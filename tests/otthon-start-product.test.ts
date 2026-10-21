import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Ajv2020 from 'ajv/dist/2020'
import YAML from 'yaml'
import {
  generateLoanInstrumentCashFlows,
  resolveLoanSchedule
} from '../src/finance_engine/engine'

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

describe('Otthon Start product from Hirdetmény 2026-04-20', () => {
  const product = YAML.parse(
    readRepoFile('docs/product-specs/products/loans/otthon-start/product.yaml')
  ) as Record<string, any>
  const example = YAML.parse(
    readRepoFile(
      'docs/product-specs/products/loans/otthon-start/examples/hirdetmeny-representative-home-purchase.yaml'
    )
  ) as Record<string, any>
  const productSchema = JSON.parse(
    readRepoFile('docs/product-specs/schema/v2/product.schema.json')
  )
  const exampleSchema = JSON.parse(
    readRepoFile('docs/product-specs/schema/v2/example.schema.json')
  )

  it('validates the product.yaml against schema v2', () => {
    const ajv = new Ajv2020({ allErrors: true, strict: false })
    const validate = ajv.compile(productSchema)
    expect(validate(product), JSON.stringify(validate.errors)).toBe(true)
  })

  it('validates the Hirdetmény representative example against example schema v2', () => {
    const ajv = new Ajv2020({ allErrors: true, strict: false })
    const validate = ajv.compile(exampleSchema)
    expect(validate(example), JSON.stringify(validate.errors)).toBe(true)
  })

  it('locks subsidized Otthon Start identity and 5-year interest period', () => {
    expect(product.productCode).toBe('otthon-start')
    expect(product.family).toBe('mortgage-loan')
    expect(product.engine).toMatchObject({
      rateType: 'state-subsidized',
      amortizationType: 'interest-only-then-annuity',
      interestPeriodMonths: 60,
      gracePeriodMonths: 12
    })
    expect(product.subsidy).toMatchObject({
      type: 'state-interest-subsidy',
      customerRate: 0.03,
      subsidyDurationMonths: 300
    })
    expect(
      product.discounts.find(
        (discount: { name: string }) =>
          discount.name === 'otp-dijkedvezmenyes-folyositasi-dij-elengedes'
      )
    ).toMatchObject({ type: 'fee-waiver', value: 100, unit: 'percent' })
  })

  it('encodes Hirdetmény §6 representative example numbers exactly', () => {
    expect(example.inputs).toEqual({
      principal: 12_000_000,
      annualInterestRatePct: 3,
      transactionalAnnualRatePct: 7.87,
      termMonths: 240,
      startDate: '2026-04-01',
      gracePeriodMonths: 12,
      loanPurpose: 'new-home-purchase'
    })
    expect(example.expected.paymentCount).toBe(240)
    expect(example.expected.graceInterestOnlyPayment).toBe(30_416)
    expect(example.expected.monthlyPayment).toBe(69_362)
    expect(example.expected.amortizingFromMonth).toBe(13)
    expect(example.expected.totalPaid).toBe(16_313_440)
    expect(example.expected.totalCreditCostFees).toBe(133_965)
    expect(example.expected.thmPct).toBe(3.2)
  })

  it('keeps published total paid consistent with grace + amortizing installments plus fees', () => {
    const graceMonths = 12
    const amortizingMonths = example.expected.paymentCount - graceMonths
    const installmentSum =
      example.expected.graceInterestOnlyPayment * graceMonths +
      example.expected.monthlyPayment * amortizingMonths
    const reconstructed = installmentSum + example.expected.totalCreditCostFees
    expect(Math.abs(reconstructed - example.expected.totalPaid)).toBeLessThanOrEqual(100)
  })

  it('generates a 12-month interest-only then 228-month annuity schedule at 3% customer rate', () => {
    const annualRate = example.inputs.annualInterestRatePct / 100
    const schedule = resolveLoanSchedule({
      principal: example.inputs.principal,
      annualRate,
      termMonths: example.inputs.termMonths,
      gracePeriodMonths: example.inputs.gracePeriodMonths,
      capitalizeInterestAtGraceEnd: false
    })

    expect(schedule.paymentCount).toBe(240)
    expect(schedule.gracePeriodMonths).toBe(12)
    expect(schedule.amortizationMonths).toBe(228)
    expect(schedule.graceInterestOnlyPayment).toBeCloseTo(30_000, 8)

    const flows = generateLoanInstrumentCashFlows({
      principal: example.inputs.principal,
      annualRate,
      termMonths: example.inputs.termMonths,
      startDate: example.inputs.startDate,
      repaymentDayOfMonth: 1,
      gracePeriodMonths: example.inputs.gracePeriodMonths,
      capitalizeInterestAtGraceEnd: false,
      includeDisbursement: false,
      category: 'loan'
    })

    const outflows = flows.filter((flow) => flow.direction === 'outflow')
    expect(outflows).toHaveLength(240)
    expect(outflows[0].amount).toBeCloseTo(schedule.graceInterestOnlyPayment, 8)
    expect(outflows[12].amount).toBeCloseTo(schedule.monthlyInstallment, 8)
  })
})
