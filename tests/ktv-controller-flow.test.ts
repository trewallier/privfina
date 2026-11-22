import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import YAML from 'yaml'
import {
  KTV_PRODUCT_SPEC,
  mapFormDataToKtvSpecInputs,
  generateKtvInstrumentBundleFromSpecInputs
} from '../public/controller/ktv-form.js'
import { calculateKtvFromSpecInputs } from '../public/controller/ktv-calculation-adapter.js'

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

describe('ktv ui/controller integration seam', () => {
  it('maps spec-backed MÁK form values through adapter and KTV bundle generation', () => {
    const exampleYaml = readRepoFile(
      'docs/product-specs/products/government-securities/ktv/examples/nominal-case.yaml'
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

    const specInputs = mapFormDataToKtvSpecInputs(formData as any)
    const outputs = calculateKtvFromSpecInputs(specInputs)
    const bundle = generateKtvInstrumentBundleFromSpecInputs(specInputs, {
      label: KTV_PRODUCT_SPEC.ui.formTitle,
      category: 'investment'
    })

    expect(specInputs).toEqual({
      principal: 1000000,
      annualCouponRatePct: 6.25,
      purchaseDate: '2026-02-18',
      issueDate: '2026-02-18',
      maturityDate: '2037-09-23',
      firstCouponDate: '2026-09-23',
      dayCountConvention: 'ACT/365F',
      couponSchedule: undefined
    })

    expect(outputs).toMatchObject(parsed.expected)
    expect(bundle.productId).toBe('government-security.ktv.standard')
    expect(bundle.productSpecVersion).toBe('v2alpha3')
    expect(bundle.config.subtype).toBe('ktv')
    expect(bundle.config.annualCouponRatePct).toBe(6.25)
    expect(bundle.config.maturityDate).toBe('2037-09-23')
    expect(bundle.config.dayCountConvention).toBe('ACT/365F')
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
