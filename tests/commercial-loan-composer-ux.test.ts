import { describe, expect, it } from 'vitest'
import YAML from 'yaml'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  calculateCommercialLoanFromSpecInputs,
  calculateCommercialLoanPackage,
  mapCommercialLoanSpecInputsToLegacyLoanBundleInput
} from '../public/controller/commercial-loan-calculation-adapter.js'
import { getCommercialLoanCommercialBlocks } from '../public/controller/commercial-loan-commercial-blocks.js'
import { applyFeesAndDiscounts as applyFeesBrowser } from '../public/controller/loan-fees.js'
import { applyFeesAndDiscounts as applyFeesEngine } from '../src/finance_engine/instruments/loan_fees'
import { calculateThmFromMonthlyRepayments as thmBrowser } from '../public/controller/thm.js'
import { calculateThmFromMonthlyRepayments as thmEngine } from '../src/finance_engine/product_specs/mortgage_loan'
import { createLoanRepaymentPreview } from '../public/instruments.js'
import { createLoanPreviewSync } from '../public/controller/previews.js'

function fakeInput(value: string | number | boolean) {
  return { value: String(value), checked: Boolean(value) }
}

describe('commercial loan composer UX (§5b)', () => {
  it('dual-surfaces fee application with the TypeScript primitive', () => {
    const blocks = getCommercialLoanCommercialBlocks('otp-1x1')
    const options = { principal: 12_000_000, activeDiscountNames: [] as string[] }
    const browser = applyFeesBrowser(blocks.fees, blocks.discounts, options)
    const engine = applyFeesEngine(blocks.fees, blocks.discounts, options)
    expect(browser.totalCreditCostFees).toBe(engine.totalCreditCostFees)
    expect(browser.totalCreditCostFees).toBe(193_965)
  })

  it('dual-surfaces Annex THM percentRounded with the TypeScript primitive', () => {
    const monthlyPayments = Array.from({ length: 240 }, () => 101_128)
    const input = {
      principal: 12_000_000,
      upfrontFees: 193_965,
      monthlyPayments
    }
    expect(thmBrowser(input).percentRounded).toBe(thmEngine(input).percentRounded)
    expect(thmBrowser(input).percentRounded).toBe(8.6)
  })

  it('computes fee package + single THM for otp-1x1 representative inputs', () => {
    const packaged = calculateCommercialLoanPackage(
      {
        productCode: 'otp-1x1',
        principal: 12_000_000,
        annualInterestRatePct: 7.99,
        termMonths: 240,
        startDate: '2026-04-01',
        loanPurpose: 'used-home-purchase',
        activeDiscountNames: []
      },
      { createLoanRepaymentPreview }
    )

    expect(packaged.monthlyPayment).toBe(101_128)
    expect(packaged.totalCreditCostFees).toBe(193_965)
    expect(packaged.thmPct).toBe(8.6)
  })

  it('applies otp-zold folyósítási waiver by default and exposes THM preview fields', () => {
    const outputs = calculateCommercialLoanFromSpecInputs(
      {
        productCode: 'otp-zold',
        principal: 12_000_000,
        annualInterestRatePct: 7.99,
        termMonths: 240,
        startDate: '2026-04-01',
        loanPurpose: 'new-home-purchase'
        // defaultActiveDiscountNames from commercial blocks
      },
      { createLoanRepaymentPreview, productCode: 'otp-zold' }
    )

    expect(outputs.totalCreditCostFees).toBe(89_365)
    expect(outputs.thmPct).toBe(8.5)
  })

  it('fee-waiver toggle reduces the fee package vs no waiver', () => {
    const without = calculateCommercialLoanPackage(
      {
        productCode: 'otp-1x1',
        principal: 12_000_000,
        annualInterestRatePct: 7.99,
        termMonths: 240,
        activeDiscountNames: []
      },
      { createLoanRepaymentPreview }
    )
    const withWaiver = calculateCommercialLoanPackage(
      {
        productCode: 'otp-1x1',
        principal: 12_000_000,
        annualInterestRatePct: 7.99,
        termMonths: 240,
        activeDiscountNames: ['otp-dijkedvezmenyes-folyositasi-dij-elengedes']
      },
      { createLoanRepaymentPreview }
    )
    expect(withWaiver.totalCreditCostFees).toBeLessThan(without.totalCreditCostFees)
  })

  it('persists purpose, active discounts, and base rate on the legacy bundle config', () => {
    const legacy = mapCommercialLoanSpecInputsToLegacyLoanBundleInput(
      {
        productCode: 'otp-1x1',
        principal: 12_000_000,
        annualInterestRatePct: 7.99,
        termMonths: 240,
        startDate: '2026-04-01',
        loanPurpose: 'used-home-purchase',
        activeDiscountNames: ['huseg-szolgaltatas']
      },
      { label: 'Test', repaymentDayOfMonth: 1, includeDisbursement: true }
    )

    expect(legacy.loanPurpose).toBe('used-home-purchase')
    expect(legacy.activeDiscountNames).toEqual(['huseg-szolgaltatas'])
    expect(legacy.baseAnnualInterestRatePct).toBe(7.99)
    // 120 bp loyalty discount applied to schedule rate
    expect(legacy.annualRate).toBeCloseTo(0.0679, 6)
  })

  it('preview sync fills fee package and single THM fields', () => {
    const monthlyPreviewInput = { value: '' }
    const totalRepaymentPreviewInput = { value: '' }
    const totalInterestPreviewInput = { value: '' }
    const feesPreviewInput = { value: '' }
    const thmPreviewInput = { value: '' }

    const sync = createLoanPreviewSync({
      principalInput: fakeInput(12_000_000),
      annualRateInput: fakeInput(7.99),
      termValueInput: fakeInput(240),
      termUnitInput: fakeInput('months'),
      gracePeriodMonthsInput: fakeInput(''),
      capitalizeInterestAtGraceEndInput: { checked: false },
      productCodeInput: fakeInput('otp-1x1'),
      monthlyPreviewInput,
      totalRepaymentPreviewInput,
      totalInterestPreviewInput,
      feesPreviewInput,
      thmPreviewInput,
      readCommercialPackaging: () => ({ activeDiscountNames: [], includeOptionalFeeNames: [] }),
      createLoanRepaymentPreview,
      calculateFixedRateLoanFromSpecInputs: calculateCommercialLoanFromSpecInputs
    })

    sync()

    expect(monthlyPreviewInput.value).toBe('101128.00')
    expect(feesPreviewInput.value).toBe('193965.00')
    expect(thmPreviewInput.value).toBe('8.6%')
  })

  it('keeps commercial-block fee names aligned with product YAML upfront fees', () => {
    const productCode = 'otp-1x1'
    const yaml = YAML.parse(
      readFileSync(
        resolve(process.cwd(), `docs/product-specs/products/loans/${productCode}/product.yaml`),
        'utf8'
      )
    ) as { fees?: Array<{ name: string; timing?: string }> }
    const yamlNames = (yaml.fees || [])
      .filter((fee) => (fee.timing ?? 'upfront') === 'upfront')
      .map((fee) => fee.name)
      .sort()
    const blockNames = getCommercialLoanCommercialBlocks(productCode)
      .fees.map((fee: { name: string }) => fee.name)
      .sort()
    expect(blockNames).toEqual(yamlNames)
  })
})
