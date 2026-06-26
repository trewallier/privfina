import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import YAML from 'yaml'
import {
  FIXED_RATE_LOAN_PRODUCT_SPEC,
  FIXED_RATE_LOAN_FRONTEND_FIELD_ADAPTER,
  mapFormDataToFixedRateLoanSpecInputs,
  orderedSpecFields
} from '../public/controller/fixed-rate-loan-form.js'

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

describe('fixed-rate-loan frontend form metadata seam', () => {
  it('keeps the frontend product spec module aligned with the repository product spec', () => {
    const loadedSpec = YAML.parse(
      readRepoFile('docs/product-specs/products/loans/fixed-rate-loan/product.yaml')
    )

    expect(FIXED_RATE_LOAN_PRODUCT_SPEC).toEqual(loadedSpec)
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

  it('maps existing loan form fields into canonical fixed-rate product spec inputs', () => {
    const specInputs = mapFormDataToFixedRateLoanSpecInputs({
      get(name: string) {
        const entries: Record<string, string> = {
          principal: '100000',
          annualRate: '5',
          termValue: '30',
          termUnit: 'years',
          startDate: '2026-01-01'
        }

        return Object.prototype.hasOwnProperty.call(entries, name) ? entries[name] : null
      }
    } as any)

    expect(specInputs).toEqual({
      principal: 100000,
      annualInterestRatePct: 5,
      termMonths: 360,
      startDate: '2026-01-01'
    })
  })
})
