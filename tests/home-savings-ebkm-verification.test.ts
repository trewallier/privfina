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
 * Hirdetmény published EBKM goldens (authoritative). Locked here so editing YAML
 * alone cannot wash a residual into a false commercially-usable green.
 * Source: OTP Lakástakarék értékesített termékek Hirdetmény A/B, effective 2026-10-10.
 */
const HIRDETMENY_PUBLISHED_EBKM = {
  'ebkm-promo-20000.yaml': { withPremium: 4.35, withoutPremium: -0.58 },
  'ebkm-promo-100000.yaml': { withPremium: 4.84, withoutPremium: -0.1 },
  'ebkm-standard-20000.yaml': { withPremium: 4.12, withoutPremium: -0.77 },
  'ebkm-standard-100000.yaml': { withPremium: 4.48, withoutPremium: -0.4 }
} as const

/**
 * Engine pins under Annex 3 + ÁSZF 22. § kiutalás payout dating (lastDepositMonth+3
 * day-1) on OTP-maturity terminal amounts. Promo-20k both legs remain residual;
 * do not “fix” by changing {@link HIRDETMENY_PUBLISHED_EBKM}.
 */
const ENGINE_EBKM_PINS = {
  'ebkm-promo-20000.yaml': { withPremium: 4.36, withoutPremium: -0.57 },
  'ebkm-promo-100000.yaml': { withPremium: 4.84, withoutPremium: -0.1 },
  'ebkm-standard-20000.yaml': { withPremium: 4.12, withoutPremium: -0.77 },
  'ebkm-standard-100000.yaml': { withPremium: 4.48, withoutPremium: -0.4 }
} as const

type ExampleFile = keyof typeof HIRDETMENY_PUBLISHED_EBKM

/**
 * ADR 0031 harness: engine EBKM (Annex 3 + ÁSZF 22. § kiutalás payout dating)
 * vs published Hirdetmény goldens. Not a loan THM three-check.
 *
 * Chart/schedule terminal uses OTP-aligned maturity packaging (first of month
 * after lastDeposit+2). EBKM retargets the terminal inflow to first of
 * lastDepositMonth+3. Residual gaps stay visible via locked engine pins /
 * YAML `engineEbkmPct*` (no packaging camouflage).
 */
describe('home-savings EBKM verification (ADR 0031)', () => {
  const product = loadProduct()

  const examplePaths = (
    Object.keys(HIRDETMENY_PUBLISHED_EBKM) as ExampleFile[]
  ).map(
    (file) =>
      `docs/product-specs/products/home-savings/premium-plusz-10x30/examples/${file}` as const
  )

  it('resolves ÁSZF EBKM payout as first day of last-deposit month + 3', () => {
    expect(resolveHomeSavingsEbkmPayoutDate('2036-09-10')).toBe('2036-12-01')
    expect(resolveHomeSavingsEbkmPayoutDate('2036-01-31')).toBe('2036-04-01')
  })

  it('reports a factual 6/8 Hirdetmény match under ÁSZF packaging (no score washing)', () => {
    let green = 0
    let total = 0
    for (const path of examplePaths) {
      const file = path.split('/').pop() as ExampleFile
      const parsed = YAML.parse(readRepoFile(path))
      const baseInputs = parsed.inputs as HomeSavingsSpecInputs
      for (const housingPurpose of [true, false] as const) {
        const live = calculateHomeSavingsFromProductSpec(product, {
          ...baseInputs,
          housingPurpose
        }).ebkmPct
        const published = housingPurpose
          ? HIRDETMENY_PUBLISHED_EBKM[file].withPremium
          : HIRDETMENY_PUBLISHED_EBKM[file].withoutPremium
        total += 1
        if (live === published) green += 1
      }
    }
    expect(total).toBe(8)
    expect(green).toBe(6)
  })

  for (const path of examplePaths) {
    describe(path.split('/').pop()!, () => {
      const file = path.split('/').pop() as ExampleFile
      const publishedLock = HIRDETMENY_PUBLISHED_EBKM[file]
      const engineLock = ENGINE_EBKM_PINS[file]

      it('locks published Hirdetmény EBKM goldens and engine pins in YAML', () => {
        const parsed = YAML.parse(readRepoFile(path))
        expect(parsed.expected.ebkmPctWithPremium).toBe(publishedLock.withPremium)
        expect(parsed.expected.ebkmPctWithoutPremium).toBe(publishedLock.withoutPremium)
        expect(parsed.expected.engineEbkmPctWithPremium).toBe(engineLock.withPremium)
        expect(parsed.expected.engineEbkmPctWithoutPremium).toBe(engineLock.withoutPremium)
      })

      it('engine EBKM from ÁSZF-packaged cash flows matches locked pins (published or residual)', () => {
        const parsed = YAML.parse(readRepoFile(path))
        const baseInputs = parsed.inputs as HomeSavingsSpecInputs

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

        // Live engine must equal locked pins (YAML + in-test constants).
        expect(withPremiumOutputs.ebkmPct).toBe(engineLock.withPremium)
        expect(withoutPremiumOutputs.ebkmPct).toBe(engineLock.withoutPremium)

        // Per-cell: match published, or keep residual visible (never wash published).
        if (engineLock.withPremium === publishedLock.withPremium) {
          expect(withPremiumOutputs.ebkmPct).toBe(publishedLock.withPremium)
        } else {
          expect(withPremiumOutputs.ebkmPct).not.toBe(publishedLock.withPremium)
        }
        if (engineLock.withoutPremium === publishedLock.withoutPremium) {
          expect(withoutPremiumOutputs.ebkmPct).toBe(publishedLock.withoutPremium)
        } else {
          expect(withoutPremiumOutputs.ebkmPct).not.toBe(publishedLock.withoutPremium)
        }
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

  it('promo-20k residual cells stay at the documented 0.01 half-up gaps', () => {
    expect(ENGINE_EBKM_PINS['ebkm-promo-20000.yaml'].withPremium).toBe(4.36)
    expect(HIRDETMENY_PUBLISHED_EBKM['ebkm-promo-20000.yaml'].withPremium).toBe(4.35)
    expect(ENGINE_EBKM_PINS['ebkm-promo-20000.yaml'].withoutPremium).toBe(-0.57)
    expect(HIRDETMENY_PUBLISHED_EBKM['ebkm-promo-20000.yaml'].withoutPremium).toBe(-0.58)
  })
})
