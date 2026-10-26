import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import YAML from 'yaml'
import {
  buildHomeSavingsAszfEbkmCashFlows,
  calculateEbkmFromHomeSavingsCashFlows,
  calculateEbkmFromHomeSavingsInstrument,
  calculateHomeSavingsFromProductSpec,
  generateCashFlowsFromHomeSavingsProductSpec,
  loadHomeSavingsProductSpec,
  mapHomeSavingsSpecInputsToInstrumentInput,
  type HomeSavingsProductSpec,
  type HomeSavingsSpecInputs
} from '../src/finance_engine/engine'
import { CashFlowDirection } from '../src/finance_engine/models'
import { DEFAULT_PRODUCT_SCHEMA_PATH } from '../src/finance_engine/product_specs/loader'

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

function loadProduct(relativeYamlPath: string): HomeSavingsProductSpec {
  const yamlText = readRepoFile(relativeYamlPath)
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

type EbkmPair = { withPremium: number; withoutPremium: number }

type ProductHarness = {
  code: string
  productYaml: string
  examplesDir: string
  published: Record<string, EbkmPair>
  enginePins: Record<string, EbkmPair>
  /** Cells where engine ÁSZF packaging still leaves a 0.01 half-up residual vs Hirdetmény. */
  residualFiles?: ReadonlyArray<string>
  expectedCellCount: number
  expectedGreenCount: number
  /** When true, product may be promoted commercially-usable (full Hirdetmény match). */
  commerciallyUsableReady: boolean
}

/**
 * ADR 0031 harness for withdrawn §5f módozatok.
 * Published goldens locked in test constants so YAML-only edits cannot wash residuals.
 *
 * Premium (non-Plus): Hirdetmény 2025-08-01 / ltp_ebkm_20250801.pdf (150 Ft/hó, 1% opening).
 * Premium Plus: Hirdetmény 2025-09-30 late-sale cohort (350 Ft/hó).
 *
 * Two without-Premium cells still show a 0.01 half-up residual under shared ÁSZF
 * packaging (no productCode fork). Those products stay below commercially-usable
 * until packaging closes the gap (ROADMAP §5f “can trail”).
 */
const PRODUCTS: ProductHarness[] = [
  {
    code: 'premium-4x10',
    productYaml: 'docs/product-specs/products/home-savings/premium-4x10/product.yaml',
    examplesDir: 'docs/product-specs/products/home-savings/premium-4x10/examples',
    published: {
      'ebkm-standard-20000.yaml': { withPremium: 3.23, withoutPremium: -1.04 },
      'ebkm-standard-50000.yaml': { withPremium: 3.44, withoutPremium: -0.83 }
    },
    enginePins: {
      'ebkm-standard-20000.yaml': { withPremium: 3.23, withoutPremium: -1.03 },
      'ebkm-standard-50000.yaml': { withPremium: 3.44, withoutPremium: -0.83 }
    },
    residualFiles: ['ebkm-standard-20000.yaml'],
    expectedCellCount: 4,
    expectedGreenCount: 3,
    commerciallyUsableReady: false
  },
  {
    code: 'premium-8x30',
    productYaml: 'docs/product-specs/products/home-savings/premium-8x30/product.yaml',
    examplesDir: 'docs/product-specs/products/home-savings/premium-8x30/examples',
    published: {
      'ebkm-standard-20000.yaml': { withPremium: 5.54, withoutPremium: -0.56 },
      'ebkm-standard-50000.yaml': { withPremium: 5.64, withoutPremium: -0.46 }
    },
    enginePins: {
      'ebkm-standard-20000.yaml': { withPremium: 5.54, withoutPremium: -0.56 },
      'ebkm-standard-50000.yaml': { withPremium: 5.64, withoutPremium: -0.46 }
    },
    expectedCellCount: 4,
    expectedGreenCount: 4,
    commerciallyUsableReady: true
  },
  {
    code: 'premium-plusz-4x10',
    productYaml: 'docs/product-specs/products/home-savings/premium-plusz-4x10/product.yaml',
    examplesDir: 'docs/product-specs/products/home-savings/premium-plusz-4x10/examples',
    published: {
      'ebkm-promo-20000.yaml': { withPremium: 3.12, withoutPremium: -1.17 },
      'ebkm-promo-100000.yaml': { withPremium: 4.02, withoutPremium: -0.3 },
      'ebkm-standard-20000.yaml': { withPremium: 2.64, withoutPremium: -1.6 },
      'ebkm-standard-100000.yaml': { withPremium: 3.27, withoutPremium: -0.98 }
    },
    enginePins: {
      'ebkm-promo-20000.yaml': { withPremium: 3.12, withoutPremium: -1.17 },
      'ebkm-promo-100000.yaml': { withPremium: 4.02, withoutPremium: -0.3 },
      'ebkm-standard-20000.yaml': { withPremium: 2.64, withoutPremium: -1.6 },
      'ebkm-standard-100000.yaml': { withPremium: 3.27, withoutPremium: -0.97 }
    },
    residualFiles: ['ebkm-standard-100000.yaml'],
    expectedCellCount: 8,
    expectedGreenCount: 7,
    commerciallyUsableReady: false
  },
  {
    code: 'premium-plusz-8x30',
    productYaml: 'docs/product-specs/products/home-savings/premium-plusz-8x30/product.yaml',
    examplesDir: 'docs/product-specs/products/home-savings/premium-plusz-8x30/examples',
    published: {
      'ebkm-promo-20000.yaml': { withPremium: 5.59, withoutPremium: -0.56 },
      'ebkm-promo-100000.yaml': { withPremium: 6.07, withoutPremium: -0.11 },
      'ebkm-standard-20000.yaml': { withPremium: 5.31, withoutPremium: -0.79 },
      'ebkm-standard-100000.yaml': { withPremium: 5.62, withoutPremium: -0.47 }
    },
    enginePins: {
      'ebkm-promo-20000.yaml': { withPremium: 5.59, withoutPremium: -0.56 },
      'ebkm-promo-100000.yaml': { withPremium: 6.07, withoutPremium: -0.11 },
      'ebkm-standard-20000.yaml': { withPremium: 5.31, withoutPremium: -0.79 },
      'ebkm-standard-100000.yaml': { withPremium: 5.62, withoutPremium: -0.47 }
    },
    expectedCellCount: 8,
    expectedGreenCount: 8,
    commerciallyUsableReady: true
  }
]

describe('home-savings withdrawn EBKM verification (ADR 0031 / ROADMAP §5f)', () => {
  for (const harness of PRODUCTS) {
    describe(harness.code, () => {
      const product = loadProduct(harness.productYaml)
      const exampleFiles = Object.keys(harness.published)
      const residualSet = new Set(harness.residualFiles ?? [])

      it(`reports ${harness.expectedGreenCount}/${harness.expectedCellCount} Hirdetmény match (no score washing)`, () => {
        let green = 0
        let total = 0
        for (const file of exampleFiles) {
          const parsed = YAML.parse(readRepoFile(`${harness.examplesDir}/${file}`))
          const baseInputs = parsed.inputs as HomeSavingsSpecInputs
          for (const housingPurpose of [true, false] as const) {
            const live = calculateHomeSavingsFromProductSpec(product, {
              ...baseInputs,
              housingPurpose
            }).ebkmPct
            const published = housingPurpose
              ? harness.published[file].withPremium
              : harness.published[file].withoutPremium
            total += 1
            if (live === published) green += 1
          }
        }
        expect(total).toBe(harness.expectedCellCount)
        expect(green).toBe(harness.expectedGreenCount)
        if (harness.commerciallyUsableReady) {
          expect(green).toBe(harness.expectedCellCount)
        }
      })

      for (const file of exampleFiles) {
        describe(file, () => {
          const publishedLock = harness.published[file]
          const engineLock = harness.enginePins[file]
          const isResidual = residualSet.has(file)

          it('locks published Hirdetmény EBKM goldens and engine pins in YAML', () => {
            const parsed = YAML.parse(readRepoFile(`${harness.examplesDir}/${file}`))
            expect(parsed.expected.ebkmPctWithPremium).toBe(publishedLock.withPremium)
            expect(parsed.expected.ebkmPctWithoutPremium).toBe(publishedLock.withoutPremium)
            expect(parsed.expected.engineEbkmPctWithPremium).toBe(engineLock.withPremium)
            expect(parsed.expected.engineEbkmPctWithoutPremium).toBe(engineLock.withoutPremium)
            if (!isResidual) {
              expect(engineLock.withPremium).toBe(publishedLock.withPremium)
              expect(engineLock.withoutPremium).toBe(publishedLock.withoutPremium)
            } else {
              // Residual cell: without-Premium engine pin may differ by 0.01 half-up.
              expect(engineLock.withPremium).toBe(publishedLock.withPremium)
              expect(engineLock.withoutPremium).not.toBe(publishedLock.withoutPremium)
              expect(
                Math.abs(engineLock.withoutPremium - publishedLock.withoutPremium)
              ).toBeCloseTo(0.01, 8)
            }
          })

          it('engine EBKM from ÁSZF-packaged cash flows matches engine pins', () => {
            const parsed = YAML.parse(readRepoFile(`${harness.examplesDir}/${file}`))
            const baseInputs = parsed.inputs as HomeSavingsSpecInputs

            const withInstrument = mapHomeSavingsSpecInputsToInstrumentInput(product, {
              ...baseInputs,
              housingPurpose: true
            })
            const withoutInstrument = mapHomeSavingsSpecInputsToInstrumentInput(product, {
              ...baseInputs,
              housingPurpose: false
            })

            const withPremiumFlows = calculateEbkmFromHomeSavingsInstrument(withInstrument)
            const withoutPremiumFlows = calculateEbkmFromHomeSavingsInstrument(withoutInstrument)

            const withPremiumOutputs = calculateHomeSavingsFromProductSpec(product, {
              ...baseInputs,
              housingPurpose: true
            })
            const withoutPremiumOutputs = calculateHomeSavingsFromProductSpec(product, {
              ...baseInputs,
              housingPurpose: false
            })

            expect(withPremiumOutputs.ebkmPct).toBe(withPremiumFlows.percentRounded)
            expect(withoutPremiumOutputs.ebkmPct).toBe(withoutPremiumFlows.percentRounded)
            expect(withPremiumOutputs.premiumAmount).toBeGreaterThan(0)
            expect(withoutPremiumOutputs.premiumAmount).toBe(0)

            expect(withPremiumOutputs.ebkmPct).toBe(engineLock.withPremium)
            expect(withoutPremiumOutputs.ebkmPct).toBe(engineLock.withoutPremium)
            expect(withPremiumOutputs.ebkmPct).toBe(publishedLock.withPremium)
            if (!isResidual) {
              expect(withoutPremiumOutputs.ebkmPct).toBe(publishedLock.withoutPremium)
            }
          })

          it('schedule-date EBKM (OTP maturity packaging) diverges from ÁSZF-packaged EBKM', () => {
            const parsed = YAML.parse(readRepoFile(`${harness.examplesDir}/${file}`))
            const baseInputs = parsed.inputs as HomeSavingsSpecInputs
            const instrument = mapHomeSavingsSpecInputsToInstrumentInput(product, {
              ...baseInputs,
              housingPurpose: true
            })
            const scheduleFlows = toEbkmFlows(
              generateCashFlowsFromHomeSavingsProductSpec(product, {
                ...baseInputs,
                housingPurpose: true
              })
            )
            const scheduleDated = calculateEbkmFromHomeSavingsCashFlows(scheduleFlows, {
              retargetTerminalPayout: false
            })
            const aszfPackaged = calculateEbkmFromHomeSavingsInstrument(instrument)
            expect(scheduleDated.percentRounded).not.toBe(aszfPackaged.percentRounded)

            const aszfFlows = buildHomeSavingsAszfEbkmCashFlows(instrument)
            const scheduleFeeCount = scheduleFlows.filter((f) =>
              /account management fee/i.test(f.description ?? '')
            ).length
            const aszfFeeCount = aszfFlows.filter((f) =>
              /account management fee/i.test(f.description ?? '')
            ).length
            expect(aszfFeeCount).toBe(scheduleFeeCount + 2)
          })
        })
      }
    })
  }
})
