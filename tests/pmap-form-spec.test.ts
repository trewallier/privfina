import { describe, expect, it } from 'vitest'
import { loadPmapProductSpecYamlFromFiles } from '../src/finance_engine/product_specs/pmap'
import {
  PMAP_PRODUCT_SPEC,
  PMAP_FRONTEND_FIELD_ADAPTER,
  orderedSpecFields
} from '../public/controller/pmap-form.js'

describe('pmap frontend form metadata seam', () => {
  it('keeps frontend field metadata aligned with PMAP product spec inputs', () => {
    const loadedSpec = loadPmapProductSpecYamlFromFiles()
    const loadedByName = new Map((loadedSpec as any).inputs.map((field: any) => [field.name, field]))

    expect(PMAP_PRODUCT_SPEC.id).toBe('government-security.pmap.standard')
    expect(PMAP_PRODUCT_SPEC.family).toBe('government-security')
    expect(PMAP_PRODUCT_SPEC.variant).toBe('pmap')

    for (const field of PMAP_PRODUCT_SPEC.inputs) {
      const fromLoader = loadedByName.get(field.name)
      expect(fromLoader).toBeDefined()
      expect(field.label).toBe(fromLoader?.label)
      expect(field.required).toBe(fromLoader?.required)
      expect(field.type).toBe(fromLoader?.type)
      expect(field.description).toBe(fromLoader?.description)
      expect(field.constraints ?? {}).toEqual(fromLoader?.constraints ?? {})
    }
  })

  it('uses ui section field order from PMAP product spec', () => {
    const orderedNames = orderedSpecFields(PMAP_PRODUCT_SPEC).map((field) => field.name)
    expect(orderedNames).toEqual([
      'principal',
      'purchaseDate',
      'previousYearAverageInflationPct',
      'interestPremiumPct',
      'issueDate',
      'startDate',
      'firstCouponDate'
    ])
  })

  it('exposes denominationUnit matching the product YAML', () => {
    const loadedSpec = loadPmapProductSpecYamlFromFiles() as any
    expect(PMAP_PRODUCT_SPEC.denominationUnit).toBe(1)
    expect(loadedSpec.denominationUnit).toBe(1)
  })

  it('maps PMAP fields onto dedicated host controls named like YAML', () => {
    expect(PMAP_FRONTEND_FIELD_ADAPTER.interestPremiumPct).toEqual({
      inputId: 'pmap-interest-premium-pct',
      formName: 'interestPremiumPct'
    })
    expect(PMAP_FRONTEND_FIELD_ADAPTER.previousYearAverageInflationPct).toEqual({
      inputId: 'pmap-previous-year-inflation-pct',
      formName: 'previousYearAverageInflationPct'
    })
    expect(PMAP_FRONTEND_FIELD_ADAPTER.startDate.inputId).toBe('pmap-start-date')
    expect(PMAP_FRONTEND_FIELD_ADAPTER.purchaseDate.inputId).toBe('pmap-purchase-date')
    expect(PMAP_FRONTEND_FIELD_ADAPTER.issueDate.inputId).toBe('pmap-issue-date')
    expect(PMAP_FRONTEND_FIELD_ADAPTER.firstCouponDate.inputId).toBe('pmap-first-coupon-date')
  })
})
