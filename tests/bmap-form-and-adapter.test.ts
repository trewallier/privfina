import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { loadBmapProductSpecYamlFromFiles } from '../src/finance_engine/product_specs/bmap'
import { BMAP_PRODUCT_SPEC, orderedSpecFields } from '../public/controller/bmap-form.js'
import { calculateBmapFromSpecInputs } from '../public/controller/bmap-calculation-adapter.js'
import { createInvestmentMaturityPreview } from '../public/instruments.js'

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

describe('bmap spec-driven form seam', () => {
  it('keeps BMÁP frontend field metadata aligned with the product spec loader', () => {
    const loadedSpec = loadBmapProductSpecYamlFromFiles()
    const loadedByName = new Map((loadedSpec as any).inputs.map((field: any) => [field.name, field]))

    expect(BMAP_PRODUCT_SPEC.id).toBe('government-security.bmap.standard')
    expect(BMAP_PRODUCT_SPEC.family).toBe('government-security')
    expect(BMAP_PRODUCT_SPEC.variant).toBe('bmap')
    expect(orderedSpecFields(BMAP_PRODUCT_SPEC).map((field) => field.name)).toEqual([
      'principal',
      'dkjBaseYieldPct',
      'interestPremiumPct',
      'startDate',
      'purchaseDate',
      'issueDate',
      'firstCouponDate'
    ])

    for (const field of BMAP_PRODUCT_SPEC.inputs) {
      const fromLoader = loadedByName.get(field.name)
      expect(fromLoader).toBeDefined()
      expect(field.label).toBe(fromLoader?.label)
      expect(field.required).toBe(fromLoader?.required)
      expect(field.type).toBe(fromLoader?.type)
      expect(field.constraints ?? {}).toEqual(fromLoader?.constraints ?? {})
    }
  })

  it('bridges the lower-DKJ BMÁP example through the adapter and existing preview path', () => {
    const exampleText = readRepoFile(
      'docs/product-specs/products/government-securities/bmap/examples/lower-dkj-base-case.yaml'
    )

    expect(exampleText).toContain('dkjBaseYieldPct: -0.25')
    expect(exampleText).toContain('interestPremiumPct: 0.75')

    const specInputs = {
      principal: 1000000,
      dkjBaseYieldPct: -0.25,
      interestPremiumPct: 0.75,
      startDate: '2026-08-01'
    }

    const adapterOutputs = calculateBmapFromSpecInputs(specInputs, {
      createInvestmentMaturityPreview
    })

    expect(adapterOutputs).toEqual({
      effectiveDkjBaseYieldPct: 0,
      annualCouponRatePct: 0.75,
      couponPaymentFrequency: 'quarterly',
      periodCouponRatePct: 0.1875,
      accruedInterestAmount: 0,
      purchaseAmount: 1000000,
      redemptionValue: 1000000
    })
  })
})