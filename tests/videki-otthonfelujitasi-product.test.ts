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

describe('Vidéki Otthonfelújítási product from Hirdetmény 2026-04-20', () => {
  const product = YAML.parse(
    readRepoFile('docs/product-specs/products/loans/videki-otthonfelujitasi/product.yaml')
  ) as Record<string, any>
  const example = YAML.parse(
    readRepoFile(
      'docs/product-specs/products/loans/videki-otthonfelujitasi/examples/hirdetmeny-representative-renovation.yaml'
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

  it('locks subsidized Vidéki Otthonfelújítási identity and 10-year subsidy horizon', () => {
    expect(product.productCode).toBe('videki-otthonfelujitasi')
    expect(product.family).toBe('mortgage-loan')
    expect(product.engine.rateType).toBe('state-subsidized')
    expect(product.subsidy).toMatchObject({
      type: 'state-interest-subsidy',
      customerRate: 0.0487,
      subsidyDurationMonths: 120
    })
    expect(product.loanPurposes).toEqual(['renovation', 'modernization'])
    expect(product.discounts).toEqual([])
  })

  it('encodes Hirdetmény §6 representative example numbers exactly', () => {
    expect(example.inputs).toEqual({
      principal: 12_000_000,
      annualInterestRatePct: 4.87,
      transactionalAnnualRatePct: 7.87,
      termMonths: 120,
      startDate: '2026-04-01',
      loanPurpose: 'renovation'
    })
    expect(example.expected.paymentCount).toBe(120)
    expect(example.expected.monthlyPayment).toBe(63_457)
    expect(example.expected.totalPaid).toBe(7_731_977)
    expect(example.expected.totalCreditCostFees).toBe(117_145)
    expect(example.expected.thmPct).toBe(5.5)
    expect(example.expected.fixedSubsidyPp).toBe(3)
  })

  it('keeps published total paid consistent with installment sum plus fees', () => {
    const reconstructed =
      example.expected.monthlyPayment * example.expected.paymentCount +
      example.expected.totalCreditCostFees
    expect(Math.abs(reconstructed - example.expected.totalPaid)).toBeLessThanOrEqual(10)
  })

  it('generates a 120-payment fixed-rate schedule at the 4.87% customer rate', () => {
    const annualRate = example.inputs.annualInterestRatePct / 100
    const schedule = resolveLoanSchedule({
      principal: example.inputs.principal,
      annualRate,
      termMonths: example.inputs.termMonths
    })
    expect(schedule.paymentCount).toBe(120)
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
    expect(flows.filter((flow) => flow.direction === 'outflow')).toHaveLength(120)
  })
})
