import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import YAML from 'yaml'
import {
  deriveKtvAccruedInterestAmount,
  deriveKtvRateOutputs,
  generateKtvAnnualCouponFlows,
  ktvFirstPeriodRatePct
} from '../src/finance_engine/instruments/ktv'
import { loadKtvProductSpecYamlFromFiles } from '../src/finance_engine/product_specs/ktv'
import type { KtvSpecInputs } from '../src/finance_engine/instruments/ktv'

function readExample(relativePath: string): {
  inputs: KtvSpecInputs
  expected: Record<string, number>
} {
  const parsed = YAML.parse(readFileSync(resolve(process.cwd(), relativePath), 'utf8')) as {
    inputs: KtvSpecInputs
    expected: Record<string, number>
  }
  return parsed
}

describe('MÁK / ktv TypeScript primitives (ADR 0017 / 0038 / 0044 / ROADMAP §6j)', () => {
  it('loads and validates government-security.ktv.standard product.yaml', () => {
    const spec = loadKtvProductSpecYamlFromFiles()
    expect(spec.id).toBe('government-security.ktv.standard')
    expect(spec.productCode).toBe('ktv')
    expect(spec.specVersion).toBe('v2alpha3')
  })

  it('locks nominal-case example rates and purchase amount', () => {
    const { inputs, expected } = readExample(
      'docs/product-specs/products/government-securities/ktv/examples/nominal-case.yaml'
    )
    const rates = deriveKtvRateOutputs(inputs)
    const accrued = deriveKtvAccruedInterestAmount(inputs, rates.annualCouponRatePct)
    const purchaseAmount = Number(inputs.principal) + accrued

    expect(rates.annualCouponRatePct).toBe(expected.annualCouponRatePct)
    expect(purchaseAmount).toBe(expected.purchaseAmount)
    expect(accrued).toBe(0)
  })

  it('locks first-period stub 3.72% = 6.25% × 217/365 while keeping ga', () => {
    const { inputs, expected } = readExample(
      'docs/product-specs/products/government-securities/ktv/examples/first-period-coupon-case.yaml'
    )
    const rates = deriveKtvRateOutputs(inputs)
    const accrued = deriveKtvAccruedInterestAmount(inputs, rates.annualCouponRatePct)
    const purchaseAmount = Number(inputs.principal) + accrued

    expect(rates.annualCouponRatePct).toBe(expected.annualCouponRatePct)
    expect(purchaseAmount).toBe(Number(inputs.principal))
    expect(accrued).toBe(0)
    expect(
      ktvFirstPeriodRatePct({
        annualRatePct: Number(inputs.annualCouponRatePct),
        issueDate: String(inputs.issueDate),
        firstCouponDate: String(inputs.firstCouponDate),
        dayCountConvention: inputs.dayCountConvention
      })
    ).toBe(expected.firstPeriodCouponRatePct)

    const flows = generateKtvAnnualCouponFlows(
      inputs,
      purchaseAmount,
      rates.annualCouponRatePct
    )
    expect(flows[0]).toMatchObject({
      date: '2026-02-18',
      amount: purchaseAmount,
      direction: 'outflow'
    })
    expect(flows[1]).toMatchObject({
      date: '2026-09-23',
      amount: expected.firstCouponAmount,
      direction: 'inflow'
    })
    expect(flows[2]).toMatchObject({
      date: '2027-09-23',
      amount: 62_500,
      direction: 'inflow'
    })
  })

  it('locks mid-period-accrued-case ACT/365F accrued on ga (not the stub)', () => {
    const { inputs, expected } = readExample(
      'docs/product-specs/products/government-securities/ktv/examples/mid-period-accrued-case.yaml'
    )
    const rates = deriveKtvRateOutputs(inputs)
    const accrued = deriveKtvAccruedInterestAmount(inputs, rates.annualCouponRatePct)
    const purchaseAmount = Number(inputs.principal) + accrued

    expect(rates.annualCouponRatePct).toBe(expected.annualCouponRatePct)
    expect(accrued).toBeCloseTo(expected.accruedInterestAmount, 10)
    expect(purchaseAmount).toBeCloseTo(expected.purchaseAmount, 10)
  })
})
