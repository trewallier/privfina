import { describe, expect, it } from 'vitest'
import {
  COMMERCIAL_LOAN_PRODUCTS,
  buildCommercialLoanProductOptions,
  findCommercialLoanProduct
} from '../public/controller/commercial-loan-product-metadata.js'
import { mapFormDataToCommercialLoanSpecInputs } from '../public/controller/commercial-loan-form.js'
import {
  calculateCommercialLoanFromSpecInputs,
  mapCommercialLoanSpecInputsToLegacyLoanBundleInput
} from '../public/controller/commercial-loan-calculation-adapter.js'
import { createLoanRepaymentPreview } from '../public/instruments.js'

describe('commercial loan schedule-usable metadata', () => {
  it('exposes all seven Hirdetmény mortgage product codes for the commercial picker', () => {
    const codes = COMMERCIAL_LOAN_PRODUCTS.map((entry) => entry.productCode).sort()
    expect(codes).toEqual(
      [
        'csok-plusz',
        'falusi-csok',
        'otp-1x1',
        'otp-zold',
        'otthon-start',
        'vegig-fix',
        'videki-otthonfelujitasi'
      ].sort()
    )
    expect(buildCommercialLoanProductOptions()).toHaveLength(7)
  })

  it('requires grace for CSOK Plusz and maps customer-perspective schedule inputs', () => {
    const product = findCommercialLoanProduct('csok-plusz')
    expect(product?.graceRequired).toBe(true)

    const specInputs = mapFormDataToCommercialLoanSpecInputs(
      {
        get(name: string) {
          const entries: Record<string, string> = {
            principal: '12000000',
            annualRate: '3',
            termMonths: '240',
            startDate: '2026-05-01',
            gracePeriodMonths: '12',
            loanPurpose: 'used-home-purchase'
          }
          return Object.prototype.hasOwnProperty.call(entries, name) ? entries[name] : null
        }
      } as FormData,
      product!
    )

    const legacy = mapCommercialLoanSpecInputsToLegacyLoanBundleInput(specInputs, {
      label: 'CSOK test',
      repaymentDayOfMonth: 1,
      includeDisbursement: true
    })

    expect(legacy.productId).toBe('mortgage-loan.csok-plusz.standard')
    expect(legacy.productSpecVersion).toBe('v2alpha1')
    expect(legacy.annualRate).toBeCloseTo(0.03)
    expect(legacy.gracePeriodMonths).toBe(12)
    expect(legacy.termValue).toBe(240)
    expect(legacy.termUnit).toBe('months')
    expect(legacy.loanPurpose).toBe('used-home-purchase')
    expect(legacy.capitalizeInterestAtGraceEnd).toBe(false)
    expect(legacy.interestDayCountConvention).toBe('act/360')
    expect(legacy.paymentRounding).toBe('forint')
  })

  it('applies ACT/360 forint installments on the commercial browser calculation path', () => {
    const product = findCommercialLoanProduct('otp-1x1')
    const outputs = calculateCommercialLoanFromSpecInputs(
      {
        productCode: 'otp-1x1',
        principal: 12_000_000,
        annualInterestRatePct: 7.99,
        termMonths: 240,
        startDate: '2026-04-01',
        loanPurpose: 'used-home-purchase'
      },
      { createLoanRepaymentPreview, productCode: product?.productCode }
    )
    expect(outputs.monthlyPayment).toBe(101128)
    expect(outputs.paymentCount).toBe(240)
  })

  it('marks Vidéki as blocked for commercially-usable while remaining schedule-usable', () => {
    const product = findCommercialLoanProduct('videki-otthonfelujitasi')
    expect(product?.migrationStatus).toBe('schedule-usable')
    expect(product?.commerciallyBlockedReason).toMatch(/THM match|reconciled/i)
  })
})
