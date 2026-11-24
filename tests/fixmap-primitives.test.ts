import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import YAML from 'yaml'
import {
  deriveFixmapAccruedInterestAmount,
  deriveFixmapRateOutputs,
  FIXMAP_COUPON_FREQUENCY_MONTHS,
  generateFixmapQuarterlyCouponFlows
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

    const flows = generateFixmapQuarterlyCouponFlows(
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

    const flows = generateFixmapQuarterlyCouponFlows(
      inputs,
      purchaseAmount,
      rates.annualCouponRatePct
    )
    // Purchase mid first band (not on a coupon day). Annual rate-band Froms are not a
    // quarterly payment calendar — walk firstCouponDate by 3 months; coupons only after purchase.
    expect(flows[0]).toEqual({
      date: '2026-12-15',
      amount: purchaseAmount,
      direction: 'outflow',
      category: 'investment',
      description: 'FixMAP'
    })
    const coupons = flows.filter(
      (f) => f.direction === 'inflow' && f.amount !== inputs.principal
    )
    expect(coupons[0]?.date).toBe('2027-02-03')
    expect(coupons[0]?.amount).toBe(16_250)
    expect(coupons.some((c) => c.date === '2026-12-15')).toBe(false)
    expect(coupons.some((c) => c.date === '2026-11-03')).toBe(false)
    expect(coupons.at(-1)?.date).toBe('2031-08-03')
    expect(coupons.at(-1)?.amount).toBe(21_250)
    expect(flows.at(-1)).toEqual({
      date: '2031-08-03',
      amount: inputs.principal,
      direction: 'inflow',
      category: 'investment',
      description: 'FixMAP'
    })
  })

  it('excludes purchase-day coupon cash (dirty price already prices accrued)', () => {
    const inputs: FixmapSpecInputs = {
      principal: 1_000_000,
      annualCouponRatePct: 6.5,
      purchaseDate: '2027-02-03',
      issueDate: '2026-08-03',
      maturityDate: '2031-08-03',
      firstCouponDate: '2026-11-03',
      dayCountConvention: 'ACT/360'
    }
    const flows = generateFixmapQuarterlyCouponFlows(inputs, 1_032_222.22, 6.5)
    const coupons = flows.filter(
      (f) => f.direction === 'inflow' && f.amount !== inputs.principal
    )
    expect(coupons.map((c) => c.date)).not.toContain('2027-02-03')
    expect(coupons[0]?.date).toBe('2027-05-03')
  })

  it('mid-hold ACT/360 accrued restarts at last quarterly payment, not annual band From', () => {
    const inputs: FixmapSpecInputs = {
      principal: 1_000_000,
      annualCouponRatePct: 6.5,
      purchaseDate: '2026-12-15',
      issueDate: '2026-08-03',
      maturityDate: '2031-08-03',
      firstCouponDate: '2026-11-03',
      dayCountConvention: 'ACT/360',
      couponSchedule: [
        { from: '2026-08-03', to: '2027-08-03', rate: 6.5 },
        { from: '2027-08-03', to: '2028-08-03', rate: 7.0 }
      ]
    }
    // 42 ACT/360 days from 2026-11-03 → 2026-12-15 (not 134 from band From).
    expect(deriveFixmapAccruedInterestAmount(inputs, 6.5)).toBeCloseTo(
      (1_000_000 * 6.5 * 42) / (100 * 360),
      8
    )
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
    const flows = generateFixmapQuarterlyCouponFlows(inputs, 1_000_000, 6.5)
    const coupons = flows.filter((f) => f.direction === 'inflow' && f.amount === 16_250)
    expect(coupons.map((c) => c.date)).toEqual([
      '2025-10-25',
      '2026-01-25',
      '2026-04-25',
      '2026-07-25'
    ])
  })

  it('prefers explicit paymentDates over schedule-gap heuristic', () => {
    const inputs: FixmapSpecInputs = {
      principal: 1_000_000,
      annualCouponRatePct: 6.5,
      purchaseDate: '2026-08-03',
      issueDate: '2026-08-03',
      maturityDate: '2027-08-03',
      firstCouponDate: '2026-11-03',
      // Annual-looking gaps — heuristic would skip; explicit payments win.
      couponSchedule: [
        { from: '2026-08-03', to: '2027-08-03', rate: 6.5 }
      ]
    }
    const flows = generateFixmapQuarterlyCouponFlows(
      inputs,
      1_000_000,
      6.5,
      'FixMAP',
      ['2026-11-03', '2027-02-03', '2027-05-03', '2027-08-03']
    )
    const coupons = flows.filter(
      (f) => f.direction === 'inflow' && f.amount !== inputs.principal
    )
    expect(coupons.map((c) => c.date)).toEqual([
      '2026-11-03',
      '2027-02-03',
      '2027-05-03',
      '2027-08-03'
    ])
  })
})
