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

describe('Végig Fix product from Hirdetmény 2026-04-20', () => {
  const product = YAML.parse(
    readRepoFile('docs/product-specs/products/loans/vegig-fix/product.yaml')
  ) as Record<string, any>
  const example = YAML.parse(
    readRepoFile(
      'docs/product-specs/products/loans/vegig-fix/examples/hirdetmeny-representative-used-home.yaml'
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

  it('locks product identity and contractual rate from the Hirdetmény', () => {
    expect(product.specVersion).toBe('v2alpha1')
    expect(product.family).toBe('mortgage-loan')
    expect(product.variant).toBe('vegig-fix')
    expect(product.productCode).toBe('vegig-fix')
    expect(product.engine.rateType).toBe('fixed')
    expect(product.engine.amortizationType).toBe('level-payment')
    expect(product.subsidy.type).toBe('none')
    expect(product.loanPurposes).toContain('used-home-purchase')

    const rateInput = product.inputs.find(
      (field: { name: string }) => field.name === 'annualInterestRatePct'
    )
    expect(rateInput.constraints.enum).toEqual([8.49])
  })

  it('encodes Hirdetmény §6 representative example numbers exactly', () => {
    // Source: Lakáshitel_H_kondicio_20260420 §6 — Végig Fix / használt lakás vásárlás
    expect(example.inputs).toEqual({
      principal: 12_000_000,
      annualInterestRatePct: 8.49,
      termMonths: 240,
      startDate: '2026-04-01',
      loanPurpose: 'used-home-purchase'
    })
    expect(example.expected.paymentCount).toBe(240)
    expect(example.expected.monthlyPayment).toBe(104_960)
    expect(example.expected.totalPaid).toBe(25_384_365)
    expect(example.expected.totalCreditCostFees).toBe(193_965)
    expect(example.expected.thmPct).toBe(9.2)
    expect(example.expected.contractualAnnualRatePct).toBe(8.49)
  })

  it('keeps published total paid consistent with installment sum plus fee package', () => {
    const installmentSum = example.expected.monthlyPayment * example.expected.paymentCount
    const reconstructed = installmentSum + example.expected.totalCreditCostFees
    expect(Math.abs(reconstructed - example.expected.totalPaid)).toBeLessThanOrEqual(1)
  })

  it('captures partial disbursement fee reduction from the Díjkedvezményes akció', () => {
    const partialWaiver = product.discounts.find(
      (discount: { name: string }) =>
        discount.name === 'otp-dijkedvezmenyes-folyositasi-dij-csokkentes'
    )
    expect(partialWaiver).toMatchObject({
      type: 'fee-waiver',
      value: 87.5,
      unit: 'percent'
    })

    const disbursement = product.fees.find(
      (fee: { name: string }) => fee.name === 'folyositasi-dij'
    )
    expect(disbursement).toMatchObject({
      type: 'disbursement',
      value: 0.75,
      unit: 'percent',
      timing: 'upfront'
    })
  })

  it('generates a 240-payment fixed-rate schedule at the contractual 8.49% rate', () => {
    const annualRate = example.inputs.annualInterestRatePct / 100
    const schedule = resolveLoanSchedule({
      principal: example.inputs.principal,
      annualRate,
      termMonths: example.inputs.termMonths
    })

    expect(schedule.paymentCount).toBe(240)
    expect(schedule.gracePeriodMonths).toBe(0)
    expect(schedule.monthlyInstallment).toBeCloseTo(
      calculateLoanMonthlyInstallment(
        example.inputs.principal,
        annualRate,
        example.inputs.termMonths
      ),
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

    const outflows = flows.filter((flow) => flow.direction === 'outflow')
    expect(outflows).toHaveLength(240)
    expect(outflows[0].amount).toBeCloseTo(schedule.monthlyInstallment, 8)
    expect(outflows.every((flow) => flow.amount === outflows[0].amount)).toBe(true)
  })
})
