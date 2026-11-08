import { describe, expect, it } from 'vitest'
import { loadMappProductSpecYamlFromFiles } from '../src/finance_engine/product_specs/mapp'
import {
  MAPP_PRODUCT_SPEC,
  MAPP_FRONTEND_FIELD_ADAPTER,
  orderedSpecFields
} from '../public/controller/mapp-form.js'

describe('mapp frontend form metadata seam', () => {
  it('keeps frontend field metadata aligned with MAPP product spec inputs', () => {
    const loadedSpec = loadMappProductSpecYamlFromFiles()
    const loadedByName = new Map((loadedSpec as any).inputs.map((field: any) => [field.name, field]))

    expect(MAPP_PRODUCT_SPEC.id).toBe('government-security.mapp.standard')
    expect(MAPP_PRODUCT_SPEC.family).toBe('government-security')
    expect(MAPP_PRODUCT_SPEC.variant).toBe('mapp')

    for (const field of MAPP_PRODUCT_SPEC.inputs) {
      const fromLoader = loadedByName.get(field.name)
      expect(fromLoader).toBeDefined()
      expect(field.label).toBe(fromLoader?.label)
      expect(field.required).toBe(fromLoader?.required)
      expect(field.type).toBe(fromLoader?.type)
      expect(field.description).toBe(fromLoader?.description)
      expect(field.constraints ?? {}).toEqual(fromLoader?.constraints ?? {})
    }
  })

  it('uses ui section field order from MAPP product spec', () => {
    const orderedNames = orderedSpecFields(MAPP_PRODUCT_SPEC).map((field) => field.name)
    expect(orderedNames).toEqual([
      'principal',
      'purchaseDate',
      'annualCouponRatePct',
      'issueDate',
      'maturityDate',
      'firstCouponDate',
      'couponFrequencyMonths',
      'dayCountConvention'
    ])
  })

  it('exposes denominationUnit matching the product YAML', () => {
    const loadedSpec = loadMappProductSpecYamlFromFiles() as any
    expect(MAPP_PRODUCT_SPEC.denominationUnit).toBe(1)
    expect(loadedSpec.denominationUnit).toBe(1)
  })

  it('maps MAPP fields onto dedicated host controls named like YAML', () => {
    expect(MAPP_FRONTEND_FIELD_ADAPTER.annualCouponRatePct).toEqual({
      inputId: 'mapp-annual-coupon-rate-pct',
      formName: 'annualCouponRatePct'
    })
    expect(MAPP_FRONTEND_FIELD_ADAPTER.maturityDate).toEqual({
      inputId: 'mapp-maturity-date',
      formName: 'maturityDate'
    })
    expect(MAPP_FRONTEND_FIELD_ADAPTER.purchaseDate.inputId).toBe('mapp-purchase-date')
    expect(MAPP_FRONTEND_FIELD_ADAPTER.issueDate.inputId).toBe('mapp-issue-date')
    expect(MAPP_FRONTEND_FIELD_ADAPTER.firstCouponDate.inputId).toBe('mapp-first-coupon-date')
  })
})
