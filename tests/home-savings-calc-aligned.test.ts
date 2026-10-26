import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import YAML from 'yaml'
import {
  calculateHomeSavingsFromProductSpec,
  generateCashFlowsFromHomeSavingsProductSpec,
  loadHomeSavingsProductSpec,
  resolveContractAmountFromMonthlyDeposit,
  resolveHomeSavingsContractAmount,
  resolveHomeSavingsMaturityPayoutDate,
  resolveMonthlyDepositFromContractAmount,
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
  source?: { kind: string; url?: string; capturedAt?: string }
} {
  const example = YAML.parse(readRepoFile(relativePath))
  return {
    inputs: example.inputs as HomeSavingsSpecInputs,
    expected: example.expected as Record<string, unknown>,
    source: example.source
  }
}

describe('home-savings calc-aligned (PRÉMIUM PLUSZ 10x30)', () => {
  const product = loadProduct()

  it('loads product under home-savings family with USZ Melléklet rate locks', () => {
    expect(product.family).toBe('home-savings')
    expect(product.productCode).toBe('premium-plusz-10x30')
    expect(product.engine.instrumentType).toBe('home-savings')
    expect(product.engine.depositInterestAnnualRatePct).toBe(0.1)
    expect(product.engine.savingsRatePermille).toBe(3.846)
    expect(product.engine.minContractAmount).toBe(2_600_000)
    expect(product.engine.maxContractAmount).toBe(26_000_000)
  })

  it('derives contract amount from monthly deposit via 3.846‰', () => {
    expect(resolveMonthlyDepositFromContractAmount({ contractAmount: 26_000_000 })).toBe(100_000)
    expect(resolveMonthlyDepositFromContractAmount({ contractAmount: 13_000_000 })).toBe(50_000)
    expect(resolveMonthlyDepositFromContractAmount({ contractAmount: 5_200_000 })).toBe(20_000)
    expect(resolveContractAmountFromMonthlyDeposit({ monthlyDeposit: 100_000 })).toBe(26_000_000)
    expect(resolveContractAmountFromMonthlyDeposit({ monthlyDeposit: 50_000 })).toBe(13_000_000)
    expect(resolveContractAmountFromMonthlyDeposit({ monthlyDeposit: 20_000 })).toBe(5_200_000)
  })

  it('resolves OTP-calculator maturity packaging (first of month after lastDeposit+2), not literal §22 (1)', () => {
    // start 2026-10-10 → last deposit 2036-09-10 → first of month +2 = 2036-11-01.
    // Calendar start+122 = 2036-12-10; literal §22 (1) is also not this first-of-month rule.
    expect(
      resolveHomeSavingsMaturityPayoutDate({ startDate: '2026-10-10', termMonths: 120 })
    ).toBe('2036-11-01')
  })

  it('matches OTP fee / Premium for maturity-premium-120; live |engine − OTP terminal| ≤ 4 Ft', () => {
    const { inputs, expected } = loadExample(
      'docs/product-specs/products/home-savings/premium-plusz-10x30/examples/maturity-premium-120.yaml'
    )

    const outputs = calculateHomeSavingsFromProductSpec(product, inputs)
    const otpTerminal = expected.terminalPayout as number
    const liveDelta = outputs.terminalPayout - otpTerminal

    expect(outputs.accountFeeMonthly).toBe(expected.accountFeeMonthly)
    expect(outputs.accountOpeningFee).toBe(expected.accountOpeningFee)
    expect(outputs.totalDeposits).toBe(expected.totalDeposits)
    expect(outputs.totalAccountFees).toBe(expected.totalAccountFees)
    expect(outputs.premiumRatePct).toBe(expected.premiumRatePct)
    expect(outputs.premiumBase).toBe(expected.premiumBase)
    expect(outputs.premiumAmount).toBe(expected.premiumAmount)
    expect(otpTerminal).toBe(7_831_152)
    // Derived interest in YAML (terminal − deposits − premium), not a separate OTP readout.
    expect(expected.depositInterest).toBe(
      otpTerminal - (expected.totalDeposits as number) - (expected.premiumAmount as number)
    )
    expect(outputs.depositInterest).toBe(expected.engineDepositInterest)
    expect(outputs.terminalPayout).toBe(expected.engineTerminalPayout)
    expect(liveDelta).toBe(expected.engineTerminalPayoutDeltaFt)
    expect(Math.abs(liveDelta)).toBeLessThanOrEqual(4)
    expect(outputs.productId).toBe('home-savings.premium-plusz-10x30.standard')
    expect(outputs.productSpecVersion).toBe('v2alpha1')
  })

  it('generates customer cash flows with terminal on OTP-packaging maturity payout date', () => {
    const { inputs, expected } = loadExample(
      'docs/product-specs/products/home-savings/premium-plusz-10x30/examples/maturity-premium-120.yaml'
    )

    const flows = generateCashFlowsFromHomeSavingsProductSpec(product, inputs)
    const opening = flows.filter((flow) => flow.description === 'Account opening fee')
    const deposits = flows.filter(
      (flow) => flow.direction === CashFlowDirection.Outflow && flow.amount === 50000
    )
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
    expect(terminal[0].amount).toBe(expected.engineTerminalPayout)
    expect(terminal[0].date).toBe(expected.maturityPayoutDate)
    expect(terminal[0].date).not.toBe(deposits[deposits.length - 1].date)
  })

  it.each([
    'web-calculator-maturity-20000.yaml',
    'web-calculator-maturity-50000.yaml',
    'web-calculator-maturity-100000.yaml'
  ])('locks OTP fee / Premium / Lejáratkor and live |engine − OTP| ≤ 4 Ft for %s', (fileName) => {
    const relativePath = `docs/product-specs/products/home-savings/premium-plusz-10x30/examples/${fileName}`
    const { inputs, expected, source } = loadExample(relativePath)

    expect(source?.kind).toBe('otp-product-page-calculator')
    expect(source?.url).toContain('otpbank.hu/lakastakarek')
    expect(source?.capturedAt).toBe('2026-10-25')

    const outputs = calculateHomeSavingsFromProductSpec(product, inputs)
    const contractAmount = resolveHomeSavingsContractAmount(product, inputs)
    const payoutDate = resolveHomeSavingsMaturityPayoutDate({
      startDate: inputs.startDate,
      termMonths: inputs.termMonths
    })
    const otpTerminal = expected.terminalPayout as number
    const liveDelta = outputs.terminalPayout - otpTerminal

    expect(outputs.accountFeeMonthly).toBe(expected.accountFeeMonthly)
    expect(outputs.accountOpeningFee).toBe(expected.accountOpeningFee)
    expect(contractAmount).toBe(expected.contractAmount)
    expect(contractAmount * 0.01).toBe(expected.accountOpeningFeeStandard1pct)
    expect(outputs.totalDeposits).toBe(expected.totalDeposits)
    expect(outputs.totalAccountFees).toBe(expected.totalAccountFees)
    expect(outputs.premiumRatePct).toBe(expected.premiumRatePct)
    expect(outputs.premiumBase).toBe(expected.premiumBase)
    expect(outputs.premiumAmount).toBe(expected.premiumAmount)
    expect(payoutDate).toBe(expected.maturityPayoutDate)

    // depositInterest in YAML is derived from OTP terminal, not a separate widget capture.
    expect(expected.depositInterest).toBe(
      otpTerminal - (expected.totalDeposits as number) - (expected.premiumAmount as number)
    )
    expect(outputs.depositInterest).toBe(expected.engineDepositInterest)
    expect(outputs.terminalPayout).toBe(expected.engineTerminalPayout)
    expect(liveDelta).toBe(expected.engineTerminalPayoutDeltaFt)
    // Live OTP residual bar (≤4 Ft observed max; mixed-sign, not proven rounding).
    expect(Math.abs(liveDelta)).toBeLessThanOrEqual(4)
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

  it('derives percent opening fees from monthly deposit when contractAmount omitted', () => {
    const derived = resolveHomeSavingsContractAmount(product, {
      monthlyDeposit: 20_000,
      termMonths: 120,
      startDate: '2026-10-10',
      housingPurpose: true,
      openingFeeMode: 'standard-1pct'
    })
    expect(derived).toBe(5_200_000)

    const withDerived = calculateHomeSavingsFromProductSpec(product, {
      monthlyDeposit: 20_000,
      termMonths: 120,
      startDate: '2026-10-10',
      housingPurpose: true,
      openingFeeMode: 'standard-1pct'
    })
    expect(withDerived.accountOpeningFee).toBe(52_000)

    const withExplicit = calculateHomeSavingsFromProductSpec(product, {
      monthlyDeposit: 20_000,
      termMonths: 120,
      startDate: '2026-10-10',
      housingPurpose: true,
      openingFeeMode: 'standard-1pct',
      contractAmount: 2_600_000
    })
    expect(withExplicit.accountOpeningFee).toBe(26_000)
  })

  it('disables deposit interest when annual rate is explicitly 0', () => {
    const outputs = calculateHomeSavingsFromProductSpec(product, {
      monthlyDeposit: 50_000,
      termMonths: 120,
      startDate: '2026-10-10',
      housingPurpose: true,
      openingFeeMode: 'promo-fixed-65000',
      depositInterestAnnualRatePct: 0
    })
    expect(outputs.depositInterest).toBe(0)
    expect(outputs.premiumBase).toBe(outputs.totalDeposits)
    expect(outputs.terminalPayout).toBe(outputs.totalDeposits + outputs.premiumAmount)
  })
})
