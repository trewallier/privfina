import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import YAML from 'yaml'
import {
  loadFixedRateLoanProductSpec,
  generateLoanInstrumentCashFlowsFromFixedRateProductSpec
} from '../src/finance_engine/engine'

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

describe('fixed-rate loan example as executable specification', () => {
  function loadLoanProductSpec() {
    const productYamlText = readRepoFile(
      'docs/product-specs/products/loans/fixed-rate-loan/product.yaml'
    )
    const productSchema = JSON.parse(
      readRepoFile('docs/product-specs/schema/v2/product.schema.json')
    )
    return loadFixedRateLoanProductSpec(productYamlText, productSchema)
  }

  it('loads the nominal-case example and asserts expected payment count', () => {
    const exampleText = readRepoFile(
      'docs/product-specs/products/loans/fixed-rate-loan/examples/nominal-case.yaml'
    )

    const example = YAML.parse(exampleText) as any
    const spec = loadLoanProductSpec()

    const inputs = example.inputs
    const expectedPaymentCount = example.expected && example.expected.paymentCount

    expect(typeof expectedPaymentCount).toBe('number')

    const flows = generateLoanInstrumentCashFlowsFromFixedRateProductSpec(spec, inputs)

    // Count scheduled outflow payments (exclude any disbursement inflow)
    const paymentFlows = flows.filter((f: any) => f.direction === 'outflow')

    expect(paymentFlows.length).toBe(expectedPaymentCount)
  })

  it('loads the grace-capitalize example and asserts payment count plus amortizing principal', () => {
    const example = YAML.parse(
      readRepoFile(
        'docs/product-specs/products/loans/fixed-rate-loan/examples/grace-capitalize-case.yaml'
      )
    ) as any
    const spec = loadLoanProductSpec()
    const flows = generateLoanInstrumentCashFlowsFromFixedRateProductSpec(spec, example.inputs)
    const paymentFlows = flows.filter((f: any) => f.direction === 'outflow')

    expect(paymentFlows.length).toBe(example.expected.paymentCount)
    expect(paymentFlows[0].amount).toBeCloseTo(example.expected.monthlyPayment, 5)
  })

  it('loads the grace-interest-only example and asserts mixed payment amounts', () => {
    const example = YAML.parse(
      readRepoFile(
        'docs/product-specs/products/loans/fixed-rate-loan/examples/grace-interest-only-case.yaml'
      )
    ) as any
    const spec = loadLoanProductSpec()
    const flows = generateLoanInstrumentCashFlowsFromFixedRateProductSpec(spec, example.inputs)
    const paymentFlows = flows.filter((f: any) => f.direction === 'outflow')

    expect(paymentFlows.length).toBe(example.expected.paymentCount)
    expect(paymentFlows[0].amount).toBeCloseTo(example.expected.graceInterestOnlyPayment, 8)
    expect(paymentFlows[3].amount).toBeCloseTo(example.expected.monthlyPayment, 5)
  })
})
