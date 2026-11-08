import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import YAML from 'yaml'
import {
  deriveMappAccruedInterestAmount,
  deriveMappRateOutputs,
  generateMappCouponFlows,
  mappFirstPeriodRatePct,
  resolveMappAccrualStartIso
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

  it('locks 2031/M6 first-period tényleges kamat gp ≈ 5.77%', () => {
    expect(
      mappFirstPeriodRatePct({
        annualRatePct: 5,
        issueDate: '2026-10-02',
        firstCouponDate: '2027-11-27',
        couponFrequencyMonths: 12
      })
    ).toBeCloseTo(5.77, 2)
  })

  it('locks nominal-case example rates and purchase amount', () => {
    const { inputs, expected } = readExample(
      'docs/product-specs/products/government-securities/mapp/examples/nominal-case.yaml'
    )
    const rates = deriveMappRateOutputs(inputs)
    const accrued = deriveMappAccruedInterestAmount(inputs, rates.annualCouponRatePct)
    const purchaseAmount = Number(inputs.principal) + accrued

    expect(rates.annualCouponRatePct).toBe(expected.annualCouponRatePct)
    expect(accrued).toBe(expected.accruedInterestAmount)
    expect(purchaseAmount).toBe(expected.purchaseAmount)
  })

  it('locks stepped-coupon-case Ismertető first-period accrued', () => {
    const { inputs, expected } = readExample(
      'docs/product-specs/products/government-securities/mapp/examples/stepped-coupon-case.yaml'
    )
    const rates = deriveMappRateOutputs(inputs)
    const accrued = deriveMappAccruedInterestAmount(inputs, rates.annualCouponRatePct)
    const purchaseAmount = Number(inputs.principal) + accrued

    expect(rates.annualCouponRatePct).toBe(expected.annualCouponRatePct)
    expect(accrued).toBeCloseTo(expected.accruedInterestAmount, 10)
    expect(purchaseAmount).toBeCloseTo(expected.purchaseAmount, 10)
  })

  it('locks mid-period-after-coupon accrual from last payment', () => {
    const { inputs, expected } = readExample(
      'docs/product-specs/products/government-securities/mapp/examples/mid-period-after-coupon-case.yaml'
    )
    expect(resolveMappAccrualStartIso(inputs)).toBe('2027-11-27')

    const rates = deriveMappRateOutputs(inputs)
    const accrued = deriveMappAccruedInterestAmount(inputs, rates.annualCouponRatePct)
    const purchaseAmount = Number(inputs.principal) + accrued

    expect(rates.annualCouponRatePct).toBe(expected.annualCouponRatePct)
    expect(accrued).toBeCloseTo(expected.accruedInterestAmount, 10)
    expect(purchaseAmount).toBeCloseTo(expected.purchaseAmount, 10)

    const onCoupon = deriveMappAccruedInterestAmount(
      { ...inputs, purchaseDate: '2027-11-27' },
      rates.annualCouponRatePct
    )
    expect(onCoupon).toBe(0)
  })

  it('locks semi-annual-legacy-case and compounds in-kind coupons', () => {
    const { inputs, expected } = readExample(
      'docs/product-specs/products/government-securities/mapp/examples/semi-annual-legacy-case.yaml'
    )
    const rates = deriveMappRateOutputs(inputs)
    const accrued = deriveMappAccruedInterestAmount(inputs, rates.annualCouponRatePct)
    expect(rates.annualCouponRatePct).toBe(expected.annualCouponRatePct)
    expect(accrued).toBe(expected.accruedInterestAmount)

    const flows = generateMappCouponFlows(inputs, expected.purchaseAmount, rates.annualCouponRatePct)
    // Purchase outflow only until maturity (intermediate kamatjuttatás is in-kind).
    expect(flows.filter((f) => f.direction === 'outflow')).toHaveLength(1)
    const inflows = flows.filter((f) => f.direction === 'inflow')
    expect(inflows.length).toBe(2)
    // Nine in-kind 2% coupons then maturity cash on compounded face: 1e6*(1.02)^9.
    const compounded = 1_000_000 * 1.02 ** 9
    const finalCoupon = compounded * 0.02
    expect(inflows[0].amount).toBeCloseTo(finalCoupon, 6)
    expect(inflows[1].amount).toBeCloseTo(compounded, 6)
    expect(inflows[0].date).toBe('2025-06-01')
    expect(inflows[1].date).toBe('2025-06-01')
  })

  it('annual 2031/M6 path pays HUF coupon only at maturity after in-kind coupons', () => {
    const { inputs } = readExample(
      'docs/product-specs/products/government-securities/mapp/examples/nominal-case.yaml'
    )
    const rates = deriveMappRateOutputs(inputs)
    const flows = generateMappCouponFlows(inputs, 1_000_000, rates.annualCouponRatePct)
    const inflows = flows.filter((f) => f.direction === 'inflow')
    expect(inflows.every((f) => f.date === '2031-11-27')).toBe(true)
    expect(inflows).toHaveLength(2)
  })
})
