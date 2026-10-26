/**
 * Minimal schedule-usable parity: withdrawn embedded catalog specs ≡ YAML
 * identity / engine / saleWindow / premiumTiers / fees (ROADMAP §5f).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import YAML from 'yaml'
import {
  HOME_SAVINGS_PREMIUM_4X10_PRODUCT_SPEC,
  HOME_SAVINGS_PREMIUM_8X30_PRODUCT_SPEC,
  HOME_SAVINGS_PREMIUM_PLUSZ_4X10_PRODUCT_SPEC,
  HOME_SAVINGS_PREMIUM_PLUSZ_8X30_PRODUCT_SPEC
} from '../public/controller/home-savings-withdrawn-product-specs.js'
import { findHomeSavingsProduct } from '../public/controller/home-savings-product-metadata.js'
import { resolveKiutalasiPeriodMonths } from '../src/finance_engine/engine'

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

const WITHDRAWN = [
  {
    code: 'premium-plusz-4x10',
    yamlPath: 'docs/product-specs/products/home-savings/premium-plusz-4x10/product.yaml',
    embedded: HOME_SAVINGS_PREMIUM_PLUSZ_4X10_PRODUCT_SPEC
  },
  {
    code: 'premium-plusz-8x30',
    yamlPath: 'docs/product-specs/products/home-savings/premium-plusz-8x30/product.yaml',
    embedded: HOME_SAVINGS_PREMIUM_PLUSZ_8X30_PRODUCT_SPEC
  },
  {
    code: 'premium-4x10',
    yamlPath: 'docs/product-specs/products/home-savings/premium-4x10/product.yaml',
    embedded: HOME_SAVINGS_PREMIUM_4X10_PRODUCT_SPEC
  },
  {
    code: 'premium-8x30',
    yamlPath: 'docs/product-specs/products/home-savings/premium-8x30/product.yaml',
    embedded: HOME_SAVINGS_PREMIUM_8X30_PRODUCT_SPEC
  }
] as const

describe('home-savings withdrawn embedded ↔ YAML parity (schedule-usable)', () => {
  for (const entry of WITHDRAWN) {
    it(`${entry.code}: identity / engine / saleWindow / premiumTiers / fees`, () => {
      const yaml = YAML.parse(readRepoFile(entry.yamlPath))
      const embedded = entry.embedded

      expect(embedded.id).toBe(yaml.id)
      expect(embedded.family).toBe(yaml.family)
      expect(embedded.variant).toBe(yaml.variant)
      expect(embedded.productCode).toBe(yaml.productCode)
      expect(embedded.specVersion).toBe(yaml.specVersion)

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

      const yamlFeeNames = (yaml.fees || []).map((f: { name: string }) => f.name)
      const embeddedFeeNames = (embedded.fees || []).map((f: { name: string }) => f.name)
      expect(embeddedFeeNames).toEqual(yamlFeeNames)

      const yamlAccount = (yaml.fees || []).find(
        (f: { name: string }) => f.name === 'szamlavezetesi-dij'
      )
      const embeddedAccount = (embedded.fees || []).find(
        (f: { name: string }) => f.name === 'szamlavezetesi-dij'
      )
      expect(embeddedAccount?.value).toBe(yamlAccount?.value)

      const catalog = findHomeSavingsProduct(entry.code)
      expect(catalog?.productId).toBe(yaml.id)
      expect(catalog?.saleWindow).toEqual(yaml.saleWindow)
      expect(catalog?.evaluationMinMonths).toBe(yaml.engine.evaluationMinMonths)
      expect(catalog?.allocationMinMonths).toBe(yaml.engine.allocationMinMonths)

      expect(
        resolveKiutalasiPeriodMonths({
          evaluationMinMonths: yaml.engine.evaluationMinMonths,
          allocationMinMonths: yaml.engine.allocationMinMonths
        })
      ).toBe(yaml.engine.allocationMinMonths - yaml.engine.evaluationMinMonths)
    })
  }
})
