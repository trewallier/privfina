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

describe('OTP Zöld product from Hirdetmény 2026-04-20', () => {
  const product = YAML.parse(
    readRepoFile('docs/product-specs/products/loans/otp-zold/product.yaml')
  ) as Record<string, any>
  const example = YAML.parse(
    readRepoFile(
      'docs/product-specs/products/loans/otp-zold/examples/hirdetmeny-representative-new-home.yaml'
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

  it('locks product identity, green discount, and contractual rates from the Hirdetmény', () => {
    expect(product.specVersion).toBe('v2alpha1')
    expect(product.family).toBe('mortgage-loan')
    expect(product.variant).toBe('otp-zold')
    expect(product.productCode).toBe('otp-zold')
    expect(product.engine.rateType).toBe('fixed')
    expect(product.engine.amortizationType).toBe('level-payment')
    expect(product.subsidy.type).toBe('none')
    expect(product.loanPurposes).toContain('new-home-purchase')
    expect(product.eligibilityRules.some((rule: string) => /green/i.test(rule))).toBe(true)

    const greenDiscount = product.discounts.find(
      (discount: { name: string }) => discount.name === 'zold-kamatkedvezmeny'
    )
    expect(greenDiscount).toMatchObject({
      type: 'rate-discount',
      value: 50,
      unit: 'bp'
    })

    const rateInput = product.inputs.find(
      (field: { name: string }) => field.name === 'annualInterestRatePct'
    )
    expect(rateInput.constraints.enum).toEqual([7.99, 8.49])
  })

  it('encodes Hirdetmény §6 representative example numbers exactly', () => {
    // Source: Lakáshitel_H_kondicio_20260420 §6 — OTP Zöld / új lakás vásárlás
    expect(example.inputs).toEqual({
      principal: 12_000_000,
      annualInterestRatePct: 7.99,
      termMonths: 240,
      startDate: '2026-04-01',
      loanPurpose: 'new-home-purchase'
    })
    expect(example.expected.paymentCount).toBe(240)
    expect(example.expected.monthlyPayment).toBe(101_128)
    expect(example.expected.totalPaid).toBe(24_360_086)
    expect(example.expected.totalCreditCostFees).toBe(89_365)
    expect(example.expected.thmPct).toBe(8.5)
    expect(example.expected.baseContractualAnnualRatePct).toBe(8.49)
    expect(example.expected.contractualAnnualRatePct).toBe(7.99)
    expect(example.expected.greenRateDiscountBp).toBe(50)
  })

  it('keeps published total paid consistent with installment sum plus fee package', () => {
    const installmentSum = example.expected.monthlyPayment * example.expected.paymentCount
    const reconstructed = installmentSum + example.expected.totalCreditCostFees
    expect(Math.abs(reconstructed - example.expected.totalPaid)).toBeLessThanOrEqual(1)
  })

  it('captures Zöld disbursement fee waiver and green-specific prepayment fee', () => {
    const waiver = product.discounts.find(
      (discount: { name: string }) => discount.name === 'otp-zold-folyositasi-dij-elengedes'
    )
    expect(waiver).toMatchObject({
      type: 'fee-waiver',
      value: 100,
      unit: 'percent'
    })

    const prepayment = product.fees.find(
      (fee: { name: string }) => fee.name === 'elotorlesztesi-dij'
    )
    expect(prepayment).toMatchObject({
      type: 'prepayment',
      value: 1,
      unit: 'percent',
      timing: 'on-event'
    })
  })

  it('generates a 240-payment fixed-rate schedule at the green customer 7.99% rate', () => {
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
