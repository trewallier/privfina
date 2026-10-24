import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import YAML from 'yaml'
import {
  calculateHomeSavingsFromProductSpec,
  generateCashFlowsFromHomeSavingsProductSpec,
  loadHomeSavingsProductSpec,
  resolvePremiumRateForTerm,
  type HomeSavingsSpecInputs
} from '../src/finance_engine/engine'
import { DEFAULT_PRODUCT_SCHEMA_PATH } from '../src/finance_engine/product_specs/loader'
import { CashFlowDirection } from '../src/finance_engine/models'

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

function loadExample(relativePath: string): {
  inputs: HomeSavingsSpecInputs
  expected: Record<string, unknown>
} {
  const example = YAML.parse(readRepoFile(relativePath))
  return {
    inputs: example.inputs as HomeSavingsSpecInputs,
    expected: example.expected as Record<string, unknown>
  }
}

describe('home-savings calc-aligned (PRÉMIUM PLUSZ 10x30)', () => {
  const product = loadProduct()

  it('loads product under home-savings family', () => {
    expect(product.family).toBe('home-savings')
    expect(product.productCode).toBe('premium-plusz-10x30')
    expect(product.engine.instrumentType).toBe('home-savings')
  })

  it('computes maturity-premium-120 schedule from example inputs (interest omitted)', () => {
    const { inputs, expected } = loadExample(
      'docs/product-specs/products/home-savings/premium-plusz-10x30/examples/maturity-premium-120.yaml'
    )

    const outputs = calculateHomeSavingsFromProductSpec(product, inputs)

    expect(outputs.accountFeeMonthly).toBe(expected.accountFeeMonthly)
    expect(outputs.accountOpeningFee).toBe(expected.accountOpeningFee)
    expect(outputs.totalDeposits).toBe(expected.totalDeposits)
    expect(outputs.totalAccountFees).toBe(expected.totalAccountFees)
    expect(outputs.premiumRatePct).toBe(expected.premiumRatePct)
    expect(outputs.depositInterest).toBe(0)
    expect(outputs.premiumBase).toBe(outputs.totalDeposits)
    expect(outputs.premiumAmount).toBe(1_800_000)
    expect(outputs.terminalPayout).toBe(7_800_000)
    expect(outputs.productId).toBe('home-savings.premium-plusz-10x30.standard')
    expect(outputs.productSpecVersion).toBe('v2alpha1')
  })

  it('generates customer cash flows: opening fee, deposits, account fees, terminal inflow', () => {
    const { inputs } = loadExample(
      'docs/product-specs/products/home-savings/premium-plusz-10x30/examples/maturity-premium-120.yaml'
    )

    const flows = generateCashFlowsFromHomeSavingsProductSpec(product, inputs)
    const opening = flows.filter((flow) => flow.description === 'Account opening fee')
    const deposits = flows.filter((flow) => flow.direction === CashFlowDirection.Outflow && flow.amount === 50000)
    const fees = flows.filter((flow) => flow.description === 'Account management fee')
    const terminal = flows.filter((flow) => flow.description === 'Home-savings terminal payout')

    expect(opening).toHaveLength(1)
    expect(opening[0].direction).toBe(CashFlowDirection.Outflow)
    expect(opening[0].amount).toBe(65000)
    expect(opening[0].date).toBe(inputs.startDate)

    expect(deposits).toHaveLength(120)
    expect(fees).toHaveLength(120)
    expect(terminal).toHaveLength(1)
    expect(terminal[0].direction).toBe(CashFlowDirection.Inflow)
    expect(terminal[0].amount).toBe(7_800_000)
    expect(terminal[0].date).toBe(deposits[deposits.length - 1].date)
  })

  it('resolves Premium early-exit bands from Hirdetmény tiers', () => {
    expect(resolvePremiumRateForTerm(48, true)).toBe(0)
    expect(resolvePremiumRateForTerm(49, true)).toBe(10)
    expect(resolvePremiumRateForTerm(96, true)).toBe(10)
    expect(resolvePremiumRateForTerm(97, true)).toBe(20)
    expect(resolvePremiumRateForTerm(119, true)).toBe(20)
    expect(resolvePremiumRateForTerm(120, true)).toBe(30)
    expect(resolvePremiumRateForTerm(120, false)).toBe(0)
    expect(resolvePremiumRateForTerm(120, true, 60)).toBe(10)
    expect(resolvePremiumRateForTerm(120, true, 100)).toBe(20)
  })

  it('requires contractAmount for percent opening-fee modes', () => {
    expect(() =>
      calculateHomeSavingsFromProductSpec(product, {
        monthlyDeposit: 20000,
        termMonths: 120,
        startDate: '2026-10-10',
        housingPurpose: true,
        openingFeeMode: 'standard-1pct'
      })
    ).toThrow(/contractAmount/)

    const withContract = calculateHomeSavingsFromProductSpec(product, {
      monthlyDeposit: 20000,
      termMonths: 120,
      startDate: '2026-10-10',
      housingPurpose: true,
      openingFeeMode: 'standard-1pct',
      contractAmount: 2_600_000
    })
    expect(withContract.accountOpeningFee).toBe(26000)
  })

  it('leaves deposit interest at zero when ÁSZF rate is omitted', () => {
    const outputs = calculateHomeSavingsFromProductSpec(product, {
      monthlyDeposit: 50000,
      termMonths: 120,
      startDate: '2026-10-10',
      housingPurpose: true,
      openingFeeMode: 'promo-fixed-65000'
    })
    expect(outputs.depositInterest).toBe(0)
    expect(outputs.premiumBase).toBe(outputs.totalDeposits)
  })
})
