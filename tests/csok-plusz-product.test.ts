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

describe('CSOK Plusz product from Hirdetmény 2026-04-20', () => {
  const product = YAML.parse(
    readRepoFile('docs/product-specs/products/loans/csok-plusz/product.yaml')
  ) as Record<string, any>
  const example = YAML.parse(
    readRepoFile(
      'docs/product-specs/products/loans/csok-plusz/examples/hirdetmeny-representative-home-purchase.yaml'
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

  it('locks subsidized identity, grace, and subsidy blocks from the Hirdetmény', () => {
    expect(product.specVersion).toBe('v2alpha1')
    expect(product.family).toBe('mortgage-loan')
    expect(product.variant).toBe('csok-plusz')
    expect(product.productCode).toBe('csok-plusz')
    expect(product.engine).toMatchObject({
      rateType: 'state-subsidized',
      amortizationType: 'interest-only-then-annuity',
      paymentFrequency: 'monthly',
      gracePeriodMonths: 12,
      interestPeriodMonths: 12
    })
    expect(product.subsidy).toMatchObject({
      type: 'state-interest-subsidy',
      customerRate: 0.03,
      subsidyDurationMonths: 300
    })
    expect(product.loanPurposes).toEqual(
      expect.arrayContaining(['used-home-purchase', 'new-home-purchase', 'extension'])
    )

    const customerRate = product.inputs.find(
      (field: { name: string }) => field.name === 'annualInterestRatePct'
    )
    expect(customerRate.constraints.enum).toEqual([3])

    const graceInput = product.inputs.find(
      (field: { name: string }) => field.name === 'gracePeriodMonths'
    )
    expect(graceInput.constraints.enum).toEqual([12])
  })

  it('encodes Hirdetmény §6 representative example numbers exactly', () => {
    // Source: Lakáshitel_H_kondicio_20260420 §6 — OTP Évnyerő CSOK Plusz / új/használt lakás vásárlás
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
    expect(example.expected.totalPaid).toBe(16_373_440)
    expect(example.expected.totalCreditCostFees).toBe(193_965)
    expect(example.expected.thmPct).toBe(3.3)
    expect(example.expected.contractualAnnualRatePct).toBe(3)
    expect(example.expected.transactionalAnnualRatePct).toBe(7.87)
    expect(example.expected.subsidyDurationMonths).toBe(300)
  })

  it('keeps published total paid consistent with grace + amortizing installments plus fees', () => {
    const graceMonths = 12
    const amortizingMonths = example.expected.paymentCount - graceMonths
    const installmentSum =
      example.expected.graceInterestOnlyPayment * graceMonths +
      example.expected.monthlyPayment * amortizingMonths
    const reconstructed = installmentSum + example.expected.totalCreditCostFees
    // Flat published installments can differ by a few forints from the Hirdetmény total
    // because of end-of-term rounding in the bank packaging.
    expect(Math.abs(reconstructed - example.expected.totalPaid)).toBeLessThanOrEqual(100)
  })

  it('captures CSOK Plusz disbursement fee cap and 1% prepayment fee', () => {
    const disbursement = product.fees.find(
      (fee: { name: string }) => fee.name === 'folyositasi-dij'
    )
    expect(disbursement).toMatchObject({
      type: 'disbursement',
      value: 0.75,
      unit: 'percent',
      timing: 'upfront'
    })
    expect(disbursement.description).toMatch(/300\.000/)

    const prepayment = product.fees.find(
      (fee: { name: string }) => fee.name === 'elotorlesztesi-dij'
    )
    expect(prepayment).toMatchObject({
      type: 'prepayment',
      value: 1,
      unit: 'percent'
    })
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
    expect(outflows[11].amount).toBeCloseTo(schedule.graceInterestOnlyPayment, 8)
    expect(outflows[12].amount).toBeCloseTo(schedule.monthlyInstallment, 8)
    expect(outflows[239].amount).toBeCloseTo(schedule.monthlyInstallment, 8)
  })
})
