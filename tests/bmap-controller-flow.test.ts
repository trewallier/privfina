import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import YAML from 'yaml'
import {
  BMAP_PRODUCT_SPEC,
  mapFormDataToBmapSpecInputs
} from '../public/controller/bmap-form.js'
import {
  calculateBmapFromSpecInputs,
  generateBmapInstrumentBundleFromSpecInputs
} from '../public/controller/bmap-calculation-adapter.js'
import { createInvestmentMaturityPreview } from '../public/instruments.js'

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

describe('bmap ui/controller integration seam', () => {
  it('maps spec-backed BMAP form values through adapter and BMAP bundle generation', () => {
    const exampleYaml = readRepoFile(
      'docs/product-specs/products/government-securities/bmap/examples/nominal-case.yaml'
    )
    const parsed = YAML.parse(exampleYaml) as any

    const formData = createFormDataLike({
      principal: String(parsed.inputs.principal),
      annualCouponRatePct: String(parsed.inputs.annualCouponRatePct),
      purchaseDate: String(parsed.inputs.purchaseDate),
      issueDate: String(parsed.inputs.issueDate),
      maturityDate: String(parsed.inputs.maturityDate),
      startDate: String(parsed.inputs.startDate)
    })

    const specInputs = mapFormDataToBmapSpecInputs(formData as any)
    const outputs = calculateBmapFromSpecInputs(specInputs, { createInvestmentMaturityPreview })
    const bundle = generateBmapInstrumentBundleFromSpecInputs(specInputs, {
      label: BMAP_PRODUCT_SPEC.ui.formTitle,
      category: 'investment'
    })

    expect(specInputs).toEqual({
      principal: 1000000,
      annualCouponRatePct: 6.88,
      purchaseDate: '2026-04-24',
      issueDate: '2026-04-24',
      maturityDate: '2032-04-24',
      startDate: '2026-04-24',
      firstCouponDate: undefined,
      dayCountConvention: undefined
    })

    expect(outputs).toMatchObject(parsed.expected)
    expect(bundle.productId).toBe('government-security.bmap.standard')
    expect(bundle.productSpecVersion).toBe('v2alpha1')
    expect(bundle.config.subtype).toBe('bmap')
    expect(bundle.config.principal).toBe(parsed.inputs.principal)
    expect(bundle.config.annualCouponRatePct).toBe(parsed.inputs.annualCouponRatePct)
    expect(bundle.config.maturityDate).toBe(parsed.inputs.maturityDate)
    expect(bundle.generatedFlows.length).toBeGreaterThan(2)
    expect(bundle.generatedFlows[0]).toMatchObject({
      direction: 'outflow',
      amount: bundle.preview.purchaseAmount,
      date: parsed.inputs.purchaseDate,
      sourceInstrumentId: bundle.id,
      sourceInstrumentType: 'investment'
    })
    expect(bundle.generatedFlows[bundle.generatedFlows.length - 1]).toMatchObject({
      direction: 'inflow',
      amount: parsed.inputs.principal,
      date: parsed.inputs.maturityDate
    })
  })
})
