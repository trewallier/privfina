import { describe, expect, it } from 'vitest'
import { loadFixedRateLoanProductSpecFromFiles } from '../src/finance_engine/engine'
import {
  FIXED_RATE_LOAN_PRODUCT_SPEC,
  FIXED_RATE_LOAN_FRONTEND_FIELD_ADAPTER,
  orderedSpecFields
} from '../public/controller/fixed-rate-loan-form.js'

describe('fixed-rate-loan frontend form metadata seam', () => {
  it('keeps frontend field metadata aligned with fixed-rate product spec inputs', () => {
    const loadedSpec = loadFixedRateLoanProductSpecFromFiles()
    const loadedByName = new Map(loadedSpec.inputs.map((field) => [field.name, field]))

    for (const field of FIXED_RATE_LOAN_PRODUCT_SPEC.inputs) {
      const fromLoader = loadedByName.get(field.name)
      expect(fromLoader).toBeDefined()
      expect(field.label).toBe(fromLoader?.label)
      expect(field.required).toBe(fromLoader?.required)
      expect(field.type).toBe(fromLoader?.type)
      expect(field.constraints ?? {}).toEqual(fromLoader?.constraints ?? {})
    }
  })

  it('uses ui section field order from the product spec for fixed-rate loan form fields', () => {
    const orderedNames = orderedSpecFields(FIXED_RATE_LOAN_PRODUCT_SPEC).map((field) => field.name)
    expect(orderedNames).toEqual(['principal', 'annualInterestRatePct', 'termMonths', 'startDate'])
  })

  it('keeps the minimal adapter mapping from spec names to existing loan form names', () => {
    expect(FIXED_RATE_LOAN_FRONTEND_FIELD_ADAPTER.annualInterestRatePct.formName).toBe('annualRate')
    expect(FIXED_RATE_LOAN_FRONTEND_FIELD_ADAPTER.termMonths.formName).toBe('termValue')
    expect(FIXED_RATE_LOAN_FRONTEND_FIELD_ADAPTER.principal.formName).toBe('principal')
    expect(FIXED_RATE_LOAN_FRONTEND_FIELD_ADAPTER.startDate.formName).toBe('startDate')
  })
})
