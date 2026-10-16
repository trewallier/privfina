import { toFiniteNumber, toPositiveInteger, toNonNegativeNumber } from './spec-input-validators.js'

/**
 * Shared bridges between fixed-rate loan/mortgage product-spec inputs
 * and the existing browser calculation path in `public/instruments.js`.
 */

function mapFixedRateLoanLikeSpecInputsToLegacyCalculationInput(specInputs) {
  const principal = toNonNegativeNumber(specInputs.principal, 'principal')
  const annualInterestRatePct = toNonNegativeNumber(
    specInputs.annualInterestRatePct,
    'annualInterestRatePct'
  )
  const termMonths = toPositiveInteger(specInputs.termMonths, 'termMonths')

  return {
    principal,
    annualRate: annualInterestRatePct / 100,
    termMonths
  }
}

function mapLegacyLoanPreviewToSpecOutputs(legacyPreview) {
  return {
    monthlyPayment: toFiniteNumber(legacyPreview.monthlyInstallment, 'monthlyInstallment'),
    paymentCount: toPositiveInteger(legacyPreview.termMonths, 'termMonths'),
    totalInterest: toFiniteNumber(legacyPreview.totalInterest, 'totalInterest'),
    totalPaid: toFiniteNumber(legacyPreview.totalRepayment, 'totalRepayment')
  }
}

function calculateFixedRateLoanLikeFromSpecInputs(specInputs, options) {
  const createLoanRepaymentPreview = options?.createLoanRepaymentPreview
  if (typeof createLoanRepaymentPreview !== 'function') {
    throw new Error('createLoanRepaymentPreview function is required.')
  }

  const legacyInput = mapFixedRateLoanLikeSpecInputsToLegacyCalculationInput(specInputs)
  const legacyPreview = createLoanRepaymentPreview(legacyInput)
  return mapLegacyLoanPreviewToSpecOutputs(legacyPreview)
}

export {
  mapFixedRateLoanLikeSpecInputsToLegacyCalculationInput,
  mapLegacyLoanPreviewToSpecOutputs,
  calculateFixedRateLoanLikeFromSpecInputs
}
