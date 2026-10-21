import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Ajv2020 from 'ajv/dist/2020'
import YAML from 'yaml'
import {
  calculateLoanMonthlyInstallment,
  generateLoanInstrumentCashFlows,
  resolveLoanSchedule
} from '../src/finance_engine/engine'

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

describe('Falusi CSOK product from Hirdetmény 2026-04-20', () => {
  const product = YAML.parse(
    readRepoFile('docs/product-specs/products/loans/falusi-csok/product.yaml')
  ) as Record<string, any>
  const example = YAML.parse(
    readRepoFile(
      'docs/product-specs/products/loans/falusi-csok/examples/hirdetmeny-representative-used-home.yaml'
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

  it('locks subsidized Falusi CSOK identity from the Hirdetmény', () => {
    expect(product.productCode).toBe('falusi-csok')
    expect(product.family).toBe('mortgage-loan')
    expect(product.engine.rateType).toBe('state-subsidized')
    expect(product.engine.amortizationType).toBe('level-payment')
    expect(product.subsidy).toMatchObject({
      type: 'state-interest-subsidy',
      customerRate: 0.03,
      subsidyDurationMonths: 300
    })
    expect(product.fees.find((fee: { name: string }) => fee.name === 'folyositasi-dij')).toMatchObject({
      value: 1,
      unit: 'percent'
    })
  })

  it('encodes Hirdetmény §6 representative example numbers exactly', () => {
    expect(example.inputs).toEqual({
      principal: 12_000_000,
      annualInterestRatePct: 3,
      transactionalAnnualRatePct: 8.18,
      termMonths: 240,
      startDate: '2026-04-01',
      loanPurpose: 'used-home-purchase'
    })
    expect(example.expected.paymentCount).toBe(240)
    expect(example.expected.monthlyPayment).toBe(66_802)
    expect(example.expected.totalPaid).toBe(16_256_448)
    expect(example.expected.totalCreditCostFees).toBe(223_965)
    expect(example.expected.thmPct).toBe(3.3)
  })

  it('keeps published total paid consistent with installment sum plus fees', () => {
    const reconstructed =
      example.expected.monthlyPayment * example.expected.paymentCount +
      example.expected.totalCreditCostFees
    expect(Math.abs(reconstructed - example.expected.totalPaid)).toBeLessThanOrEqual(5)
  })

  it('generates a 240-payment fixed-rate schedule at the 3% customer rate', () => {
    const annualRate = example.inputs.annualInterestRatePct / 100
    const schedule = resolveLoanSchedule({
      principal: example.inputs.principal,
      annualRate,
      termMonths: example.inputs.termMonths
    })
    expect(schedule.paymentCount).toBe(240)
    expect(schedule.monthlyInstallment).toBeCloseTo(
      calculateLoanMonthlyInstallment(example.inputs.principal, annualRate, example.inputs.termMonths),
      8
    )

    const flows = generateLoanInstrumentCashFlows({
      principal: example.inputs.principal,
      annualRate,
      termMonths: example.inputs.termMonths,
      startDate: example.inputs.startDate,
      repaymentDayOfMonth: 1,
      includeDisbursement: false,
      category: 'loan'
    })
    expect(flows.filter((flow) => flow.direction === 'outflow')).toHaveLength(240)
  })
})
