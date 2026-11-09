import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import YAML from 'yaml'
import {
  babaFirstPeriodRatePct,
  deriveBabaAccruedInterestAmount,
  deriveBabaRateOutputs,
  generateBabaAnnualCouponFlows,
  resolveBabaAccrualStartIso
} from '../src/finance_engine/instruments/baba'
import { loadBabaProductSpecYamlFromFiles } from '../src/finance_engine/product_specs/baba'
import type { BabaSpecInputs } from '../src/finance_engine/instruments/baba'

function readExample(relativePath: string): {
  inputs: BabaSpecInputs
  expected: Record<string, number>
} {
  const parsed = YAML.parse(readFileSync(resolve(process.cwd(), relativePath), 'utf8')) as {
    inputs: BabaSpecInputs
    expected: Record<string, number>
  }
  return parsed
}

describe('Babakötvény TypeScript primitives (ADR 0017 / 0038 / ROADMAP §6j)', () => {
  it('loads and validates government-security.baba.standard product.yaml', () => {
    const spec = loadBabaProductSpecYamlFromFiles()
    expect(spec.id).toBe('government-security.baba.standard')
    expect(spec.productCode).toBe('baba')
    expect(spec.specVersion).toBe('v2alpha3')
  })

  it('locks 2045/S first-period cash coupon rate 7.38%', () => {
    expect(
      babaFirstPeriodRatePct({
        annualRatePct: 7.4,
        issueDate: '2026-02-02',
        firstCouponDate: '2027-02-01'
      })
    ).toBe(7.38)
  })

  it('locks nominal-case example rates and purchase amount', () => {
    const { inputs, expected } = readExample(
      'docs/product-specs/products/government-securities/baba/examples/nominal-case.yaml'
    )
    const rates = deriveBabaRateOutputs(inputs)
    const accrued = deriveBabaAccruedInterestAmount(inputs, rates.annualCouponRatePct)
    const purchaseAmount = Number(inputs.principal) + accrued

    expect(rates.annualCouponRatePct).toBe(expected.annualCouponRatePct)
    expect(accrued).toBe(expected.accruedInterestAmount)
    expect(purchaseAmount).toBe(expected.purchaseAmount)
  })

  it('locks first-period-coupon-case payable rate and cash amount', () => {
    const { inputs, expected } = readExample(
      'docs/product-specs/products/government-securities/baba/examples/first-period-coupon-case.yaml'
    )
    const rates = deriveBabaRateOutputs(inputs)
    expect(rates.annualCouponRatePct).toBe(expected.annualCouponRatePct)
    expect(
      babaFirstPeriodRatePct({
        annualRatePct: rates.annualCouponRatePct,
        issueDate: String(inputs.issueDate),
        firstCouponDate: String(inputs.firstCouponDate)
      })
    ).toBe(expected.firstPeriodCouponRatePct)

    const flows = generateBabaAnnualCouponFlows(inputs, 1_000_000, rates.annualCouponRatePct)
    const firstCoupon = flows.find(
      (f) => f.direction === 'inflow' && f.date === String(inputs.firstCouponDate)
    )
    expect(firstCoupon?.amount).toBe(expected.firstCouponAmount)
  })

  it('locks mid-period-accrued-case ACT/ACT accrued in short first period', () => {
    const { inputs, expected } = readExample(
      'docs/product-specs/products/government-securities/baba/examples/mid-period-accrued-case.yaml'
    )
    const rates = deriveBabaRateOutputs(inputs)
    const accrued = deriveBabaAccruedInterestAmount(inputs, rates.annualCouponRatePct)
    const purchaseAmount = Number(inputs.principal) + accrued

    expect(rates.annualCouponRatePct).toBe(expected.annualCouponRatePct)
    expect(accrued).toBeCloseTo(expected.accruedInterestAmount, 10)
    expect(purchaseAmount).toBeCloseTo(expected.purchaseAmount, 10)
  })

  it('pays annual HUF coupons (not kamatjuttatás) through maturity', () => {
    const { inputs } = readExample(
      'docs/product-specs/products/government-securities/baba/examples/nominal-case.yaml'
    )
    const rates = deriveBabaRateOutputs(inputs)
    const flows = generateBabaAnnualCouponFlows(inputs, 1_000_000, rates.annualCouponRatePct)
    expect(flows.filter((f) => f.direction === 'outflow')).toHaveLength(1)
    const inflows = flows.filter((f) => f.direction === 'inflow')
    // First coupon 2027-02-01 … maturity coupon + principal on 2045-02-01.
    expect(inflows.length).toBeGreaterThan(2)
    expect(inflows[0].date).toBe('2027-02-01')
    expect(inflows[0].amount).toBe(73_800)
    const maturityFlows = inflows.filter((f) => f.date === '2045-02-01')
    expect(maturityFlows).toHaveLength(2)
    expect(maturityFlows.some((f) => f.amount === 1_000_000)).toBe(true)
  })

  it('locks mid-period-after-coupon accrual from last payment', () => {
    const { inputs, expected } = readExample(
      'docs/product-specs/products/government-securities/baba/examples/mid-period-after-coupon-case.yaml'
    )
    expect(resolveBabaAccrualStartIso(inputs)).toBe('2027-02-01')

    const rates = deriveBabaRateOutputs(inputs)
    const accrued = deriveBabaAccruedInterestAmount(inputs, rates.annualCouponRatePct)
    const purchaseAmount = Number(inputs.principal) + accrued

    expect(rates.annualCouponRatePct).toBe(expected.annualCouponRatePct)
    expect(accrued).toBeCloseTo(expected.accruedInterestAmount, 10)
    expect(purchaseAmount).toBeCloseTo(expected.purchaseAmount, 10)

    const onCoupon = deriveBabaAccruedInterestAmount(
      { ...inputs, purchaseDate: '2027-02-01' },
      rates.annualCouponRatePct
    )
    expect(onCoupon).toBe(0)
  })

  it('skips unpublished couponSchedule bands without inventing cash coupons', () => {
    const { inputs, expected } = readExample(
      'docs/product-specs/products/government-securities/baba/examples/schedule-gap-skip-case.yaml'
    )
    const rates = deriveBabaRateOutputs(inputs)
    expect(rates.annualCouponRatePct).toBe(expected.annualCouponRatePct)

    const flows = generateBabaAnnualCouponFlows(inputs, 1_000_000, rates.annualCouponRatePct)
    const couponInflows = flows.filter(
      (f) => f.direction === 'inflow' && f.amount !== Number(inputs.principal)
    )
    expect(couponInflows).toHaveLength(expected.couponPaymentCount)
    expect(couponInflows[0].date).toBe('2027-02-01')
    expect(couponInflows[0].amount).toBe(expected.firstCouponAmount)
    expect(couponInflows[1].date).toBe('2029-02-01')
    expect(couponInflows[1].amount).toBe(expected.secondPublishedCouponAmount)
    expect(couponInflows.some((f) => f.date === '2028-02-01')).toBe(false)
  })
})
