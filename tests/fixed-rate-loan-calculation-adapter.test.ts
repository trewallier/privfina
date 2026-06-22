import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  calculateFixedRateLoanFromSpecInputs,
  mapFixedRateLoanSpecInputsToLegacyCalculationInput,
  mapLegacyLoanPreviewToSpecOutputs,
  mapFixedRateLoanSpecInputsToLegacyLoanBundleInput
} from '../public/controller/fixed-rate-loan-calculation-adapter.js'
import { createLoanRepaymentPreview } from '../public/instruments.js'

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

describe('fixed-rate-loan calculation adapter seam', () => {
  it('bridges nominal fixed-rate example inputs through existing calculation path and returns spec-shaped outputs', () => {
    const exampleYaml = readRepoFile(
      'docs/product-specs/products/loans/fixed-rate-loan/examples/nominal-case.yaml'
    )

    expect(exampleYaml).toContain('principal: 100000')
    expect(exampleYaml).toContain('annualInterestRatePct: 5.0')
    expect(exampleYaml).toContain('termMonths: 360')
    expect(exampleYaml).toContain('startDate: 2026-01-01')

    const specInputs = {
      principal: 100000,
      annualInterestRatePct: 5,
      termMonths: 360,
      startDate: '2026-01-01'
    }

    let delegationCount = 0
    const delegatedExistingPath = (input: {
      principal: number
      annualRate: number
      termMonths: number
    }) => {
      delegationCount += 1
      return createLoanRepaymentPreview(input)
    }

    const adapterOutputs = calculateFixedRateLoanFromSpecInputs(specInputs, {
      createLoanRepaymentPreview: delegatedExistingPath
    })

    const legacyInput = mapFixedRateLoanSpecInputsToLegacyCalculationInput(specInputs)
    const legacyPreview = createLoanRepaymentPreview(legacyInput)
    const expectedSpecOutputs = mapLegacyLoanPreviewToSpecOutputs(legacyPreview)

    expect(delegationCount).toBe(1)
    expect(adapterOutputs).toEqual(expectedSpecOutputs)
    expect(adapterOutputs).toMatchObject({
      monthlyPayment: expect.any(Number),
      paymentCount: expect.any(Number),
      totalInterest: expect.any(Number),
      totalPaid: expect.any(Number)
    })
    expect(Object.keys(adapterOutputs).sort()).toEqual([
      'monthlyPayment',
      'paymentCount',
      'totalInterest',
      'totalPaid'
    ].sort())
  })

  it('maps spec-shaped inputs to existing submit bundle input shape without changing legacy fields', () => {
    const mapped = mapFixedRateLoanSpecInputsToLegacyLoanBundleInput(
      {
        principal: 100000,
        annualInterestRatePct: 5,
        termMonths: 360,
        startDate: '2026-01-01'
      },
      {
        label: 'Loan',
        repaymentDayOfMonth: 1,
        includeDisbursement: true,
        category: 'loan'
      }
    )

    expect(mapped).toMatchObject({
      principal: 100000,
      annualRate: 0.05,
      termValue: 360,
      termUnit: 'months',
      startDate: '2026-01-01',
      label: 'Loan',
      repaymentDayOfMonth: 1,
      includeDisbursement: true,
      category: 'loan'
    })
  })
})
