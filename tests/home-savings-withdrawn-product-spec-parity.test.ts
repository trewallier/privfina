/**
 * Withdrawn home-savings embedded ↔ YAML parity (ROADMAP §5f).
 * - 8x30: fully-spec-backed (ADR 0031 EBKM green) — displayName + commercial
 *   fields aligned with YAML at the 10x30 bar (not every optional YAML prose field).
 * - 4x10: schedule-usable identity/engine/saleWindow/fees (0.01 EBKM residual;
 *   ADR 0033 rejected).
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

function depositBandFromCondition(condition: string): { min: number; max: number } | null {
  const match = /^monthly-deposit-(\d+)-to-(\d+)$/.exec(condition)
  if (!match) return null
  return { min: Number(match[1]), max: Number(match[2]) }
}

const SCHEDULE_USABLE = [
  {
    code: 'premium-plusz-4x10',
    yamlPath: 'docs/product-specs/products/home-savings/premium-plusz-4x10/product.yaml',
    embedded: HOME_SAVINGS_PREMIUM_PLUSZ_4X10_PRODUCT_SPEC
  },
  {
    code: 'premium-4x10',
    yamlPath: 'docs/product-specs/products/home-savings/premium-4x10/product.yaml',
    embedded: HOME_SAVINGS_PREMIUM_4X10_PRODUCT_SPEC
  }
] as const

const FULLY_SPEC_BACKED = [
  {
    code: 'premium-plusz-8x30',
    yamlPath: 'docs/product-specs/products/home-savings/premium-plusz-8x30/product.yaml',
    embedded: HOME_SAVINGS_PREMIUM_PLUSZ_8X30_PRODUCT_SPEC
  },
  {
    code: 'premium-8x30',
    yamlPath: 'docs/product-specs/products/home-savings/premium-8x30/product.yaml',
    embedded: HOME_SAVINGS_PREMIUM_8X30_PRODUCT_SPEC
  }
] as const

function assertCoreParity(
  yaml: Record<string, any>,
  embedded: Record<string, any>,
  code: string
): void {
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

  const catalog = findHomeSavingsProduct(code)
  expect(catalog?.productId).toBe(yaml.id)
  expect(catalog?.saleWindow).toEqual(yaml.saleWindow)
  expect(catalog?.evaluationMinMonths).toBe(yaml.engine.evaluationMinMonths)
  expect(catalog?.allocationMinMonths).toBe(yaml.engine.allocationMinMonths)
  expect(catalog?.migrationStatus).toBe(embedded.migrationStatus)

  expect(
    resolveKiutalasiPeriodMonths({
      evaluationMinMonths: yaml.engine.evaluationMinMonths,
      allocationMinMonths: yaml.engine.allocationMinMonths
    })
  ).toBe(yaml.engine.allocationMinMonths - yaml.engine.evaluationMinMonths)
}

describe('home-savings withdrawn embedded ↔ YAML parity (schedule-usable 4x10)', () => {
  for (const entry of SCHEDULE_USABLE) {
    it(`${entry.code}: identity / engine / saleWindow / premiumTiers / fees`, () => {
      const yaml = YAML.parse(readRepoFile(entry.yamlPath))
      assertCoreParity(yaml, entry.embedded, entry.code)
      expect(entry.embedded.migrationStatus).toBe('schedule-usable')
    })
  }
})

describe('home-savings withdrawn embedded ↔ YAML parity (fully-spec-backed 8x30)', () => {
  for (const entry of FULLY_SPEC_BACKED) {
    it(`${entry.code}: YAML ↔ embedded parity (displayName, fees, discounts, inputs, ui)`, () => {
      const yaml = YAML.parse(readRepoFile(entry.yamlPath))
      const embedded = entry.embedded
      assertCoreParity(yaml, embedded, entry.code)

      expect(embedded.migrationStatus).toBe('fully-spec-backed')
      expect(embedded.displayName).toBe(yaml.displayName)
      expect(embedded.description).toBeTruthy()
      expect(embedded.eligibilityRules).toEqual(yaml.eligibilityRules)

      expect(
        (embedded.fees || []).map(
          (f: { name: string; type: string; value: number; unit: string; timing?: string }) => ({
            name: f.name,
            type: f.type,
            value: f.value,
            unit: f.unit,
            timing: f.timing
          })
        )
      ).toEqual(
        (yaml.fees || []).map(
          (f: { name: string; type: string; value: number; unit: string; timing?: string }) => ({
            name: f.name,
            type: f.type,
            value: f.value,
            unit: f.unit,
            timing: f.timing
          })
        )
      )

      expect(
        (embedded.discounts || []).map(
          (d: {
            name: string
            type: string
            value: number
            unit: string
            conditions?: string[]
            appliesToFeeNames?: string[]
          }) => ({
            name: d.name,
            type: d.type,
            value: d.value,
            unit: d.unit,
            conditions: d.conditions,
            appliesToFeeNames: d.appliesToFeeNames
          })
        )
      ).toEqual(
        (yaml.discounts || []).map(
          (d: {
            name: string
            type: string
            value: number
            unit: string
            conditions?: string[]
            appliesToFeeNames?: string[]
          }) => ({
            name: d.name,
            type: d.type,
            value: d.value,
            unit: d.unit,
            conditions: d.conditions,
            appliesToFeeNames: d.appliesToFeeNames
          })
        )
      )

      const catalog = findHomeSavingsProduct(entry.code)
      expect(catalog?.displayName).toBe(yaml.displayName)
      for (const discount of yaml.discounts || []) {
        const band = (discount.conditions || [])
          .map(depositBandFromCondition)
          .find(Boolean)
        if (!band) continue
        if (discount.name === 'promo-opening-fee-half-percent') {
          expect(embedded.openingFeeModeDepositBands['promo-half-percent']).toEqual(band)
          expect(catalog?.openingFeeModeDepositBands['promo-half-percent']).toEqual(band)
        } else if (discount.name.startsWith('promo-opening-fee-fixed-')) {
          const mode = `promo-fixed-${discount.name.replace('promo-opening-fee-fixed-', '')}`
          expect(embedded.openingFeeModeDepositBands[mode]).toEqual(band)
          expect(catalog?.openingFeeModeDepositBands[mode]).toEqual(band)
        }
      }

      const yamlOpeningModes = yaml.inputs.find(
        (f: { name: string }) => f.name === 'openingFeeMode'
      )?.constraints?.enum
      const embeddedOpeningModes = embedded.inputs.find(
        (f: { name: string }) => f.name === 'openingFeeMode'
      )?.constraints?.enum
      expect(embeddedOpeningModes).toEqual(yamlOpeningModes)
      expect(catalog?.openingFeeModes).toEqual(yamlOpeningModes)

      const yamlDeposit = yaml.inputs.find((f: { name: string }) => f.name === 'monthlyDeposit')
      const embeddedDeposit = embedded.inputs.find(
        (f: { name: string }) => f.name === 'monthlyDeposit'
      )
      expect(embeddedDeposit?.constraints).toEqual(yamlDeposit?.constraints)

      expect(embedded.derivedVariables?.map((d: { name: string }) => d.name)).toEqual(
        yaml.derivedVariables.map((d: { name: string }) => d.name)
      )
      expect(embedded.outputs?.map((o: { name: string }) => o.name)).toEqual(
        yaml.outputs.map((o: { name: string }) => o.name)
      )
      expect(embedded.ui.formTitle).toBe(yaml.ui.formTitle)
      expect(embedded.ui.sections.map((s: { id: string }) => s.id)).toEqual(
        yaml.ui.sections.map((s: { id: string }) => s.id)
      )
      expect(embedded.ui.sections.map((s: { fieldNames: string[] }) => s.fieldNames)).toEqual(
        yaml.ui.sections.map((s: { fieldNames: string[] }) => s.fieldNames)
      )
    })

    it(`${entry.code}: PRODUCT_CATALOG row is fully-spec-backed`, () => {
      const catalog = readRepoFile('docs/product-specs/PRODUCT_CATALOG.md')
      const row = catalog
        .split('\n')
        .find(
          (line) =>
            line.startsWith(`| home-savings.${entry.code}.standard |`) &&
            line.includes('| fully-spec-backed |')
        )
      expect(row).toBeDefined()
    })
  }
})
