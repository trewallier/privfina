/**
 * fully-spec-backed: embedded `home-savings-product-spec.js` ≡ product YAML.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import YAML from 'yaml'
import { HOME_SAVINGS_PREMIUM_PLUSZ_10X30_PRODUCT_SPEC } from '../public/controller/home-savings-product-spec.js'
import {
  findHomeSavingsProduct,
  HOME_SAVINGS_PRODUCTS
} from '../public/controller/home-savings-product-metadata.js'

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

describe('home-savings embedded product-spec parity (fully-spec-backed)', () => {
  const yaml = YAML.parse(
    readRepoFile('docs/product-specs/products/home-savings/premium-plusz-10x30/product.yaml')
  )
  const embedded = HOME_SAVINGS_PREMIUM_PLUSZ_10X30_PRODUCT_SPEC

  it('matches identity / engine / fee / discount / input locks from YAML', () => {
    expect(embedded.specVersion).toBe(yaml.specVersion)
    expect(embedded.id).toBe(yaml.id)
    expect(embedded.family).toBe(yaml.family)
    expect(embedded.variant).toBe(yaml.variant)
    expect(embedded.productCode).toBe(yaml.productCode)
    expect(embedded.displayName).toBe(yaml.displayName)

    expect(embedded.engine.instrumentType).toBe(yaml.engine.instrumentType)
    expect(embedded.engine.depositInterestAnnualRatePct).toBe(
      yaml.engine.depositInterestAnnualRatePct
    )
    expect(embedded.engine.savingsRatePermille).toBe(yaml.engine.savingsRatePermille)
    expect(embedded.engine.minContractAmount).toBe(yaml.engine.minContractAmount)
    expect(embedded.engine.maxContractAmount).toBe(yaml.engine.maxContractAmount)
    expect(embedded.engine.evaluationMinMonths).toBe(yaml.engine.evaluationMinMonths)
    expect(embedded.engine.allocationMinMonths).toBe(yaml.engine.allocationMinMonths)
    expect(embedded.saleWindow).toEqual(yaml.saleWindow)
    expect(embedded.premiumTiers).toEqual(yaml.premiumTiers)

    expect(embedded.eligibilityRules).toEqual(yaml.eligibilityRules)
    expect(embedded.fees.map((f: { name: string }) => f.name)).toEqual(
      yaml.fees.map((f: { name: string }) => f.name)
    )
    expect(embedded.discounts.map((d: { name: string }) => d.name)).toEqual(
      yaml.discounts.map((d: { name: string }) => d.name)
    )

    const yamlOpeningModes = yaml.inputs.find(
      (f: { name: string }) => f.name === 'openingFeeMode'
    )?.constraints?.enum
    const embeddedOpeningModes = embedded.inputs.find((f) => f.name === 'openingFeeMode')
      ?.constraints?.enum
    expect(embeddedOpeningModes).toEqual(yamlOpeningModes)

    const yamlDeposit = yaml.inputs.find((f: { name: string }) => f.name === 'monthlyDeposit')
    const embeddedDeposit = embedded.inputs.find((f) => f.name === 'monthlyDeposit')
    expect(embeddedDeposit?.constraints).toEqual(yamlDeposit?.constraints)

    expect(embedded.ui.formTitle).toBe(yaml.ui.formTitle)
    expect(embedded.ui.sections.map((s: { id: string }) => s.id)).toEqual(
      yaml.ui.sections.map((s: { id: string }) => s.id)
    )
  })

  it('drives HOME_SAVINGS_PRODUCTS catalog entry from the embedded spec', () => {
    expect(HOME_SAVINGS_PRODUCTS.length).toBeGreaterThanOrEqual(5)
    const entry = findHomeSavingsProduct('premium-plusz-10x30')
    expect(entry?.spec).toBe(embedded)
    expect(entry?.migrationStatus).toBe('fully-spec-backed')
    expect(entry?.migrationStatus).toBe(embedded.migrationStatus)
    expect(entry?.depositInterestAnnualRatePct).toBe(
      embedded.engine.depositInterestAnnualRatePct
    )
    expect(entry?.savingsRatePermille).toBe(embedded.engine.savingsRatePermille)
    expect(entry?.accountFeeMonthly).toBe(500)
    expect(entry?.openingFeeModes).toEqual([
      'standard-1pct',
      'promo-half-percent',
      'promo-fixed-65000'
    ])
    expect(entry?.saleWindow).toEqual({ from: '2026-08-03', to: null })
    expect(entry?.commerciallyBlockedReason).toBeNull()
  })

  it('keeps PRODUCT_CATALOG migrationStatus at fully-spec-backed', () => {
    const catalog = readRepoFile('docs/product-specs/PRODUCT_CATALOG.md')
    const row = catalog
      .split('\n')
      .find(
        (line) =>
          line.startsWith('| home-savings.premium-plusz-10x30.standard |') &&
          line.includes('| fully-spec-backed |')
      )
    expect(row).toBeDefined()
  })
})
