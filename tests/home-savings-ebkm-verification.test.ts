import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import YAML from 'yaml'
import {
  calculateHomeSavingsFromProductSpec,
  loadHomeSavingsProductSpec,
  type HomeSavingsSpecInputs
} from '../src/finance_engine/engine'
import { DEFAULT_PRODUCT_SCHEMA_PATH } from '../src/finance_engine/product_specs/loader'

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

function loadProduct() {
  const yamlText = readRepoFile(
    'docs/product-specs/products/home-savings/premium-plusz-10x30/product.yaml'
  )
  const schema = JSON.parse(readRepoFile(DEFAULT_PRODUCT_SCHEMA_PATH))
  return loadHomeSavingsProductSpec(yamlText, schema)
}

/**
 * ADR 0031 harness: engine EBKM ≡ published Hirdetmény goldens for PRÉMIUM PLUSZ
 * 10x30 (promo + standard opening-fee tables; with/without Premium). Not the loan
 * THM three-check.
 */
describe('home-savings EBKM verification (ADR 0031)', () => {
  const product = loadProduct()

  const examples: Array<{
    path: string
    expectedWith: number
    expectedWithout: number
  }> = [
    {
      path: 'docs/product-specs/products/home-savings/premium-plusz-10x30/examples/ebkm-promo-20000.yaml',
      expectedWith: 4.35,
      expectedWithout: -0.58
    },
    {
      path: 'docs/product-specs/products/home-savings/premium-plusz-10x30/examples/ebkm-promo-100000.yaml',
      expectedWith: 4.84,
      expectedWithout: -0.1
    },
    {
      path: 'docs/product-specs/products/home-savings/premium-plusz-10x30/examples/ebkm-standard-20000.yaml',
      expectedWith: 4.12,
      expectedWithout: -0.77
    },
    {
      path: 'docs/product-specs/products/home-savings/premium-plusz-10x30/examples/ebkm-standard-100000.yaml',
      expectedWith: 4.48,
      expectedWithout: -0.4
    }
  ]

  for (const example of examples) {
    it(`matches Hirdetmény EBKM for ${example.path.split('/').pop()}`, () => {
      const parsed = YAML.parse(readRepoFile(example.path))
      const baseInputs = parsed.inputs as HomeSavingsSpecInputs

      expect(Number(parsed.expected.ebkmPctWithPremium)).toBe(example.expectedWith)
      expect(Number(parsed.expected.ebkmPctWithoutPremium)).toBe(example.expectedWithout)

      const withPremium = calculateHomeSavingsFromProductSpec(product, {
        ...baseInputs,
        housingPurpose: true
      })
      const withoutPremium = calculateHomeSavingsFromProductSpec(product, {
        ...baseInputs,
        housingPurpose: false
      })

      expect(withPremium.accountFeeMonthly).toBe(500)
      expect(withPremium.ebkmPct).toBe(example.expectedWith)
      expect(withoutPremium.ebkmPct).toBe(example.expectedWithout)
      expect(withoutPremium.premiumAmount).toBe(0)
      expect(withPremium.premiumAmount).toBeGreaterThan(0)
    })
  }
})
