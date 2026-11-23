import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import YAML from 'yaml'
import { calculateKtvFromSpecInputs } from '../public/controller/ktv-calculation-adapter.js'

function readExample(relativePath: string): {
  inputs: Record<string, unknown>
  expected: Record<string, number>
} {
  return YAML.parse(readFileSync(resolve(process.cwd(), relativePath), 'utf8')) as {
    inputs: Record<string, unknown>
    expected: Record<string, number>
  }
}

describe('ktv calculation adapter', () => {
  it('matches nominal-case YAML expected outputs', () => {
    const { inputs, expected } = readExample(
      'docs/product-specs/products/government-securities/ktv/examples/nominal-case.yaml'
    )
    expect(calculateKtvFromSpecInputs(inputs)).toMatchObject(expected)
  })

  it('matches first-period-coupon-case keeping published ga', () => {
    const { inputs, expected } = readExample(
      'docs/product-specs/products/government-securities/ktv/examples/first-period-coupon-case.yaml'
    )
    const outputs = calculateKtvFromSpecInputs(inputs)
    expect(outputs.annualCouponRatePct).toBe(expected.annualCouponRatePct)
    expect(outputs.accruedInterestAmount).toBe(0)
    expect(outputs.purchaseAmount).toBe(Number(inputs.principal))
  })

  it('matches mid-period-accrued-case YAML expected outputs', () => {
    const { inputs, expected } = readExample(
      'docs/product-specs/products/government-securities/ktv/examples/mid-period-accrued-case.yaml'
    )
    const outputs = calculateKtvFromSpecInputs(inputs)
    expect(outputs.annualCouponRatePct).toBe(expected.annualCouponRatePct)
    expect(outputs.accruedInterestAmount).toBeCloseTo(expected.accruedInterestAmount, 10)
    expect(outputs.purchaseAmount).toBeCloseTo(expected.purchaseAmount, 10)
  })

  it('FLOAT 2027/B with periodMonths uses ACT/360 accrual (zero on period turn)', () => {
    const { inputs, expected } = readExample(
      'docs/product-specs/products/government-securities/ktv/examples/float-2027b-case.yaml'
    )
    const outputs = calculateKtvFromSpecInputs({ ...inputs, periodMonths: 3 })
    expect(outputs.annualCouponRatePct).toBe(expected.annualCouponRatePct)
    expect(outputs.accruedInterestAmount).toBe(0)
    expect(outputs.purchaseAmount).toBe(expected.purchaseAmount)
  })
})
