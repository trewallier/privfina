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
    // Stepped schedule: each annual coupon uses the covering band rate (end-inclusive `to`).
    // firstCouponDate 2027-08-03 is covered by 2026-08-03…2027-08-03 @ 6.5%, then 7.0…8.5.
    expect(flows).toEqual([
      {
        date: '2027-02-03',
        amount: purchaseAmount,
        direction: 'outflow',
        category: 'investment',
        description: 'FixMAP'
      },
      {
        date: '2027-08-03',
        amount: 65_000,
        direction: 'inflow',
        category: 'investment',
        description: 'FixMAP'
      },
      {
        date: '2028-08-03',
        amount: 70_000,
        direction: 'inflow',
        category: 'investment',
        description: 'FixMAP'
      },
      {
        date: '2029-08-03',
        amount: 75_000,
        direction: 'inflow',
        category: 'investment',
        description: 'FixMAP'
      },
      {
        date: '2030-08-03',
        amount: 80_000,
        direction: 'inflow',
        category: 'investment',
        description: 'FixMAP'
      },
      {
        date: '2031-08-03',
        amount: 85_000,
        direction: 'inflow',
        category: 'investment',
        description: 'FixMAP'
      },
      {
        date: '2031-08-03',
        amount: inputs.principal,
        direction: 'inflow',
        category: 'investment',
        description: 'FixMAP'
      }
    ])
  })
})
