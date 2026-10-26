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
 * remain locked in YAML; schedule→EBKM pins live in the same examples as
 * `scheduleEbkmPct*`. Commercially-usable is quarantined until with-premium
 * schedule EBKM reproduces published figures without packaging camouflage
 * (same posture as Vidéki for loan installment packaging).
 *
 * Without-premium schedule may coincide with published (promo cases); that is
 * expected and does not lift the quarantine — with-premium must stay ≠ published.
 */
describe('home-savings EBKM verification (ADR 0031)', () => {
  const product = loadProduct()

  const examplePaths = [
    'docs/product-specs/products/home-savings/premium-plusz-10x30/examples/ebkm-promo-20000.yaml',
    'docs/product-specs/products/home-savings/premium-plusz-10x30/examples/ebkm-promo-100000.yaml',
    'docs/product-specs/products/home-savings/premium-plusz-10x30/examples/ebkm-standard-20000.yaml',
    'docs/product-specs/products/home-savings/premium-plusz-10x30/examples/ebkm-standard-100000.yaml'
  ]

  for (const path of examplePaths) {
    describe(path.split('/').pop()!, () => {
      it('locks published Hirdetmény EBKM goldens and schedule pins in YAML', () => {
        const parsed = YAML.parse(readRepoFile(path))
        expect(typeof parsed.expected.ebkmPctWithPremium).toBe('number')
        expect(typeof parsed.expected.ebkmPctWithoutPremium).toBe('number')
        expect(typeof parsed.expected.scheduleEbkmPctWithPremium).toBe('number')
        expect(typeof parsed.expected.scheduleEbkmPctWithoutPremium).toBe('number')
      })

      it('pins schedule→EBKM from YAML and keeps with-premium Hirdetmény gap visible', () => {
        const parsed = YAML.parse(readRepoFile(path))
        const baseInputs = parsed.inputs as HomeSavingsSpecInputs
        const publishedWith = Number(parsed.expected.ebkmPctWithPremium)
        const publishedWithout = Number(parsed.expected.ebkmPctWithoutPremium)
        const scheduleWith = Number(parsed.expected.scheduleEbkmPctWithPremium)
        const scheduleWithout = Number(parsed.expected.scheduleEbkmPctWithoutPremium)

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

        // Quarantine regression pins live in YAML (not test-only snapshots).
        expect(withPremiumOutputs.ebkmPct).toBe(scheduleWith)
        expect(withoutPremiumOutputs.ebkmPct).toBe(scheduleWithout)

        // With-premium must remain ≠ published (no camouflage). Without-premium may coincide.
        expect(withPremiumOutputs.ebkmPct).not.toBe(publishedWith)
        expect(withPremiumOutputs.premiumAmount).toBeGreaterThan(0)
        expect(withoutPremiumOutputs.premiumAmount).toBe(0)
        // Pair inequality still required so both legs matching would fail the suite.
        expect([withPremiumOutputs.ebkmPct, withoutPremiumOutputs.ebkmPct]).not.toEqual([
          publishedWith,
          publishedWithout
        ])
      })
    })
  }
})
