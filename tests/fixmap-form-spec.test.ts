import { describe, expect, it } from 'vitest'
import { loadFixmapProductSpecYamlFromFiles } from '../src/finance_engine/product_specs/fixmap'
import {
  FIXMAP_PRODUCT_SPEC,
  FIXMAP_FRONTEND_FIELD_ADAPTER,
  orderedSpecFields
} from '../public/controller/fixmap-form.js'

describe('fixmap frontend form metadata seam', () => {
  it('keeps frontend field metadata aligned with FIXMAP product spec inputs', () => {
    const loadedSpec = loadFixmapProductSpecYamlFromFiles()
    const loadedByName = new Map((loadedSpec as any).inputs.map((field: any) => [field.name, field]))

    expect(FIXMAP_PRODUCT_SPEC.id).toBe('government-security.fixmap.standard')
    expect(FIXMAP_PRODUCT_SPEC.family).toBe('government-security')
    expect(FIXMAP_PRODUCT_SPEC.variant).toBe('fixmap')

    for (const field of FIXMAP_PRODUCT_SPEC.inputs) {
      const fromLoader = loadedByName.get(field.name)
      expect(fromLoader).toBeDefined()
      expect(field.label).toBe(fromLoader?.label)
      expect(field.required).toBe(fromLoader?.required)
      expect(field.type).toBe(fromLoader?.type)
      expect(field.description).toBe(fromLoader?.description)
      expect(field.constraints ?? {}).toEqual(fromLoader?.constraints ?? {})
    }
  })

  it('uses ui section field order from FIXMAP product spec', () => {
    const orderedNames = orderedSpecFields(FIXMAP_PRODUCT_SPEC).map((field) => field.name)
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
    const loadedSpec = loadFixmapProductSpecYamlFromFiles() as any
    expect(FIXMAP_PRODUCT_SPEC.denominationUnit).toBe(1)
    expect(loadedSpec.denominationUnit).toBe(1)
  })

  it('maps FIXMAP fields onto dedicated host controls named like YAML', () => {
    expect(FIXMAP_FRONTEND_FIELD_ADAPTER.annualCouponRatePct).toEqual({
      inputId: 'fixmap-annual-coupon-rate-pct',
      formName: 'annualCouponRatePct'
    })
    expect(FIXMAP_FRONTEND_FIELD_ADAPTER.maturityDate).toEqual({
      inputId: 'fixmap-maturity-date',
      formName: 'maturityDate'
    })
    expect(FIXMAP_FRONTEND_FIELD_ADAPTER.purchaseDate.inputId).toBe('fixmap-purchase-date')
    expect(FIXMAP_FRONTEND_FIELD_ADAPTER.issueDate.inputId).toBe('fixmap-issue-date')
    expect(FIXMAP_FRONTEND_FIELD_ADAPTER.firstCouponDate.inputId).toBe('fixmap-first-coupon-date')
  })
})
