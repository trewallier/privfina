import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import YAML from 'yaml'
import {
  FIXMAP_PRODUCT_SPEC,
  mapFormDataToFixmapSpecInputs,
  generateFixmapInstrumentBundleFromSpecInputs
} from '../public/controller/fixmap-form.js'
import { calculateFixmapFromSpecInputs } from '../public/controller/fixmap-calculation-adapter.js'

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

describe('fixmap ui/controller integration seam', () => {
  it('maps spec-backed FixMÁP form values through adapter and FixMÁP bundle generation', () => {
    const exampleYaml = readRepoFile(
      'docs/product-specs/products/government-securities/fixmap/examples/nominal-case.yaml'
    )
    const parsed = YAML.parse(exampleYaml) as any

    const formData = createFormDataLike({
      principal: String(parsed.inputs.principal),
      annualCouponRatePct: String(parsed.inputs.annualCouponRatePct),
      purchaseDate: String(parsed.inputs.purchaseDate),
      issueDate: String(parsed.inputs.issueDate),
      maturityDate: String(parsed.inputs.maturityDate)
    })

    const specInputs = mapFormDataToFixmapSpecInputs(formData as any)
    const outputs = calculateFixmapFromSpecInputs(specInputs)
    const bundle = generateFixmapInstrumentBundleFromSpecInputs(specInputs, {
      label: FIXMAP_PRODUCT_SPEC.ui.formTitle,
      category: 'investment'
    })

    expect(specInputs).toEqual({
      principal: 1000000,
      annualCouponRatePct: 6.5,
      purchaseDate: '2026-08-03',
      issueDate: '2026-08-03',
      maturityDate: '2031-08-03',
      firstCouponDate: undefined,
      dayCountConvention: undefined,
      couponSchedule: undefined
    })

    expect(outputs).toMatchObject(parsed.expected)
    expect(bundle.productId).toBe('government-security.fixmap.standard')
    expect(bundle.productSpecVersion).toBe('v2alpha3')
    expect(bundle.config.subtype).toBe('fixmap')
    expect(bundle.config.annualCouponRatePct).toBe(6.5)
    expect(bundle.config.maturityDate).toBe('2031-08-03')
    expect(bundle.generatedFlows.length).toBeGreaterThan(1)
    expect(bundle.generatedFlows[0]).toMatchObject({
      direction: 'outflow',
      amount: parsed.inputs.principal,
      sourceInstrumentId: bundle.id,
      sourceInstrumentType: 'investment'
    })
    expect(bundle.generatedFlows[bundle.generatedFlows.length - 1]).toMatchObject({
      direction: 'inflow',
      amount: parsed.inputs.principal
    })
  })
})
