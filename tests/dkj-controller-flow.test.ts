import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import YAML from 'yaml'
import {
  DKJ_PRODUCT_SPEC,
  mapFormDataToDkjSpecInputs,
  mapDkjSpecInputsToInvestmentBundleInput
} from '../public/controller/dkj-form.js'
import { calculateDkjFromSpecInputs } from '../public/controller/dkj-calculation-adapter.js'
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

describe('dkj ui/controller integration seam', () => {
  it('maps spec-backed DKJ form values through adapter and investment bundle generation', () => {
    const exampleYaml = readRepoFile('docs/product-specs/products/government-securities/dkj/examples/nominal-case.yaml')
    const parsed = YAML.parse(exampleYaml) as any

    const formData = createFormDataLike({
      principal: String(parsed.inputs.faceValue),
      purchasePrice: String(parsed.inputs.purchasePricePct),
      termMonths: String(parsed.inputs.termMonths),
      transactionDate: String(parsed.inputs.settlementDate),
      dueDate: String(parsed.inputs.maturityDate),
      remainingDays: String(parsed.inputs.remainingDays)
    })

    const specInputs = mapFormDataToDkjSpecInputs(formData as any)
    const outputs = calculateDkjFromSpecInputs(specInputs, { createInvestmentMaturityPreview })
    const bundle = generateInvestmentInstrumentBundle(
      mapDkjSpecInputsToInvestmentBundleInput(specInputs, {
        label: DKJ_PRODUCT_SPEC.ui.formTitle,
        category: 'investment'
      })
    )

    expect(specInputs).toEqual({
      faceValue: 100000,
      purchasePricePct: 95,
      termMonths: 12,
      settlementDate: '2026-01-07',
      maturityDate: '2027-01-07',
      remainingDays: 360
    })

    expect(outputs).toMatchObject({
      purchaseAmount: parsed.expected.purchaseAmount,
      redemptionValue: parsed.expected.redemptionValue,
      grossGain: parsed.expected.grossGain
    })

    expect(outputs.simpleReturnPct).toBeCloseTo(parsed.expected.simpleReturnPct, 8)
    expect(outputs.annualizedYieldPct).toBeCloseTo(parsed.expected.annualizedYieldPct, 8)

    expect(bundle.config.subtype).toBe('dkj')
    expect(bundle.config.termMonths).toBe(12)
    expect(bundle.config.remainingDays).toBe(360)
    expect(bundle.generatedFlows).toHaveLength(2)
    expect(bundle.generatedFlows[0]).toMatchObject({
      direction: 'outflow',
      amount: parsed.expected.purchaseAmount
    })
    expect(bundle.generatedFlows[1]).toMatchObject({
      direction: 'inflow',
      amount: parsed.expected.redemptionValue
    })
  })
})
