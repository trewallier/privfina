import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import YAML from 'yaml'
import {
  assertStartDateInSaleWindow,
  calculateHomeSavingsFromProductSpec,
  loadHomeSavingsProductSpec,
  mapHomeSavingsSpecInputsToInstrumentInput,
  resolveHomeSavingsPremiumRatePct,
  resolveHomeSavingsSchedule,
  resolveHomeSavingsContractAmount,
  type HomeSavingsSpecInputs
} from '../src/finance_engine/engine'
import { DEFAULT_PRODUCT_SCHEMA_PATH } from '../src/finance_engine/product_specs/loader'
import { mapFormDataToHomeSavingsSpecInputs } from '../public/controller/home-savings-form.js'
import { findHomeSavingsProduct } from '../public/controller/home-savings-product-metadata.js'

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

function loadProduct(relativePath: string) {
  const schema = JSON.parse(readRepoFile(DEFAULT_PRODUCT_SCHEMA_PATH))
  return loadHomeSavingsProductSpec(readRepoFile(relativePath), schema)
}

const WITHDRAWN_PRODUCTS = [
  {
    code: 'premium-plusz-4x10',
    path: 'docs/product-specs/products/home-savings/premium-plusz-4x10/product.yaml',
    example: 'docs/product-specs/products/home-savings/premium-plusz-4x10/examples/maturity-premium-48.yaml',
    outsideStart: '2026-08-03'
  },
  {
    code: 'premium-plusz-8x30',
    path: 'docs/product-specs/products/home-savings/premium-plusz-8x30/product.yaml',
    example: 'docs/product-specs/products/home-savings/premium-plusz-8x30/examples/maturity-premium-96.yaml',
    outsideStart: '2025-07-31'
  },
  {
    code: 'premium-4x10',
    path: 'docs/product-specs/products/home-savings/premium-4x10/product.yaml',
    example: 'docs/product-specs/products/home-savings/premium-4x10/examples/maturity-premium-48.yaml',
    outsideStart: '2025-08-01'
  },
  {
    code: 'premium-8x30',
    path: 'docs/product-specs/products/home-savings/premium-8x30/product.yaml',
    example: 'docs/product-specs/products/home-savings/premium-8x30/examples/maturity-premium-96.yaml',
    outsideStart: '2026-01-01'
  }
] as const

describe('home-savings withdrawn módozatok + saleWindow (§5f)', () => {
  it('validates all withdrawn product YAML against schema v2', () => {
    for (const entry of WITHDRAWN_PRODUCTS) {
      const product = loadProduct(entry.path)
      expect(product.productCode).toBe(entry.code)
      expect(product.saleWindow?.from).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(product.saleWindow?.to).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('rejects startDate outside saleWindow (engine)', () => {
    assertStartDateInSaleWindow('2025-08-01', { from: '2025-08-01', to: '2026-08-02' })
    expect(() =>
      assertStartDateInSaleWindow('2026-08-03', { from: '2025-08-01', to: '2026-08-02' })
    ).toThrow(/after sale window end/)
    expect(() =>
      assertStartDateInSaleWindow('2025-07-31', { from: '2025-08-01', to: '2026-08-02' })
    ).toThrow(/before sale window start/)
  })

  it('calc-aligns maturity examples inside each sale window', () => {
    for (const entry of WITHDRAWN_PRODUCTS) {
      const product = loadProduct(entry.path)
      const example = YAML.parse(readRepoFile(entry.example))
      const inputs = example.inputs as HomeSavingsSpecInputs
      // Schedule path first (fee / Premium / deposits). Full EBKM commercially-usable
      // goldens for withdrawn offerings trail under ROADMAP §5f.
      const instrument = mapHomeSavingsSpecInputsToInstrumentInput(product, inputs)
      const schedule = resolveHomeSavingsSchedule(instrument)
      const contractAmount = resolveHomeSavingsContractAmount(product, inputs)

      expect(schedule.accountFeeMonthly).toBe(example.expected.accountFeeMonthly)
      expect(schedule.accountOpeningFee).toBe(example.expected.accountOpeningFee)
      expect(schedule.totalDeposits).toBe(example.expected.totalDeposits)
      expect(schedule.totalAccountFees).toBe(example.expected.totalAccountFees)
      expect(schedule.premiumRatePct).toBe(example.expected.premiumRatePct)
      expect(schedule.premiumAmount).toBe(example.expected.premiumAmount)
      expect(contractAmount).toBe(example.expected.contractAmount)
      expect(schedule.terminalPayout).toBeGreaterThan(schedule.totalDeposits)
    }
  })

  it('rejects out-of-window startDate on product-spec path', () => {
    for (const entry of WITHDRAWN_PRODUCTS) {
      const product = loadProduct(entry.path)
      const example = YAML.parse(readRepoFile(entry.example))
      const inputs = {
        ...(example.inputs as HomeSavingsSpecInputs),
        startDate: entry.outsideStart
      }
      expect(() => calculateHomeSavingsFromProductSpec(product, inputs)).toThrow(/sale window/)
    }
  })

  it('resolves Premium bands for short módozatok at evaluation min (not 10x30 breakpoints)', () => {
    expect(
      resolveHomeSavingsPremiumRatePct({
        termMonths: 48,
        housingPurpose: true,
        tiers: { bands: [{ minHoldingMonths: 48, ratePct: 10 }] }
      })
    ).toBe(10)
    expect(
      resolveHomeSavingsPremiumRatePct({
        termMonths: 47,
        housingPurpose: true,
        tiers: { bands: [{ minHoldingMonths: 48, ratePct: 10 }] }
      })
    ).toBe(0)
    expect(
      resolveHomeSavingsPremiumRatePct({
        termMonths: 96,
        housingPurpose: true,
        tiers: { bands: [{ minHoldingMonths: 96, ratePct: 30 }] }
      })
    ).toBe(30)
  })

  it('composer form rejects out-of-window start for withdrawn Plus 4x10', () => {
    const product = findHomeSavingsProduct('premium-plusz-4x10')
    expect(product).toBeTruthy()
    const formData = {
      get(name: string) {
        const values: Record<string, string> = {
          monthlyDeposit: '50000',
          termMonths: '48',
          startDate: '2026-08-03',
          housingPurpose: 'on',
          openingFeeMode: 'promo-fixed-25000'
        }
        return values[name] ?? null
      }
    } as FormData
    expect(() => mapFormDataToHomeSavingsSpecInputs(formData, product)).toThrow(/sale window/)
  })

  it('composer form accepts last-day start for withdrawn Plus 4x10', () => {
    const product = findHomeSavingsProduct('premium-plusz-4x10')
    const formData = {
      get(name: string) {
        const values: Record<string, string> = {
          monthlyDeposit: '50000',
          termMonths: '48',
          startDate: '2026-08-02',
          housingPurpose: 'on',
          openingFeeMode: 'promo-fixed-25000'
        }
        return values[name] ?? null
      }
    } as FormData
    const inputs = mapFormDataToHomeSavingsSpecInputs(formData, product)
    expect(inputs.startDate).toBe('2026-08-02')
    expect(inputs.openingFeeMode).toBe('promo-fixed-25000')
  })
})
