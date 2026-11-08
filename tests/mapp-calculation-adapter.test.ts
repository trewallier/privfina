import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import YAML from 'yaml'
import {
  calculateMappFromSpecInputs,
  mapMappSpecInputsToLegacyInvestmentInput,
  mapLegacyMappPreviewToSpecOutputs
} from '../public/controller/mapp-calculation-adapter.js'

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

describe('mapp calculation adapter seam', () => {
  it('bridges MÁP Plusz example inputs and returns ADR 0038 spec-shaped outputs', () => {
    const exampleYaml = readRepoFile(
      'docs/product-specs/products/government-securities/mapp/examples/nominal-case.yaml'
    )
    const parsed = YAML.parse(exampleYaml) as any

    expect(exampleYaml).toContain('principal: 1000000')
    expect(exampleYaml).toContain('annualCouponRatePct: 5.0')
    expect(exampleYaml).toContain('maturityDate: 2031-11-27')
    expect(exampleYaml).toContain('couponFrequencyMonths: 12')
    expect(exampleYaml).not.toContain('startDate:')

    const adapterOutputs = calculateMappFromSpecInputs(parsed.inputs)
    const legacyInput = mapMappSpecInputsToLegacyInvestmentInput(parsed.inputs)
    const expectedSpecOutputs = mapLegacyMappPreviewToSpecOutputs(null, parsed.inputs)

    expect(legacyInput.dueDate).toBe(parsed.inputs.maturityDate)
    expect(adapterOutputs).toEqual(expectedSpecOutputs)
    expect(adapterOutputs).toMatchObject(parsed.expected)
    expect(adapterOutputs).toMatchObject({
      annualCouponRatePct: expect.any(Number),
      accruedInterestAmount: expect.any(Number),
      purchaseAmount: expect.any(Number)
    })
    expect(Object.keys(adapterOutputs).sort()).toEqual(
      ['annualCouponRatePct', 'accruedInterestAmount', 'purchaseAmount'].sort()
    )
  })

  it('bridges stepped-coupon-case example with published effective coupon', () => {
    const exampleYaml = readRepoFile(
      'docs/product-specs/products/government-securities/mapp/examples/stepped-coupon-case.yaml'
    )
    const parsed = YAML.parse(exampleYaml) as {
      inputs: Record<string, unknown>
      expected: Record<string, number>
    }

    const adapterOutputs = calculateMappFromSpecInputs(parsed.inputs)

    expect(adapterOutputs.annualCouponRatePct).toBe(parsed.expected.annualCouponRatePct)
    expect(adapterOutputs.accruedInterestAmount).toBeCloseTo(
      parsed.expected.accruedInterestAmount,
      10
    )
    expect(adapterOutputs.purchaseAmount).toBeCloseTo(parsed.expected.purchaseAmount, 10)
  })

  it('bridges mid-period-after-coupon accrual from last payment not year-band from', () => {
    const exampleYaml = readRepoFile(
      'docs/product-specs/products/government-securities/mapp/examples/mid-period-after-coupon-case.yaml'
    )
    const parsed = YAML.parse(exampleYaml) as {
      inputs: Record<string, unknown>
      expected: Record<string, number>
    }

    const adapterOutputs = calculateMappFromSpecInputs(parsed.inputs)

    expect(adapterOutputs.annualCouponRatePct).toBe(parsed.expected.annualCouponRatePct)
    expect(adapterOutputs.accruedInterestAmount).toBeCloseTo(
      parsed.expected.accruedInterestAmount,
      10
    )
    expect(adapterOutputs.purchaseAmount).toBeCloseTo(parsed.expected.purchaseAmount, 10)
  })
})
