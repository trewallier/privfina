import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import YAML from 'yaml'
import { calculateBmapFromSpecInputs } from '../public/controller/bmap-calculation-adapter.js'
import { createInvestmentMaturityPreview } from '../public/instruments.js'

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

describe('bmap calculation adapter seam', () => {
  it('bridges BMÁP nominal example inputs through existing investment calculation path', () => {
    const exampleYaml = readRepoFile('docs/product-specs/products/government-securities/bmap/examples/nominal-case.yaml')
    const parsed = YAML.parse(exampleYaml) as any

    expect(exampleYaml).toContain('principal: 1000000')
    expect(exampleYaml).toContain('dkjBaseYieldPct: 6.13')
    expect(exampleYaml).toContain('interestPremiumPct: 0.75')
    expect(exampleYaml).toContain('startDate: 2026-04-24')

    let delegationCount = 0
    const delegatedExistingPath = (input) => {
      delegationCount += 1
      return createInvestmentMaturityPreview(input)
    }

    const adapterOutputs = calculateBmapFromSpecInputs(parsed.inputs, {
      createInvestmentMaturityPreview: delegatedExistingPath
    })

    expect(delegationCount).toBe(1)
    expect(adapterOutputs).toMatchObject(parsed.expected)
    expect(adapterOutputs).toMatchObject({
      effectiveDkjBaseYieldPct: expect.any(Number),
      annualCouponRatePct: expect.any(Number),
      couponPaymentFrequency: expect.any(String),
      periodCouponRatePct: expect.any(Number),
      accruedInterestAmount: expect.any(Number),
      purchaseAmount: expect.any(Number),
      redemptionValue: expect.any(Number)
    })
  })

  it('floors negative DKJ base yield to zero in lower-DKJ example', () => {
    const exampleYaml = readRepoFile(
      'docs/product-specs/products/government-securities/bmap/examples/lower-dkj-base-case.yaml'
    )
    const parsed = YAML.parse(exampleYaml) as any

    const adapterOutputs = calculateBmapFromSpecInputs(parsed.inputs, {
      createInvestmentMaturityPreview
    })

    expect(adapterOutputs).toMatchObject(parsed.expected)
    expect(adapterOutputs.effectiveDkjBaseYieldPct).toBe(0)
    expect(adapterOutputs.annualCouponRatePct).toBe(parsed.inputs.interestPremiumPct)
  })
})
