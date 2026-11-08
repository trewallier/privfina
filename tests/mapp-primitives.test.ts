import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import YAML from 'yaml'
import {
  deriveMappAccruedInterestAmount,
  deriveMappRateOutputs,
  generateMappSemiAnnualCouponFlows
} from '../src/finance_engine/instruments/mapp'
import { loadMappProductSpecYamlFromFiles } from '../src/finance_engine/product_specs/mapp'
import type { MappSpecInputs } from '../src/finance_engine/instruments/mapp'

function readExample(relativePath: string): {
  inputs: MappSpecInputs
  expected: Record<string, number>
} {
  const parsed = YAML.parse(readFileSync(resolve(process.cwd(), relativePath), 'utf8')) as {
    inputs: MappSpecInputs
    expected: Record<string, number>
  }
  return parsed
}

describe('MÁP Plusz TypeScript primitives (ADR 0017 / 0038 / ROADMAP §6j)', () => {
  it('loads and validates government-security.mapp.standard product.yaml', () => {
    const spec = loadMappProductSpecYamlFromFiles()
    expect(spec.id).toBe('government-security.mapp.standard')
    expect(spec.productCode).toBe('mapp')
    expect(spec.specVersion).toBe('v2alpha3')
  })

  it('locks nominal-case example rates and purchase amount', () => {
    const { inputs, expected } = readExample(
      'docs/product-specs/products/government-securities/mapp/examples/nominal-case.yaml'
    )
    const rates = deriveMappRateOutputs(inputs)
    const accrued = deriveMappAccruedInterestAmount(inputs, rates.annualCouponRatePct)
    const purchaseAmount = Number(inputs.principal) + accrued

    expect(rates.annualCouponRatePct).toBe(expected.annualCouponRatePct)
    expect(purchaseAmount).toBe(expected.purchaseAmount)
    expect(accrued).toBe(0)
  })

  it('locks stepped-coupon-case covering rate, ACT/360 accrued, and semi-annual flows', () => {
    const { inputs, expected } = readExample(
      'docs/product-specs/products/government-securities/mapp/examples/stepped-coupon-case.yaml'
    )
    const rates = deriveMappRateOutputs(inputs)
    const accrued = deriveMappAccruedInterestAmount(inputs, rates.annualCouponRatePct)
    const purchaseAmount = Number(inputs.principal) + accrued

    expect(rates.annualCouponRatePct).toBe(expected.annualCouponRatePct)
    expect(accrued).toBeCloseTo(expected.accruedInterestAmount, 10)
    expect(purchaseAmount).toBeCloseTo(expected.purchaseAmount, 10)

    const flows = generateMappSemiAnnualCouponFlows(
      inputs,
      purchaseAmount,
      rates.annualCouponRatePct
    )
    // Stepped schedule: each semi-annual coupon uses covering band rate / 2 (end-inclusive `to`).
    expect(flows).toEqual([
      {
        date: '2027-01-15',
        amount: purchaseAmount,
        direction: 'outflow',
        category: 'investment',
        description: 'MAPP'
      },
      {
        date: '2027-04-02',
        amount: 25_000,
        direction: 'inflow',
        category: 'investment',
        description: 'MAPP'
      },
      {
        date: '2027-10-02',
        amount: 25_000,
        direction: 'inflow',
        category: 'investment',
        description: 'MAPP'
      },
      {
        date: '2028-04-02',
        amount: 26_250,
        direction: 'inflow',
        category: 'investment',
        description: 'MAPP'
      },
      {
        date: '2028-10-02',
        amount: 26_250,
        direction: 'inflow',
        category: 'investment',
        description: 'MAPP'
      },
      {
        date: '2029-04-02',
        amount: 27_500,
        direction: 'inflow',
        category: 'investment',
        description: 'MAPP'
      },
      {
        date: '2029-10-02',
        amount: 27_500,
        direction: 'inflow',
        category: 'investment',
        description: 'MAPP'
      },
      {
        date: '2030-04-02',
        amount: 28_750,
        direction: 'inflow',
        category: 'investment',
        description: 'MAPP'
      },
      {
        date: '2030-10-02',
        amount: 28_750,
        direction: 'inflow',
        category: 'investment',
        description: 'MAPP'
      },
      {
        date: '2031-04-02',
        amount: 30_000,
        direction: 'inflow',
        category: 'investment',
        description: 'MAPP'
      },
      {
        date: '2031-10-02',
        amount: 30_000,
        direction: 'inflow',
        category: 'investment',
        description: 'MAPP'
      },
      {
        date: '2031-10-02',
        amount: inputs.principal,
        direction: 'inflow',
        category: 'investment',
        description: 'MAPP'
      }
    ])
  })
})
