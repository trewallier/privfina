import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import YAML from 'yaml'
import {
  MAPP_PRODUCT_SPEC,
  mapFormDataToMappSpecInputs,
  generateMappInstrumentBundleFromSpecInputs
} from '../public/controller/mapp-form.js'
import { calculateMappFromSpecInputs } from '../public/controller/mapp-calculation-adapter.js'

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

describe('mapp ui/controller integration seam', () => {
  it('maps spec-backed MÁP Plusz form values through adapter and MÁP Plusz bundle generation', () => {
    const exampleYaml = readRepoFile(
      'docs/product-specs/products/government-securities/mapp/examples/nominal-case.yaml'
    )
    const parsed = YAML.parse(exampleYaml) as any

    const formData = createFormDataLike({
      principal: String(parsed.inputs.principal),
      annualCouponRatePct: String(parsed.inputs.annualCouponRatePct),
      purchaseDate: String(parsed.inputs.purchaseDate),
      issueDate: String(parsed.inputs.issueDate),
      maturityDate: String(parsed.inputs.maturityDate),
      firstCouponDate: String(parsed.inputs.firstCouponDate)
    })

    const specInputs = mapFormDataToMappSpecInputs(formData as any)
    const outputs = calculateMappFromSpecInputs(specInputs)
    const bundle = generateMappInstrumentBundleFromSpecInputs(specInputs, {
      label: MAPP_PRODUCT_SPEC.ui.formTitle,
      category: 'investment'
    })

    expect(specInputs).toEqual({
      principal: 1000000,
      annualCouponRatePct: 5.0,
      purchaseDate: '2026-10-02',
      issueDate: '2026-10-02',
      maturityDate: '2031-10-02',
      firstCouponDate: '2027-04-02',
      dayCountConvention: undefined,
      couponSchedule: undefined
    })

    expect(outputs).toMatchObject(parsed.expected)
    expect(bundle.productId).toBe('government-security.mapp.standard')
    expect(bundle.productSpecVersion).toBe('v2alpha3')
    expect(bundle.config.subtype).toBe('mapp')
    expect(bundle.config.annualCouponRatePct).toBe(5.0)
    expect(bundle.config.maturityDate).toBe('2031-10-02')
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

  it('keeps mid-period-after-coupon accrual through form → adapter → bundle', () => {
    const exampleYaml = readRepoFile(
      'docs/product-specs/products/government-securities/mapp/examples/mid-period-after-coupon-case.yaml'
    )
    const parsed = YAML.parse(exampleYaml) as {
      inputs: Record<string, unknown>
      expected: Record<string, number>
    }
    const schedule = JSON.stringify(parsed.inputs.couponSchedule)

    const formData = createFormDataLike({
      principal: String(parsed.inputs.principal),
      annualCouponRatePct: String(parsed.inputs.annualCouponRatePct),
      purchaseDate: String(parsed.inputs.purchaseDate),
      issueDate: String(parsed.inputs.issueDate),
      maturityDate: String(parsed.inputs.maturityDate),
      firstCouponDate: String(parsed.inputs.firstCouponDate),
      dayCountConvention: String(parsed.inputs.dayCountConvention),
      couponSchedule: schedule
    })

    const specInputs = mapFormDataToMappSpecInputs(formData as any)
    const outputs = calculateMappFromSpecInputs(specInputs)
    const bundle = generateMappInstrumentBundleFromSpecInputs(specInputs)

    expect(outputs.annualCouponRatePct).toBe(parsed.expected.annualCouponRatePct)
    expect(outputs.accruedInterestAmount).toBe(parsed.expected.accruedInterestAmount)
    expect(outputs.purchaseAmount).toBe(parsed.expected.purchaseAmount)
    expect(bundle.config.accruedInterestAmount).toBe(parsed.expected.accruedInterestAmount)
    expect(bundle.generatedFlows[0]).toMatchObject({
      direction: 'outflow',
      amount: parsed.expected.purchaseAmount
    })
  })
})
