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
  it('bridges BMAP nominal example inputs through existing investment calculation path', () => {
    const exampleYaml = readRepoFile(
      'docs/product-specs/products/government-securities/bmap/examples/nominal-case.yaml'
    )
    const parsed = YAML.parse(exampleYaml) as any

    expect(exampleYaml).toContain('principal: 1000000')
    expect(exampleYaml).toContain('annualCouponRatePct: 6.88')
    expect(exampleYaml).toContain('maturityDate: 2032-04-24')
    expect(exampleYaml).not.toContain('startDate:')

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
      annualCouponRatePct: expect.any(Number),
      accruedInterestAmount: expect.any(Number),
      purchaseAmount: expect.any(Number)
    })
  })

  it('uses published effective coupon in lower-rate example', () => {
    const exampleYaml = readRepoFile(
      'docs/product-specs/products/government-securities/bmap/examples/lower-dkj-base-case.yaml'
    )
    const parsed = YAML.parse(exampleYaml) as any

    const adapterOutputs = calculateBmapFromSpecInputs(parsed.inputs, {
      createInvestmentMaturityPreview
    })

    expect(adapterOutputs).toMatchObject(parsed.expected)
    expect(adapterOutputs.annualCouponRatePct).toBe(parsed.inputs.annualCouponRatePct)
  })
})
