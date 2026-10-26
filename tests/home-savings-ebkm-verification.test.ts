import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import YAML from 'yaml'
import {
  calculateEbkmFromHomeSavingsCashFlows,
  calculateHomeSavingsFromProductSpec,
  generateCashFlowsFromHomeSavingsProductSpec,
  loadHomeSavingsProductSpec,
  type HomeSavingsSpecInputs
} from '../src/finance_engine/engine'
import { CashFlowDirection } from '../src/finance_engine/models'
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

function ebkmFromScheduleFlows(
  product: ReturnType<typeof loadProduct>,
  inputs: HomeSavingsSpecInputs
) {
  const flows = generateCashFlowsFromHomeSavingsProductSpec(product, inputs)
  return calculateEbkmFromHomeSavingsCashFlows(
    flows.map((flow) => ({
      date: flow.date,
      amount: flow.amount,
      direction: flow.direction === CashFlowDirection.Inflow ? 'inflow' : 'outflow'
    }))
  )
}

/**
 * ADR 0031 harness (schedule-faithful).
 *
 * Engine EBKM is computed from generated customer cash flows (calendar-day /
 * 365 Annex 3) — the same packaging as the chart. Published Hirdetmény goldens
 * remain locked; gaps stay visible. Commercially-usable is quarantined until
 * schedule→EBKM reproduces published figures without packaging camouflage
 * (same posture as Vidéki for loan installment packaging).
 */
describe('home-savings EBKM verification (ADR 0031)', () => {
  const product = loadProduct()

  const examples: Array<{
    path: string
    publishedWith: number
    publishedWithout: number
    /** Pinned schedule→EBKM while Hirdetmény gap remains. */
    enginePins: { withPremium: number; withoutPremium: number }
  }> = [
    {
      path: 'docs/product-specs/products/home-savings/premium-plusz-10x30/examples/ebkm-promo-20000.yaml',
      publishedWith: 4.35,
      publishedWithout: -0.58,
      // Pins after ÁSZF §22 maturity payout dating (terminal on first of lastDeposit+2).
      enginePins: { withPremium: 4.42, withoutPremium: -0.58 }
    },
    {
      path: 'docs/product-specs/products/home-savings/premium-plusz-10x30/examples/ebkm-promo-100000.yaml',
      publishedWith: 4.84,
      publishedWithout: -0.1,
      enginePins: { withPremium: 4.92, withoutPremium: -0.1 }
    },
    {
      path: 'docs/product-specs/products/home-savings/premium-plusz-10x30/examples/ebkm-standard-20000.yaml',
      publishedWith: 4.12,
      publishedWithout: -0.77,
      enginePins: { withPremium: 4.18, withoutPremium: -0.78 }
    },
    {
      path: 'docs/product-specs/products/home-savings/premium-plusz-10x30/examples/ebkm-standard-100000.yaml',
      publishedWith: 4.48,
      publishedWithout: -0.4,
      enginePins: { withPremium: 4.54, withoutPremium: -0.41 }
    }
  ]

  for (const example of examples) {
    describe(example.path.split('/').pop()!, () => {
      it('locks published Hirdetmény EBKM goldens in YAML', () => {
        const parsed = YAML.parse(readRepoFile(example.path))
        expect(Number(parsed.expected.ebkmPctWithPremium)).toBe(example.publishedWith)
        expect(Number(parsed.expected.ebkmPctWithoutPremium)).toBe(example.publishedWithout)
      })

      it('pins schedule→EBKM and keeps the Hirdetmény gap visible (quarantine)', () => {
        const parsed = YAML.parse(readRepoFile(example.path))
        const baseInputs = parsed.inputs as HomeSavingsSpecInputs

        const withPremiumFlows = ebkmFromScheduleFlows(product, {
          ...baseInputs,
          housingPurpose: true
        })
        const withoutPremiumFlows = ebkmFromScheduleFlows(product, {
          ...baseInputs,
          housingPurpose: false
        })

        const withPremiumOutputs = calculateHomeSavingsFromProductSpec(product, {
          ...baseInputs,
          housingPurpose: true
        })
        const withoutPremiumOutputs = calculateHomeSavingsFromProductSpec(product, {
          ...baseInputs,
          housingPurpose: false
        })

        // Mapper ebkmPct must match schedule cash-flow EBKM (no parallel packaging lane).
        expect(withPremiumOutputs.ebkmPct).toBe(withPremiumFlows.percentRounded)
        expect(withoutPremiumOutputs.ebkmPct).toBe(withoutPremiumFlows.percentRounded)

        expect(withPremiumOutputs.ebkmPct).toBe(example.enginePins.withPremium)
        expect(withoutPremiumOutputs.ebkmPct).toBe(example.enginePins.withoutPremium)

        // Pair vs published must still show a quarantine gap (individual legs may match).
        // Do not camouflage remaining with/without mismatches with fitted knobs.
        expect([withPremiumOutputs.ebkmPct, withoutPremiumOutputs.ebkmPct]).not.toEqual([
          example.publishedWith,
          example.publishedWithout
        ])
        expect(withPremiumOutputs.premiumAmount).toBeGreaterThan(0)
        expect(withoutPremiumOutputs.premiumAmount).toBe(0)
      })
    })
  }
})
