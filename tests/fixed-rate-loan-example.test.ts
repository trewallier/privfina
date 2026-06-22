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
  it('loads the nominal-case example and asserts expected payment count', () => {
    const exampleText = readRepoFile(
      'docs/product-specs/products/loans/fixed-rate-loan/examples/nominal-case.yaml'
    )

    const example = YAML.parse(exampleText) as any

    // load and validate the product spec to obtain the adapter contract
    const productYamlText = readRepoFile(
      'docs/product-specs/products/loans/fixed-rate-loan/product.yaml'
    )
    const productSchema = JSON.parse(
      readRepoFile('docs/product-specs/schema/v1/product.schema.json')
    )

    const spec = loadFixedRateLoanProductSpec(productYamlText, productSchema)

    const inputs = example.inputs
    const expectedPaymentCount = example.expected && example.expected.paymentCount

    expect(typeof expectedPaymentCount).toBe('number')

    const flows = generateLoanInstrumentCashFlowsFromFixedRateProductSpec(spec, inputs)

    // Count scheduled outflow payments (exclude any disbursement inflow)
    const paymentFlows = flows.filter((f: any) => f.direction === 'outflow')

    expect(paymentFlows.length).toBe(expectedPaymentCount)
  })
})
