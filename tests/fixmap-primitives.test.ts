import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import YAML from 'yaml'
import {
  deriveFixmapAccruedInterestAmount,
  deriveFixmapRateOutputs,
  FIXMAP_COUPON_FREQUENCY_MONTHS,
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
    expect(String(spec.description || '')).toMatch(/quarterly/i)
    expect(FIXMAP_COUPON_FREQUENCY_MONTHS).toBe(3)
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

    const flows = generateFixmapAnnualCouponFlows(
      inputs,
      purchaseAmount,
      rates.annualCouponRatePct
    )
    const coupons = flows.filter(
      (f) => f.direction === 'inflow' && f.amount !== inputs.principal
    )
    // Quarterly ga/4 from firstCouponDate through maturity (issue=purchase → all due).
    expect(coupons[0]?.date).toBe('2026-11-03')
    expect(coupons[0]?.amount).toBe(16_250)
    expect(coupons.every((c) => c.amount === 16_250)).toBe(true)
    expect(coupons.length).toBe(20)
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
    // Annual rate-band Froms are not a quarterly payment calendar — walk firstCouponDate
    // by 3 months; each coupon uses covering band rate × 1/4.
    expect(flows).toEqual([
      {
        date: '2027-02-03',
        amount: purchaseAmount,
        direction: 'outflow',
        category: 'investment',
        description: 'FixMAP'
      },
      {
        date: '2027-02-03',
        amount: 16_250,
        direction: 'inflow',
        category: 'investment',
        description: 'FixMAP'
      },
      {
        date: '2027-05-03',
        amount: 16_250,
        direction: 'inflow',
        category: 'investment',
        description: 'FixMAP'
      },
      {
        date: '2027-08-03',
        amount: 16_250,
        direction: 'inflow',
        category: 'investment',
        description: 'FixMAP'
      },
      {
        date: '2027-11-03',
        amount: 17_500,
        direction: 'inflow',
        category: 'investment',
        description: 'FixMAP'
      },
      {
        date: '2028-02-03',
        amount: 17_500,
        direction: 'inflow',
        category: 'investment',
        description: 'FixMAP'
      },
      {
        date: '2028-05-03',
        amount: 17_500,
        direction: 'inflow',
        category: 'investment',
        description: 'FixMAP'
      },
      {
        date: '2028-08-03',
        amount: 17_500,
        direction: 'inflow',
        category: 'investment',
        description: 'FixMAP'
      },
      {
        date: '2028-11-03',
        amount: 18_750,
        direction: 'inflow',
        category: 'investment',
        description: 'FixMAP'
      },
      {
        date: '2029-02-03',
        amount: 18_750,
        direction: 'inflow',
        category: 'investment',
        description: 'FixMAP'
      },
      {
        date: '2029-05-03',
        amount: 18_750,
        direction: 'inflow',
        category: 'investment',
        description: 'FixMAP'
      },
      {
        date: '2029-08-03',
        amount: 18_750,
        direction: 'inflow',
        category: 'investment',
        description: 'FixMAP'
      },
      {
        date: '2029-11-03',
        amount: 20_000,
        direction: 'inflow',
        category: 'investment',
        description: 'FixMAP'
      },
      {
        date: '2030-02-03',
        amount: 20_000,
        direction: 'inflow',
        category: 'investment',
        description: 'FixMAP'
      },
      {
        date: '2030-05-03',
        amount: 20_000,
        direction: 'inflow',
        category: 'investment',
        description: 'FixMAP'
      },
      {
        date: '2030-08-03',
        amount: 20_000,
        direction: 'inflow',
        category: 'investment',
        description: 'FixMAP'
      },
      {
        date: '2030-11-03',
        amount: 21_250,
        direction: 'inflow',
        category: 'investment',
        description: 'FixMAP'
      },
      {
        date: '2031-02-03',
        amount: 21_250,
        direction: 'inflow',
        category: 'investment',
        description: 'FixMAP'
      },
      {
        date: '2031-05-03',
        amount: 21_250,
        direction: 'inflow',
        category: 'investment',
        description: 'FixMAP'
      },
      {
        date: '2031-08-03',
        amount: 21_250,
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

  it('uses offering-shaped quarterly schedule Froms as the payment calendar', () => {
    const inputs: FixmapSpecInputs = {
      principal: 1_000_000,
      annualCouponRatePct: 6.5,
      purchaseDate: '2025-07-02',
      issueDate: '2025-07-02',
      maturityDate: '2030-07-25',
      firstCouponDate: '2025-10-25',
      couponSchedule: [
        { from: '2025-07-02', to: '2025-10-24', rate: 6.5 },
        { from: '2025-10-25', to: '2026-01-24', rate: 6.5 },
        { from: '2026-01-25', to: '2026-04-24', rate: 6.5 },
        { from: '2026-04-25', to: '2026-07-24', rate: 6.5 },
        { from: '2026-07-25', to: null, rate: 6.5 }
      ]
    }
    const flows = generateFixmapAnnualCouponFlows(inputs, 1_000_000, 6.5)
    const coupons = flows.filter((f) => f.direction === 'inflow' && f.amount === 16_250)
    expect(coupons.map((c) => c.date)).toEqual([
      '2025-10-25',
      '2026-01-25',
      '2026-04-25',
      '2026-07-25'
    ])
  })
})
