import { describe, expect, it } from 'vitest'
import { createLoanPreviewSync } from '../public/controller/previews.js'
import { calculateCommercialLoanFromSpecInputs } from '../public/controller/commercial-loan-calculation-adapter.js'
import { createLoanRepaymentPreview } from '../public/instruments.js'

function fakeInput(value: string | number | boolean) {
  return { value: String(value), checked: Boolean(value) }
}

describe('commercial loan preview sync (ADR 0025)', () => {
  it('threads productCode into the commercial calculator so ACT/360 preview matches §6', () => {
    const monthlyPreviewInput = { value: '' }
    const totalRepaymentPreviewInput = { value: '' }
    const totalInterestPreviewInput = { value: '' }

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
      createLoanRepaymentPreview,
      calculateFixedRateLoanFromSpecInputs: calculateCommercialLoanFromSpecInputs
    })

    sync()

    expect(monthlyPreviewInput.value).toBe('101 128.00')
    expect(totalInterestPreviewInput.value).not.toBe('—')
    expect(totalRepaymentPreviewInput.value).not.toBe('—')
  })

  it('shows em dash when commercial preview lacks a resolvable productCode', () => {
    const monthlyPreviewInput = { value: '' }
    const totalRepaymentPreviewInput = { value: '' }
    const totalInterestPreviewInput = { value: '' }

    const sync = createLoanPreviewSync({
      principalInput: fakeInput(12_000_000),
      annualRateInput: fakeInput(7.99),
      termValueInput: fakeInput(240),
      termUnitInput: fakeInput('months'),
      gracePeriodMonthsInput: fakeInput(''),
      capitalizeInterestAtGraceEndInput: { checked: false },
      productCodeInput: fakeInput(''),
      monthlyPreviewInput,
      totalRepaymentPreviewInput,
      totalInterestPreviewInput,
      createLoanRepaymentPreview,
      calculateFixedRateLoanFromSpecInputs: calculateCommercialLoanFromSpecInputs
    })

    sync()

    expect(monthlyPreviewInput.value).toBe('—')
    expect(totalRepaymentPreviewInput.value).toBe('—')
    expect(totalInterestPreviewInput.value).toBe('—')
  })
})
