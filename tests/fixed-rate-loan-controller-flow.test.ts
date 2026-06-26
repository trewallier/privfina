import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import YAML from 'yaml'
import {
  FIXED_RATE_LOAN_PRODUCT_SPEC,
  mapFormDataToFixedRateLoanSpecInputs
} from '../public/controller/fixed-rate-loan-form.js'
import {
  calculateFixedRateLoanFromSpecInputs,
  mapFixedRateLoanSpecInputsToLegacyLoanBundleInput
} from '../public/controller/fixed-rate-loan-calculation-adapter.js'
import { createLoanRepaymentPreview, generateLoanInstrumentBundle } from '../public/instruments.js'

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

function createFormDataLike(entries: Record<string, string>): { get(name: string): string | null } {
  return {
    get(name: string) {
      return Object.prototype.hasOwnProperty.call(entries, name) ? entries[name] : null
    }
  }
}

describe('fixed-rate-loan ui/controller integration seam', () => {
  it('maps spec-backed fixed-rate loan form values through adapter and loan bundle generation', () => {
    const exampleYaml = readRepoFile('docs/product-specs/products/loans/fixed-rate-loan/examples/nominal-case.yaml')
    const parsed = YAML.parse(exampleYaml) as any

    const formData = createFormDataLike({
      principal: String(parsed.inputs.principal),
      annualRate: String(parsed.inputs.annualInterestRatePct),
      termValue: '30',
      termUnit: 'years',
      startDate: String(parsed.inputs.startDate)
    })

    const specInputs = mapFormDataToFixedRateLoanSpecInputs(formData as any)
    const outputs = calculateFixedRateLoanFromSpecInputs(specInputs, { createLoanRepaymentPreview })
    const bundle = generateLoanInstrumentBundle(
      mapFixedRateLoanSpecInputsToLegacyLoanBundleInput(specInputs, {
        label: FIXED_RATE_LOAN_PRODUCT_SPEC.ui.formTitle,
        category: 'loan',
        includeDisbursement: true,
        repaymentDayOfMonth: 1,
        termValue: 30,
        termUnit: 'years'
      })
    )

    expect(specInputs).toEqual({
      principal: parsed.inputs.principal,
      annualInterestRatePct: parsed.inputs.annualInterestRatePct,
      termMonths: parsed.inputs.termMonths,
      startDate: parsed.inputs.startDate
    })

    expect(outputs.paymentCount).toBe(parsed.expected.paymentCount)
    expect(outputs.monthlyPayment).toBeCloseTo(bundle.preview.monthlyInstallment, 8)
    expect(outputs.totalInterest).toBeCloseTo(bundle.preview.totalInterest, 8)
    expect(outputs.totalPaid).toBeCloseTo(bundle.preview.totalRepayment, 8)

    expect(bundle.config.productId).toBe(FIXED_RATE_LOAN_PRODUCT_SPEC.id)
    expect(bundle.config.annualRate).toBeCloseTo(0.05, 8)
    expect(bundle.config.termMonths).toBe(360)
    expect(bundle.config.termValue).toBe(30)
    expect(bundle.config.termUnit).toBe('years')
    expect(bundle.generatedFlows[0]).toMatchObject({
      direction: 'inflow',
      amount: parsed.inputs.principal,
      date: parsed.inputs.startDate
    })
    expect(bundle.generatedFlows.filter((flow) => flow.direction === 'outflow')).toHaveLength(parsed.expected.paymentCount)
  })
})