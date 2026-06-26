import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import YAML from 'yaml'
import {
  PMAP_PRODUCT_SPEC,
  mapFormDataToPmapSpecInputs,
  mapPmapSpecInputsToInvestmentBundleInput
} from '../public/controller/pmap-form.js'
import { calculatePmapFromSpecInputs } from '../public/controller/pmap-calculation-adapter.js'
import { createInvestmentMaturityPreview, generateInvestmentInstrumentBundle } from '../public/instruments.js'

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

function createFormDataLike(entries: Record<string, string>): { get(name: string): string | null } {
  return {
    get(name: string) {
      return Object.prototype.hasOwnProperty.call(entries, name) ? entries[name] : null
    }
  }
}

describe('pmap ui/controller integration seam', () => {
  it('maps spec-backed PMAP form values through adapter and investment bundle generation', () => {
    const exampleYaml = readRepoFile('docs/product-specs/products/government-securities/pmap/examples/nominal-case.yaml')
    const parsed = YAML.parse(exampleYaml) as any

    const formData = createFormDataLike({
      principal: String(parsed.inputs.principal),
      spreadRate: String(parsed.inputs.interestPremiumPct),
      yearlyInflation: String(parsed.inputs.previousYearAverageInflationPct),
      startDate: String(parsed.inputs.startDate),
      purchaseDate: String(parsed.inputs.purchaseDate)
    })

    const specInputs = mapFormDataToPmapSpecInputs(formData as any)
    const outputs = calculatePmapFromSpecInputs(specInputs, { createInvestmentMaturityPreview })
    const bundle = generateInvestmentInstrumentBundle(
      mapPmapSpecInputsToInvestmentBundleInput(specInputs, {
        label: PMAP_PRODUCT_SPEC.ui.formTitle,
        category: 'investment'
      })
    )

    expect(specInputs).toEqual({
      principal: 1000000,
      interestPremiumPct: 0.5,
      previousYearAverageInflationPct: 4.4,
      startDate: '2026-05-23',
      purchaseDate: '2026-05-23',
      issueDate: undefined,
      firstCouponDate: undefined
    })

    expect(outputs).toEqual(parsed.expected)
    expect(bundle.config.subtype).toBe('inflation-linked-bond')
    expect(bundle.config.spreadRate).toBeCloseTo(0.005, 8)
    expect(bundle.generatedFlows).toHaveLength(2)
    expect(bundle.generatedFlows[0]).toMatchObject({
      direction: 'outflow',
      amount: parsed.inputs.principal
    })
    expect(bundle.generatedFlows[1]).toMatchObject({
      direction: 'inflow'
    })
  })
})