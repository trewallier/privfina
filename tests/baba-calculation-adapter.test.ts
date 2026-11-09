import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import YAML from 'yaml'
import { calculateBabaFromSpecInputs } from '../public/controller/baba-calculation-adapter.js'

function readExample(relativePath: string): {
  inputs: Record<string, unknown>
  expected: Record<string, number>
} {
  return YAML.parse(readFileSync(resolve(process.cwd(), relativePath), 'utf8')) as {
    inputs: Record<string, unknown>
    expected: Record<string, number>
  }
}

describe('baba calculation adapter', () => {
  it('matches nominal-case YAML expected outputs', () => {
    const { inputs, expected } = readExample(
      'docs/product-specs/products/government-securities/baba/examples/nominal-case.yaml'
    )
    expect(calculateBabaFromSpecInputs(inputs)).toMatchObject(expected)
  })

  it('matches mid-period-accrued-case YAML expected outputs', () => {
    const { inputs, expected } = readExample(
      'docs/product-specs/products/government-securities/baba/examples/mid-period-accrued-case.yaml'
    )
    const outputs = calculateBabaFromSpecInputs(inputs)
    expect(outputs.annualCouponRatePct).toBe(expected.annualCouponRatePct)
    expect(outputs.accruedInterestAmount).toBeCloseTo(expected.accruedInterestAmount, 10)
    expect(outputs.purchaseAmount).toBeCloseTo(expected.purchaseAmount, 10)
  })
})
