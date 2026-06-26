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
      expect(field.constraints ?? {}).toEqual(fromLoader?.constraints ?? {})
    }
  })

  it('uses ui section field order from PMAP product spec', () => {
    const orderedNames = orderedSpecFields(PMAP_PRODUCT_SPEC).map((field) => field.name)
    expect(orderedNames).toEqual([
      'principal',
      'interestPremiumPct',
      'previousYearAverageInflationPct',
      'startDate',
      'purchaseDate',
      'issueDate',
      'firstCouponDate'
    ])
  })

  it('keeps adapter mapping minimal while preserving current PMAP DOM wiring', () => {
    expect(PMAP_FRONTEND_FIELD_ADAPTER.interestPremiumPct.formName).toBe('spreadRate')
    expect(PMAP_FRONTEND_FIELD_ADAPTER.previousYearAverageInflationPct.formName).toBe('yearlyInflation')
    expect(PMAP_FRONTEND_FIELD_ADAPTER.startDate.inputId).toBe('investment-issue-date')
    expect(PMAP_FRONTEND_FIELD_ADAPTER.purchaseDate.inputId).toBe('investment-transaction-date')
    expect(PMAP_FRONTEND_FIELD_ADAPTER.issueDate.inputId).toBe('investment-due-date')
    expect(PMAP_FRONTEND_FIELD_ADAPTER.firstCouponDate.inputId).toBe('investment-coupon-period')
  })
})