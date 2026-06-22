import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  calculateDkjFromSpecInputs,
  mapDkjSpecInputsToLegacyInvestmentInput,
  mapLegacyInvestmentPreviewToSpecOutputs
} from '../public/controller/dkj-calculation-adapter.js'
import { createInvestmentMaturityPreview } from '../public/instruments.js'

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

describe('dkj calculation adapter seam', () => {
  it('bridges DKJ example inputs through existing investment calculation path and returns spec-shaped outputs', () => {
    const exampleYaml = readRepoFile('docs/product-specs/products/government-securities/dkj/examples/nominal-case.yaml')

    expect(exampleYaml).toContain('faceValue: 100000')
    expect(exampleYaml).toContain('purchasePricePct: 95')
    expect(exampleYaml).toContain('termMonths: 12')
    expect(exampleYaml).toContain('settlementDate: 2026-01-07')

    const specInputs = {
      faceValue: 100000,
      purchasePricePct: 95,
      termMonths: 12,
      settlementDate: '2026-01-07',
      maturityDate: '2027-01-07',
      remainingDays: 360
    }

    let delegationCount = 0
    const delegatedExistingPath = (input) => {
      delegationCount += 1
      return createInvestmentMaturityPreview(input)
    }

    const adapterOutputs = calculateDkjFromSpecInputs(specInputs, {
      createInvestmentMaturityPreview: delegatedExistingPath
    })

    const legacyInput = mapDkjSpecInputsToLegacyInvestmentInput(specInputs)
    const legacyPreview = createInvestmentMaturityPreview(legacyInput)
    const expectedSpecOutputs = mapLegacyInvestmentPreviewToSpecOutputs(legacyPreview)

    expect(delegationCount).toBe(1)
    expect(adapterOutputs).toEqual(expectedSpecOutputs)
    expect(adapterOutputs).toMatchObject({
      purchaseAmount: expect.any(Number),
      redemptionValue: expect.any(Number),
      grossGain: expect.any(Number),
      annualizedYieldPct: expect.any(Number)
    })
    expect(Object.keys(adapterOutputs).sort()).toEqual([
      'purchaseAmount',
      'redemptionValue',
      'grossGain',
      'simpleReturnPct',
      'annualizedYieldPct'
    ].sort())
  })
})
