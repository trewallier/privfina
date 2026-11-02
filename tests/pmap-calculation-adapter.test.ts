import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import YAML from 'yaml'
import {
  calculatePmapFromSpecInputs,
  mapPmapSpecInputsToLegacyInvestmentInput,
  mapLegacyPmapPreviewToSpecOutputs
} from '../public/controller/pmap-calculation-adapter.js'

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

describe('pmap calculation adapter seam', () => {
  it('bridges PMAP example inputs and returns ADR 0038 spec-shaped outputs', () => {
    const exampleYaml = readRepoFile(
      'docs/product-specs/products/government-securities/pmap/examples/nominal-case.yaml'
    )
    const parsed = YAML.parse(exampleYaml) as any

    expect(exampleYaml).toContain('principal: 1000000')
    expect(exampleYaml).toContain('annualCouponRatePct: 4.9')
    expect(exampleYaml).toContain('maturityDate: 2036-05-23')
    expect(exampleYaml).toContain('startDate: 2026-05-23')

    const adapterOutputs = calculatePmapFromSpecInputs(parsed.inputs)
    const legacyInput = mapPmapSpecInputsToLegacyInvestmentInput(parsed.inputs)
    const expectedSpecOutputs = mapLegacyPmapPreviewToSpecOutputs(null, parsed.inputs)

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

  it('bridges inflation-reset-case example with published effective coupon', () => {
    const exampleYaml = readRepoFile(
      'docs/product-specs/products/government-securities/pmap/examples/inflation-reset-case.yaml'
    )
    const parsed = YAML.parse(exampleYaml) as {
      inputs: Record<string, unknown>
      expected: Record<string, unknown>
    }

    const adapterOutputs = calculatePmapFromSpecInputs(parsed.inputs)

    expect(adapterOutputs).toMatchObject(parsed.expected)
    expect(adapterOutputs.annualCouponRatePct).toBe(0.5)
  })
})
