import { describe, expect, it } from 'vitest'
import { loadBmapProductSpecYamlFromFiles } from '../src/finance_engine/product_specs/bmap'
import {
  BMAP_PRODUCT_SPEC,
  BMAP_FRONTEND_FIELD_ADAPTER,
  orderedSpecFields
} from '../public/controller/bmap-form.js'

describe('bmap frontend form metadata seam', () => {
  it('keeps frontend field metadata aligned with BMÁP product spec inputs', () => {
    const loadedSpec = loadBmapProductSpecYamlFromFiles()
    const loadedByName = new Map((loadedSpec as any).inputs.map((field: any) => [field.name, field]))

    expect(BMAP_PRODUCT_SPEC.id).toBe('government-security.bmap.standard')
    expect(BMAP_PRODUCT_SPEC.family).toBe('government-security')
    expect(BMAP_PRODUCT_SPEC.variant).toBe('bmap')

    for (const field of BMAP_PRODUCT_SPEC.inputs) {
      const fromLoader = loadedByName.get(field.name)
      expect(fromLoader).toBeDefined()
      expect(field.label).toBe(fromLoader?.label)
      expect(field.required).toBe(fromLoader?.required)
      expect(field.type).toBe(fromLoader?.type)
      expect(field.constraints ?? {}).toEqual(fromLoader?.constraints ?? {})
    }
  })

  it('uses ui section field order from BMÁP product spec', () => {
    const orderedNames = orderedSpecFields(BMAP_PRODUCT_SPEC).map((field) => field.name)
    expect(orderedNames).toEqual([
      'principal',
      'dkjBaseYieldPct',
      'interestPremiumPct',
      'startDate',
      'purchaseDate',
      'issueDate',
      'firstCouponDate'
    ])
  })

  it('keeps adapter mapping minimal while preserving BMÁP DOM wiring', () => {
    expect(BMAP_FRONTEND_FIELD_ADAPTER.principal.inputId).toBe('bmap-principal')
    expect(BMAP_FRONTEND_FIELD_ADAPTER.dkjBaseYieldPct.inputId).toBe('bmap-dkj-base-yield-pct')
    expect(BMAP_FRONTEND_FIELD_ADAPTER.interestPremiumPct.inputId).toBe(
      'bmap-interest-premium-pct'
    )
    expect(BMAP_FRONTEND_FIELD_ADAPTER.startDate.inputId).toBe('bmap-start-date')
    expect(BMAP_FRONTEND_FIELD_ADAPTER.purchaseDate.inputId).toBe('bmap-purchase-date')
    expect(BMAP_FRONTEND_FIELD_ADAPTER.issueDate.inputId).toBe('bmap-issue-date')
    expect(BMAP_FRONTEND_FIELD_ADAPTER.firstCouponDate.inputId).toBe('bmap-first-coupon-date')
  })
})
