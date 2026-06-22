import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  calculateFixedRateMortgageFromSpecInputs,
  mapFixedRateMortgageSpecInputsToLegacyCalculationInput,
  mapLegacyLoanPreviewToSpecOutputs,
  mapFixedRateMortgageSpecInputsToLegacyLoanBundleInput
} from '../public/controller/fixed-rate-mortgage-calculation-adapter.js'
import { createLoanRepaymentPreview } from '../public/instruments.js'

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

describe('fixed-rate-mortgage calculation adapter seam', () => {
  it('bridges nominal fixed-rate mortgage example inputs through existing calculation path and returns spec-shaped outputs', () => {
    const exampleYaml = readRepoFile(
      'docs/product-specs/products/loans/fixed-rate-mortgage/examples/nominal-case.yaml'
    )

    expect(exampleYaml).toContain('principal: 200000')
    expect(exampleYaml).toContain('annualInterestRatePct: 4.5')
    expect(exampleYaml).toContain('termMonths: 240')
    expect(exampleYaml).toContain('startDate: 2026-01-01')

    const specInputs = {
      principal: 200000,
      annualInterestRatePct: 4.5,
      termMonths: 240,
      startDate: '2026-01-01'
    }

    let delegationCount = 0
    const delegatedExistingPath = (input: { principal: number; annualRate: number; termMonths: number }) => {
      delegationCount += 1
      return createLoanRepaymentPreview(input)
    }

    const adapterOutputs = calculateFixedRateMortgageFromSpecInputs(specInputs, {
      createLoanRepaymentPreview: delegatedExistingPath
    })

    const legacyInput = mapFixedRateMortgageSpecInputsToLegacyCalculationInput(specInputs)
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
    const mapped = mapFixedRateMortgageSpecInputsToLegacyLoanBundleInput(
      {
        principal: 200000,
        annualInterestRatePct: 4.5,
        termMonths: 240,
        startDate: '2026-01-01'
      },
      {
        label: 'Mortgage',
        repaymentDayOfMonth: 1,
        includeDisbursement: true,
        category: 'loan'
      }
    )

    expect(mapped).toMatchObject({
      principal: 200000,
      annualRate: 0.045,
      termValue: 240,
      termUnit: 'months',
      startDate: '2026-01-01',
      label: 'Mortgage',
      repaymentDayOfMonth: 1,
      includeDisbursement: true,
      category: 'loan'
    })
  })
})
