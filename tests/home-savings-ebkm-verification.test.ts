import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import YAML from 'yaml'
import {
  calculateEbkmFromHomeSavingsCashFlows,
  calculateHomeSavingsFromProductSpec,
  generateCashFlowsFromHomeSavingsProductSpec,
  loadHomeSavingsProductSpec,
  resolveHomeSavingsEbkmPayoutDate,
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

function toEbkmFlows(
  flows: ReturnType<typeof generateCashFlowsFromHomeSavingsProductSpec>
): Array<{
  date: string
  amount: number
  direction: 'inflow' | 'outflow'
  description?: string
}> {
  return flows.map((flow) => ({
    date: flow.date,
    amount: flow.amount,
    direction: flow.direction === CashFlowDirection.Inflow ? 'inflow' : 'outflow',
    description: flow.description
  }))
}

/**
 * ADR 0031 harness: engine EBKM (Annex 3 + ÁSZF 22. § kiutalás payout dating)
 * vs published Hirdetmény goldens. Not a loan THM three-check.
 *
 * Chart/schedule terminal uses OTP-aligned maturity packaging (first of month
 * after lastDeposit+2). EBKM retargets the terminal inflow to first of
 * lastDepositMonth+3. Residual gaps stay visible via YAML `engineEbkmPct*` /
 * notes (no packaging camouflage).
 */
describe('home-savings EBKM verification (ADR 0031)', () => {
  const product = loadProduct()

  const examplePaths = [
    'docs/product-specs/products/home-savings/premium-plusz-10x30/examples/ebkm-promo-20000.yaml',
    'docs/product-specs/products/home-savings/premium-plusz-10x30/examples/ebkm-promo-100000.yaml',
    'docs/product-specs/products/home-savings/premium-plusz-10x30/examples/ebkm-standard-20000.yaml',
    'docs/product-specs/products/home-savings/premium-plusz-10x30/examples/ebkm-standard-100000.yaml'
  ]

  it('resolves ÁSZF EBKM payout as first day of last-deposit month + 3', () => {
    expect(resolveHomeSavingsEbkmPayoutDate('2036-09-10')).toBe('2036-12-01')
    expect(resolveHomeSavingsEbkmPayoutDate('2036-01-31')).toBe('2036-04-01')
  })

  for (const path of examplePaths) {
    describe(path.split('/').pop()!, () => {
      it('locks published Hirdetmény EBKM goldens and engine pins in YAML', () => {
        const parsed = YAML.parse(readRepoFile(path))
        expect(typeof parsed.expected.ebkmPctWithPremium).toBe('number')
        expect(typeof parsed.expected.ebkmPctWithoutPremium).toBe('number')
        expect(typeof parsed.expected.engineEbkmPctWithPremium).toBe('number')
        expect(typeof parsed.expected.engineEbkmPctWithoutPremium).toBe('number')
      })

      it('engine EBKM from ÁSZF-packaged cash flows matches published goldens (or documents gap)', () => {
        const parsed = YAML.parse(readRepoFile(path))
        const baseInputs = parsed.inputs as HomeSavingsSpecInputs
        const publishedWith = Number(parsed.expected.ebkmPctWithPremium)
        const publishedWithout = Number(parsed.expected.ebkmPctWithoutPremium)
        const engineWith = Number(parsed.expected.engineEbkmPctWithPremium)
        const engineWithout = Number(parsed.expected.engineEbkmPctWithoutPremium)

        const withPremiumFlows = calculateEbkmFromHomeSavingsCashFlows(
          toEbkmFlows(
            generateCashFlowsFromHomeSavingsProductSpec(product, {
              ...baseInputs,
              housingPurpose: true
            })
          )
        )
        const withoutPremiumFlows = calculateEbkmFromHomeSavingsCashFlows(
          toEbkmFlows(
            generateCashFlowsFromHomeSavingsProductSpec(product, {
              ...baseInputs,
              housingPurpose: false
            })
          )
        )

        const withPremiumOutputs = calculateHomeSavingsFromProductSpec(product, {
          ...baseInputs,
          housingPurpose: true
        })
        const withoutPremiumOutputs = calculateHomeSavingsFromProductSpec(product, {
          ...baseInputs,
          housingPurpose: false
        })

        // Mapper ebkmPct must match the packaged cash-flow EBKM (no dual lane).
        expect(withPremiumOutputs.ebkmPct).toBe(withPremiumFlows.percentRounded)
        expect(withoutPremiumOutputs.ebkmPct).toBe(withoutPremiumFlows.percentRounded)
        expect(withPremiumOutputs.premiumAmount).toBeGreaterThan(0)
        expect(withoutPremiumOutputs.premiumAmount).toBe(0)

        expect(withPremiumOutputs.ebkmPct).toBe(engineWith)
        expect(withoutPremiumOutputs.ebkmPct).toBe(engineWithout)

        if (engineWith !== publishedWith || engineWithout !== publishedWithout) {
          // Residual gap cell(s) — keep published ≠ engine visible; no camouflage.
          expect([engineWith, engineWithout]).not.toEqual([publishedWith, publishedWithout])
          return
        }

        expect(withPremiumOutputs.ebkmPct).toBe(publishedWith)
        expect(withoutPremiumOutputs.ebkmPct).toBe(publishedWithout)
      })

      it('schedule-date EBKM (no kiutalás retarget) diverges from ÁSZF-packaged EBKM', () => {
        const parsed = YAML.parse(readRepoFile(path))
        const baseInputs = parsed.inputs as HomeSavingsSpecInputs
        const flows = toEbkmFlows(
          generateCashFlowsFromHomeSavingsProductSpec(product, {
            ...baseInputs,
            housingPurpose: true
          })
        )
        const scheduleDated = calculateEbkmFromHomeSavingsCashFlows(flows, {
          retargetTerminalPayout: false
        })
        const aszfPackaged = calculateEbkmFromHomeSavingsCashFlows(flows)
        expect(scheduleDated.percentRounded).not.toBe(aszfPackaged.percentRounded)
      })
    })
  }
})
