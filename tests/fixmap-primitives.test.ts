import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import YAML from 'yaml'
import {
  deriveFixmapAccruedInterestAmount,
  deriveFixmapRateOutputs,
  generateFixmapAnnualCouponFlows
} from '../src/finance_engine/instruments/fixmap'
import { loadFixmapProductSpecYamlFromFiles } from '../src/finance_engine/product_specs/fixmap'
import type { FixmapSpecInputs } from '../src/finance_engine/instruments/fixmap'

function readExample(relativePath: string): {
  inputs: FixmapSpecInputs
  expected: Record<string, number>
} {
  const parsed = YAML.parse(readFileSync(resolve(process.cwd(), relativePath), 'utf8')) as {
    inputs: FixmapSpecInputs
    expected: Record<string, number>
  }
  return parsed
}

describe('FixMÁP TypeScript primitives (ADR 0017 / 0038 / ROADMAP §6j)', () => {
  it('loads and validates government-security.fixmap.standard product.yaml', () => {
    const spec = loadFixmapProductSpecYamlFromFiles()
    expect(spec.id).toBe('government-security.fixmap.standard')
    expect(spec.productCode).toBe('fixmap')
    expect(spec.specVersion).toBe('v2alpha3')
  })

  it('locks nominal-case example rates and purchase amount', () => {
    const { inputs, expected } = readExample(
      'docs/product-specs/products/government-securities/fixmap/examples/nominal-case.yaml'
    )
    const rates = deriveFixmapRateOutputs(inputs)
    const accrued = deriveFixmapAccruedInterestAmount(inputs, rates.annualCouponRatePct)
    const purchaseAmount = Number(inputs.principal) + accrued

    expect(rates.annualCouponRatePct).toBe(expected.annualCouponRatePct)
    expect(purchaseAmount).toBe(expected.purchaseAmount)
    expect(accrued).toBe(0)
  })

  it('locks stepped-coupon-case covering rate and ACT/360 accrued', () => {
    const { inputs, expected } = readExample(
      'docs/product-specs/products/government-securities/fixmap/examples/stepped-coupon-case.yaml'
    )
    const rates = deriveFixmapRateOutputs(inputs)
    const accrued = deriveFixmapAccruedInterestAmount(inputs, rates.annualCouponRatePct)
    const purchaseAmount = Number(inputs.principal) + accrued

    expect(rates.annualCouponRatePct).toBe(expected.annualCouponRatePct)
    expect(accrued).toBeCloseTo(expected.accruedInterestAmount, 10)
    expect(purchaseAmount).toBeCloseTo(expected.purchaseAmount, 10)

    const flows = generateFixmapAnnualCouponFlows(
      inputs,
      purchaseAmount,
      rates.annualCouponRatePct
    )
    expect(flows[0]).toMatchObject({
      date: inputs.purchaseDate,
      direction: 'outflow',
      amount: purchaseAmount
    })
    expect(flows.at(-1)).toMatchObject({
      date: inputs.maturityDate,
      direction: 'inflow',
      amount: inputs.principal
    })
    expect(flows.some((flow) => String(flow.description || '').includes('FixMAP'))).toBe(true)
  })
})
