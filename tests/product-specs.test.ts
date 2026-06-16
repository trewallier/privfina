import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  loadFixedRateLoanProductSpec,
  generateLoanInstrumentCashFlows,
  generateLoanInstrumentCashFlowsFromFixedRateProductSpec
} from '../src/finance_engine/engine'

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

describe('fixed-rate loan product spec integration', () => {
  it('loads fixed-rate product.yaml and validates it against product.schema.json', () => {
    const productYamlText = readRepoFile(
      'docs/product-specs/products/loans/fixed-rate-loan/product.yaml'
    )
    const productSchema = JSON.parse(
      readRepoFile('docs/product-specs/schema/v1/product.schema.json')
    )

    const spec = loadFixedRateLoanProductSpec(productYamlText, productSchema)

    expect(spec.id).toBe('loan.fixed-rate.standard')
    expect(spec.family).toBe('loan')
    expect(spec.variant).toBe('fixed-rate')
  })

  it('uses existing loan calculation path with same output as manual loan input', () => {
    const productYamlText = readRepoFile(
      'docs/product-specs/products/loans/fixed-rate-loan/product.yaml'
    )
    const productSchema = JSON.parse(
      readRepoFile('docs/product-specs/schema/v1/product.schema.json')
    )
    const spec = loadFixedRateLoanProductSpec(productYamlText, productSchema)

    const specDrivenFlows = generateLoanInstrumentCashFlowsFromFixedRateProductSpec(spec, {
      principal: 100000,
      annualInterestRatePct: 5.0,
      termMonths: 360,
      startDate: '2026-01-01',
      includeDisbursement: true,
      category: 'loan'
    })

    const manualFlows = generateLoanInstrumentCashFlows({
      principal: 100000,
      annualRate: 0.05,
      termMonths: 360,
      startDate: '2026-01-01',
      repaymentDayOfMonth: 1,
      includeDisbursement: true,
      category: 'loan'
    })

    expect(specDrivenFlows).toEqual(manualFlows)
  })
})