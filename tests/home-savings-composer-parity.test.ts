import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import YAML from 'yaml'
import {
  HOME_SAVINGS_PRODUCTS,
  findHomeSavingsProduct
} from '../public/controller/home-savings-product-metadata.js'
import {
  resolveHomeSavingsOpeningFee,
  mapHomeSavingsSpecInputsToBundleInput,
  calculateHomeSavingsScheduleFromSpecInputs
} from '../public/controller/home-savings-calculation-adapter.js'
import {
  ceilToTenForint,
  resolveMonthlyDepositFromContractAmount,
  resolveContractAmountFromMonthlyDeposit,
  resolveHomeSavingsSchedule
} from '../public/instruments.js'
import {
  ceilToTenForint as engineCeilToTenForint,
  resolveMonthlyDepositFromContractAmount as engineResolveMonthlyDepositFromContractAmount,
  resolveContractAmountFromMonthlyDeposit as engineResolveContractAmountFromMonthlyDeposit
} from '../src/finance_engine/engine'

const PRODUCT_YAML_PATH =
  'docs/product-specs/products/home-savings/premium-plusz-10x30/product.yaml'
const MATURITY_EXAMPLE_PATH =
  'docs/product-specs/products/home-savings/premium-plusz-10x30/examples/maturity-premium-120.yaml'
const CATALOG_PATH = 'docs/product-specs/PRODUCT_CATALOG.md'

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

function loadYaml(relativePath: string): Record<string, unknown> {
  return YAML.parse(readRepoFile(relativePath)) as Record<string, unknown>
}

function depositBandFromCondition(condition: string): { min: number; max: number } | null {
  const match = /^monthly-deposit-(\d+)-to-(\d+)$/.exec(condition)
  if (!match) return null
  return { min: Number(match[1]), max: Number(match[2]) }
}

describe('home-savings composer parity (§5e schedule-usable follow-up)', () => {
  it('keeps HOME_SAVINGS_PRODUCTS aligned with product YAML (rates, fees, bands, ids)', () => {
    const yaml = loadYaml(PRODUCT_YAML_PATH) as {
      id: string
      productCode: string
      displayName: string
      specVersion: string
      engine: {
        depositInterestAnnualRatePct: number
        savingsRatePermille: number
        minContractAmount: number
        maxContractAmount: number
      }
      fees?: Array<{ name: string; type: string; value: number; unit: string; timing?: string }>
      discounts?: Array<{ name: string; conditions?: string[] }>
      inputs?: Array<{
        name: string
        constraints?: { minimum?: number; maximum?: number; enum?: string[] }
      }>
    }

    expect(HOME_SAVINGS_PRODUCTS).toHaveLength(1)
    const entry = findHomeSavingsProduct('premium-plusz-10x30')
    expect(entry).not.toBeNull()
    if (!entry) return

    expect(entry.productId).toBe(yaml.id)
    expect(entry.productCode).toBe(yaml.productCode)
    expect(entry.displayName).toBe(yaml.displayName)
    expect(entry.specVersion).toBe(yaml.specVersion)

    expect(entry.depositInterestAnnualRatePct).toBe(yaml.engine.depositInterestAnnualRatePct)
    expect(entry.savingsRatePermille).toBe(yaml.engine.savingsRatePermille)
    expect(entry.minContractAmount).toBe(yaml.engine.minContractAmount)
    expect(entry.maxContractAmount).toBe(yaml.engine.maxContractAmount)

    const accountFee = (yaml.fees || []).find((fee) => fee.name === 'szamlavezetesi-dij')
    expect(accountFee).toBeDefined()
    expect(accountFee?.type).toBe('account-management')
    expect(accountFee?.unit).toBe('amount')
    expect(entry.accountFeeMonthly).toBe(accountFee?.value)

    const depositInput = (yaml.inputs || []).find((input) => input.name === 'monthlyDeposit')
    expect(depositInput?.constraints?.minimum).toBe(entry.minMonthlyDeposit)
    expect(depositInput?.constraints?.maximum).toBe(entry.maxMonthlyDeposit)

    const openingFeeInput = (yaml.inputs || []).find((input) => input.name === 'openingFeeMode')
    expect(openingFeeInput?.constraints?.enum).toEqual(entry.openingFeeModes)

    const halfPercent = (yaml.discounts || []).find(
      (discount) => discount.name === 'promo-opening-fee-half-percent'
    )
    const fixed65000 = (yaml.discounts || []).find(
      (discount) => discount.name === 'promo-opening-fee-fixed-65000'
    )
    const halfBand = (halfPercent?.conditions || [])
      .map(depositBandFromCondition)
      .find(Boolean)
    const fixedBand = (fixed65000?.conditions || [])
      .map(depositBandFromCondition)
      .find(Boolean)

    expect(halfBand).toEqual(entry.openingFeeModeDepositBands['promo-half-percent'])
    expect(fixedBand).toEqual(entry.openingFeeModeDepositBands['promo-fixed-65000'])
  })

  it('keeps premium tiers and composer defaults aligned with locked maturity example', () => {
    const example = loadYaml(MATURITY_EXAMPLE_PATH) as {
      inputs: {
        monthlyDeposit: number
        termMonths: number
        openingFeeMode: string
      }
      expected: {
        earlyExitPremiumRatePctByMonthBand: {
          months49to96: number
          months97to120: number
        }
        maturityPremiumRatePctFromMonth120: number
      }
    }
    const entry = findHomeSavingsProduct('premium-plusz-10x30')
    expect(entry).not.toBeNull()
    if (!entry) return

    expect(entry.premiumTiers).toEqual({
      months49to96: example.expected.earlyExitPremiumRatePctByMonthBand.months49to96,
      months97to120: example.expected.earlyExitPremiumRatePctByMonthBand.months97to120,
      maturityFrom120: example.expected.maturityPremiumRatePctFromMonth120
    })
    expect(entry.defaultMonthlyDeposit).toBe(example.inputs.monthlyDeposit)
    expect(entry.defaultTermMonths).toBe(example.inputs.termMonths)
    expect(entry.defaultOpeningFeeMode).toBe(example.inputs.openingFeeMode)
    expect(entry.defaultHousingPurpose).toBe(true)
  })

  it('rejects promo opening-fee modes outside deposit bands at the adapter seam', () => {
    const product = findHomeSavingsProduct('premium-plusz-10x30')
    expect(product).not.toBeNull()
    if (!product) return

    expect(() =>
      resolveHomeSavingsOpeningFee(product, {
        monthlyDeposit: 20_000,
        openingFeeMode: 'promo-fixed-65000'
      })
    ).toThrow(/between 50000 and 100000/i)

    expect(() =>
      mapHomeSavingsSpecInputsToBundleInput({
        productCode: 'premium-plusz-10x30',
        monthlyDeposit: 80_000,
        termMonths: 120,
        startDate: '2026-10-10',
        housingPurpose: true,
        openingFeeMode: 'promo-half-percent'
      })
    ).toThrow(/between 10000 and 49990/i)

    expect(
      resolveHomeSavingsOpeningFee(product, {
        monthlyDeposit: 50_000,
        openingFeeMode: 'promo-fixed-65000'
      })
    ).toBe(65_000)
  })

  it('keeps metadata migrationStatus aligned with PRODUCT_CATALOG', () => {
    const catalog = readRepoFile(CATALOG_PATH)
    const row = catalog
      .split('\n')
      .find(
        (line) =>
          line.startsWith('| home-savings.premium-plusz-10x30.standard |') &&
          line.includes('| commercially-usable |')
      )
    expect(row).toBeDefined()

    const entry = findHomeSavingsProduct('premium-plusz-10x30')
    expect(entry?.migrationStatus).toBe('commercially-usable')
    expect(entry?.commerciallyBlockedReason).toBeNull()
    expect(entry?.discountHints?.length).toBeGreaterThan(0)
    expect(entry?.premiumHints).toMatch(/Premium tiers/i)
  })

  it('surfaces a single EBKM preview value from the ADR 0031 packaging helper', () => {
    const withPremium = calculateHomeSavingsScheduleFromSpecInputs(
      {
        productCode: 'premium-plusz-10x30',
        monthlyDeposit: 20_000,
        termMonths: 120,
        startDate: '2026-10-10',
        housingPurpose: true,
        openingFeeMode: 'promo-half-percent'
      },
      { resolveHomeSavingsSchedule }
    )
    const withoutPremium = calculateHomeSavingsScheduleFromSpecInputs(
      {
        productCode: 'premium-plusz-10x30',
        monthlyDeposit: 20_000,
        termMonths: 120,
        startDate: '2026-10-10',
        housingPurpose: false,
        openingFeeMode: 'promo-half-percent'
      },
      { resolveHomeSavingsSchedule }
    )

    expect(withPremium.accountFeeMonthly).toBe(500)
    expect(withPremium.ebkmPct).toBe(4.35)
    expect(withoutPremium.ebkmPct).toBe(-0.58)
  })

  it('keeps browser ‰ helpers aligned with engine Melléklet cases', () => {
    const cases = [
      { contractAmount: 26_000_000, monthlyDeposit: 100_000 },
      { contractAmount: 13_000_000, monthlyDeposit: 50_000 },
      { contractAmount: 5_200_000, monthlyDeposit: 20_000 }
    ] as const

    for (const { contractAmount, monthlyDeposit } of cases) {
      expect(resolveMonthlyDepositFromContractAmount({ contractAmount })).toBe(monthlyDeposit)
      expect(engineResolveMonthlyDepositFromContractAmount({ contractAmount })).toBe(monthlyDeposit)
      expect(resolveContractAmountFromMonthlyDeposit({ monthlyDeposit })).toBe(contractAmount)
      expect(engineResolveContractAmountFromMonthlyDeposit({ monthlyDeposit })).toBe(contractAmount)
    }

    expect(ceilToTenForint(12_345.1)).toBe(engineCeilToTenForint(12_345.1))
    expect(ceilToTenForint(12_345.1)).toBe(12_350)
  })
})
