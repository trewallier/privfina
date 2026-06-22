import { describe, expect, it } from 'vitest'
import { loadDkjProductSpecYamlFromFiles } from '../src/finance_engine/product_specs/dkj'
import { DKJ_PRODUCT_SPEC, orderedSpecFields } from '../public/controller/dkj-form.js'

describe('dkj frontend form metadata seam', () => {
  it('keeps frontend field metadata aligned with DKJ product spec inputs', () => {
    const loadedSpec = loadDkjProductSpecYamlFromFiles()
    const loadedByName = new Map(loadedSpec && (loadedSpec as any).inputs.map((field: any) => [field.name, field]))

    for (const field of DKJ_PRODUCT_SPEC.inputs) {
      const fromLoader = loadedByName.get(field.name)
      expect(fromLoader).toBeDefined()
      expect(field.label).toBe(fromLoader?.label)
      expect(field.required).toBe(fromLoader?.required)
      expect(field.type).toBe(fromLoader?.type)
      expect(field.constraints ?? {}).toEqual(fromLoader?.constraints ?? {})
    }
  })

  it('uses ui section field order from the product spec for DKJ form fields', () => {
    const orderedNames = orderedSpecFields(DKJ_PRODUCT_SPEC).map((field) => field.name)
    expect(orderedNames).toEqual(['faceValue', 'purchasePricePct', 'termMonths', 'settlementDate', 'maturityDate', 'remainingDays'])
  })
})
