import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import YAML from 'yaml'
import {
  PMAP_PRODUCT_SPEC,
  mapFormDataToPmapSpecInputs,
  generatePmapInstrumentBundleFromSpecInputs
} from '../public/controller/pmap-form.js'
import { calculatePmapFromSpecInputs } from '../public/controller/pmap-calculation-adapter.js'

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
  it('maps spec-backed PMAP form values through adapter and PMAP bundle generation', () => {
    const exampleYaml = readRepoFile(
      'docs/product-specs/products/government-securities/pmap/examples/nominal-case.yaml'
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

    const specInputs = mapFormDataToPmapSpecInputs(formData as any)
    const outputs = calculatePmapFromSpecInputs(specInputs)
    const bundle = generatePmapInstrumentBundleFromSpecInputs(specInputs, {
      label: PMAP_PRODUCT_SPEC.ui.formTitle,
      category: 'investment'
    })

    expect(specInputs).toEqual({
      principal: 1000000,
      annualCouponRatePct: 4.9,
      purchaseDate: '2026-05-23',
      issueDate: '2026-05-23',
      maturityDate: '2036-05-23',
      startDate: '2026-05-23',
      firstCouponDate: undefined,
      dayCountConvention: undefined
    })

    expect(outputs).toMatchObject(parsed.expected)
    expect(bundle.productId).toBe('government-security.pmap.standard')
    expect(bundle.productSpecVersion).toBe('v2alpha2')
    expect(bundle.config.subtype).toBe('pmap')
    expect(bundle.config.annualCouponRatePct).toBe(4.9)
    expect(bundle.config.maturityDate).toBe('2036-05-23')
    expect(bundle.generatedFlows.length).toBeGreaterThan(1)
    expect(bundle.generatedFlows[0]).toMatchObject({
      direction: 'outflow',
      amount: parsed.inputs.principal,
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
