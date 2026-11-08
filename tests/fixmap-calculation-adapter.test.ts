import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import YAML from 'yaml'
import {
  calculateFixmapFromSpecInputs,
  mapFixmapSpecInputsToLegacyInvestmentInput,
  mapLegacyFixmapPreviewToSpecOutputs
} from '../public/controller/fixmap-calculation-adapter.js'

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

describe('fixmap calculation adapter seam', () => {
  it('bridges FixMÁP example inputs and returns ADR 0038 spec-shaped outputs', () => {
    const exampleYaml = readRepoFile(
      'docs/product-specs/products/government-securities/fixmap/examples/nominal-case.yaml'
    )
    const parsed = YAML.parse(exampleYaml) as any

    expect(exampleYaml).toContain('principal: 1000000')
    expect(exampleYaml).toContain('annualCouponRatePct: 6.5')
    expect(exampleYaml).toContain('maturityDate: 2031-08-03')
    expect(exampleYaml).not.toContain('startDate:')

    const adapterOutputs = calculateFixmapFromSpecInputs(parsed.inputs)
    const legacyInput = mapFixmapSpecInputsToLegacyInvestmentInput(parsed.inputs)
    const expectedSpecOutputs = mapLegacyFixmapPreviewToSpecOutputs(null, parsed.inputs)

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
      'docs/product-specs/products/government-securities/fixmap/examples/stepped-coupon-case.yaml'
    )
    const parsed = YAML.parse(exampleYaml) as {
      inputs: Record<string, unknown>
      expected: Record<string, number>
    }

    const adapterOutputs = calculateFixmapFromSpecInputs(parsed.inputs)

    expect(adapterOutputs.annualCouponRatePct).toBe(parsed.expected.annualCouponRatePct)
    expect(adapterOutputs.accruedInterestAmount).toBeCloseTo(
      parsed.expected.accruedInterestAmount,
      10
    )
    expect(adapterOutputs.purchaseAmount).toBeCloseTo(parsed.expected.purchaseAmount, 10)
  })
})
