import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import YAML from 'yaml'
import {
  BABA_PRODUCT_SPEC,
  mapFormDataToBabaSpecInputs,
  generateBabaInstrumentBundleFromSpecInputs
} from '../public/controller/baba-form.js'
import { calculateBabaFromSpecInputs } from '../public/controller/baba-calculation-adapter.js'

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

describe('baba ui/controller integration seam', () => {
  it('maps spec-backed Babakötvény form values through adapter and BABA bundle generation', () => {
    const exampleYaml = readRepoFile(
      'docs/product-specs/products/government-securities/baba/examples/nominal-case.yaml'
    )
    const parsed = YAML.parse(exampleYaml) as any

    const formData = createFormDataLike({
      principal: String(parsed.inputs.principal),
      annualCouponRatePct: String(parsed.inputs.annualCouponRatePct),
      purchaseDate: String(parsed.inputs.purchaseDate),
      issueDate: String(parsed.inputs.issueDate),
      maturityDate: String(parsed.inputs.maturityDate),
      firstCouponDate: String(parsed.inputs.firstCouponDate),
      dayCountConvention: String(parsed.inputs.dayCountConvention)
    })

    const specInputs = mapFormDataToBabaSpecInputs(formData as any)
    const outputs = calculateBabaFromSpecInputs(specInputs)
    const bundle = generateBabaInstrumentBundleFromSpecInputs(specInputs, {
      label: BABA_PRODUCT_SPEC.ui.formTitle,
      category: 'investment'
    })

    expect(specInputs).toEqual({
      principal: 1000000,
      annualCouponRatePct: 7.4,
      purchaseDate: '2026-02-02',
      issueDate: '2026-02-02',
      maturityDate: '2045-02-01',
      firstCouponDate: '2027-02-01',
      dayCountConvention: 'ACT/ACT',
      couponSchedule: undefined
    })

    expect(outputs).toMatchObject(parsed.expected)
    expect(bundle.productId).toBe('government-security.baba.standard')
    expect(bundle.productSpecVersion).toBe('v2alpha3')
    expect(bundle.config.subtype).toBe('baba')
    expect(bundle.config.annualCouponRatePct).toBe(7.4)
    expect(bundle.config.maturityDate).toBe('2045-02-01')
    expect(bundle.config.dayCountConvention).toBe('ACT/ACT')
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
