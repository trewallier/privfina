import { describe, expect, it } from 'vitest'
import { loadBabaProductSpecYamlFromFiles } from '../src/finance_engine/product_specs/baba'
import {
  BABA_PRODUCT_SPEC,
  BABA_FRONTEND_FIELD_ADAPTER,
  orderedSpecFields
} from '../public/controller/baba-form.js'

describe('baba frontend form metadata seam', () => {
  it('keeps frontend field metadata aligned with BABA product spec inputs', () => {
    const loadedSpec = loadBabaProductSpecYamlFromFiles()
    const loadedByName = new Map((loadedSpec as any).inputs.map((field: any) => [field.name, field]))

    expect(BABA_PRODUCT_SPEC.id).toBe('government-security.baba.standard')
    expect(BABA_PRODUCT_SPEC.family).toBe('government-security')
    expect(BABA_PRODUCT_SPEC.variant).toBe('baba')

    for (const field of BABA_PRODUCT_SPEC.inputs) {
      const fromLoader = loadedByName.get(field.name)
      expect(fromLoader).toBeDefined()
      expect(field.label).toBe(fromLoader?.label)
      expect(field.required).toBe(fromLoader?.required)
      expect(field.type).toBe(fromLoader?.type)
      expect(field.description).toBe(fromLoader?.description)
      expect(field.constraints ?? {}).toEqual(fromLoader?.constraints ?? {})
    }
  })

  it('uses ui section field order from BABA product spec', () => {
    const orderedNames = orderedSpecFields(BABA_PRODUCT_SPEC).map((field) => field.name)
    expect(orderedNames).toEqual([
      'principal',
      'purchaseDate',
      'annualCouponRatePct',
      'issueDate',
      'maturityDate',
      'firstCouponDate',
      'dayCountConvention'
    ])
  })

  it('exposes denominationUnit matching the product YAML', () => {
    const loadedSpec = loadBabaProductSpecYamlFromFiles() as any
    expect(BABA_PRODUCT_SPEC.denominationUnit).toBe(1)
    expect(loadedSpec.denominationUnit).toBe(1)
  })

  it('maps BABA fields onto dedicated host controls named like YAML', () => {
    expect(BABA_FRONTEND_FIELD_ADAPTER.annualCouponRatePct).toEqual({
      inputId: 'baba-annual-coupon-rate-pct',
      formName: 'annualCouponRatePct'
    })
    expect(BABA_FRONTEND_FIELD_ADAPTER.maturityDate).toEqual({
      inputId: 'baba-maturity-date',
      formName: 'maturityDate'
    })
    expect(BABA_FRONTEND_FIELD_ADAPTER.purchaseDate.inputId).toBe('baba-purchase-date')
    expect(BABA_FRONTEND_FIELD_ADAPTER.issueDate.inputId).toBe('baba-issue-date')
    expect(BABA_FRONTEND_FIELD_ADAPTER.firstCouponDate.inputId).toBe('baba-first-coupon-date')
  })
})
