import { describe, expect, it } from 'vitest'
import { loadKtvProductSpecYamlFromFiles } from '../src/finance_engine/product_specs/ktv'
import {
  KTV_PRODUCT_SPEC,
  KTV_FRONTEND_FIELD_ADAPTER,
  orderedSpecFields
} from '../public/controller/ktv-form.js'
// KTV_INDEX_RESET is re-exported via product-spec through KTV_PRODUCT_SPEC.indexReset

describe('ktv frontend form metadata seam', () => {
  it('keeps frontend field metadata aligned with KTV product spec inputs', () => {
    const loadedSpec = loadKtvProductSpecYamlFromFiles()
    const loadedByName = new Map((loadedSpec as any).inputs.map((field: any) => [field.name, field]))

    expect(KTV_PRODUCT_SPEC.id).toBe('government-security.ktv.standard')
    expect(KTV_PRODUCT_SPEC.family).toBe('government-security')
    expect(KTV_PRODUCT_SPEC.variant).toBe('ktv')

    for (const field of KTV_PRODUCT_SPEC.inputs) {
      const fromLoader = loadedByName.get(field.name)
      expect(fromLoader).toBeDefined()
      expect(field.label).toBe(fromLoader?.label)
      expect(field.required).toBe(fromLoader?.required)
      expect(field.type).toBe(fromLoader?.type)
      expect(field.description).toBe(fromLoader?.description)
      expect(field.constraints ?? {}).toEqual(fromLoader?.constraints ?? {})
    }
  })

  it('uses ui section field order from KTV product spec', () => {
    const orderedNames = orderedSpecFields(KTV_PRODUCT_SPEC).map((field) => field.name)
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
    const loadedSpec = loadKtvProductSpecYamlFromFiles() as any
    expect(KTV_PRODUCT_SPEC.denominationUnit).toBe(10000)
    expect(loadedSpec.denominationUnit).toBe(10000)
  })

  it('locks embedded KTV_INDEX_RESET to product.yaml indexReset', () => {
    const loadedSpec = loadKtvProductSpecYamlFromFiles() as any
    expect(loadedSpec.indexReset).toEqual(KTV_PRODUCT_SPEC.indexReset)
    expect(KTV_PRODUCT_SPEC.referenceIndex).toBe(loadedSpec.referenceIndex)
    expect(KTV_PRODUCT_SPEC.referenceIndex).toBe('bubor')
  })

  it('maps KTV fields onto dedicated host controls named like YAML', () => {
    expect(KTV_FRONTEND_FIELD_ADAPTER.annualCouponRatePct).toEqual({
      inputId: 'ktv-annual-coupon-rate-pct',
      formName: 'annualCouponRatePct'
    })
    expect(KTV_FRONTEND_FIELD_ADAPTER.maturityDate).toEqual({
      inputId: 'ktv-maturity-date',
      formName: 'maturityDate'
    })
    expect(KTV_FRONTEND_FIELD_ADAPTER.purchaseDate.inputId).toBe('ktv-purchase-date')
    expect(KTV_FRONTEND_FIELD_ADAPTER.issueDate.inputId).toBe('ktv-issue-date')
    expect(KTV_FRONTEND_FIELD_ADAPTER.firstCouponDate.inputId).toBe('ktv-first-coupon-date')
  })
})
