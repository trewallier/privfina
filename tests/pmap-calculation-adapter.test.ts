import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import YAML from 'yaml'
import {
  calculatePmapFromSpecInputs,
  mapPmapSpecInputsToLegacyInvestmentInput,
  mapLegacyPmapPreviewToSpecOutputs
} from '../public/controller/pmap-calculation-adapter.js'
import { createInvestmentMaturityPreview } from '../public/instruments.js'

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

describe('pmap calculation adapter seam', () => {
  it('bridges PMAP example inputs through existing investment calculation path and returns spec-shaped outputs', () => {
    const exampleYaml = readRepoFile('docs/product-specs/products/government-securities/pmap/examples/nominal-case.yaml')
    const parsed = YAML.parse(exampleYaml) as any

    expect(exampleYaml).toContain('principal: 1000000')
    expect(exampleYaml).toContain('interestPremiumPct: 0.5')
    expect(exampleYaml).toContain('previousYearAverageInflationPct: 4.4')
    expect(exampleYaml).toContain('startDate: 2026-05-23')

    const specInputs = {
      principal: 1000000,
      interestPremiumPct: 0.5,
      previousYearAverageInflationPct: 4.4,
      startDate: '2026-05-23',
      purchaseDate: '2026-05-23'
    }

    let delegationCount = 0
    const delegatedExistingPath = (input) => {
      delegationCount += 1
      return createInvestmentMaturityPreview(input)
    }

    const adapterOutputs = calculatePmapFromSpecInputs(specInputs, {
      createInvestmentMaturityPreview: delegatedExistingPath
    })

    const legacyInput = mapPmapSpecInputsToLegacyInvestmentInput(specInputs)
    const legacyPreview = createInvestmentMaturityPreview(legacyInput)
    const expectedSpecOutputs = mapLegacyPmapPreviewToSpecOutputs(legacyPreview, specInputs)

    expect(delegationCount).toBe(1)
    expect(adapterOutputs).toEqual(expectedSpecOutputs)
    expect(adapterOutputs).toEqual(parsed.expected)
    expect(adapterOutputs).toMatchObject({
      effectiveInflationBasePct: expect.any(Number),
      annualCouponRatePct: expect.any(Number),
      couponPaymentFrequency: expect.any(String),
      redemptionValue: expect.any(Number)
    })
    expect(Object.keys(adapterOutputs).sort()).toEqual([
      'annualCouponRatePct',
      'couponPaymentFrequency',
      'effectiveInflationBasePct',
      'redemptionValue'
    ].sort())
  })
})
