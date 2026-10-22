import { toFiniteNumber, toPositiveInteger, toNonNegativeNumber } from './spec-input-validators.js'

/**
 * Shared bridges between fixed-rate loan/mortgage product-spec inputs
 * and the existing browser calculation path in `public/instruments.js`.
 */

function normalizeOptionalGracePeriodMonths(value) {
  if (value === undefined || value === null || value === '') {
    return 0
  }

  const gracePeriodMonths = Number(value)
  if (!Number.isInteger(gracePeriodMonths) || gracePeriodMonths < 0) {
    throw new Error('gracePeriodMonths must be a non-negative integer.')
  }

  return gracePeriodMonths
}

function mapFixedRateLoanLikeSpecInputsToLegacyCalculationInput(specInputs) {
  const principal = toNonNegativeNumber(specInputs.principal, 'principal')
  const annualInterestRatePct = toNonNegativeNumber(
    specInputs.annualInterestRatePct,
    'annualInterestRatePct'
  )
  const termMonths = toPositiveInteger(specInputs.termMonths, 'termMonths')
  const gracePeriodMonths = normalizeOptionalGracePeriodMonths(specInputs.gracePeriodMonths)
  const capitalizeInterestAtGraceEnd =
    gracePeriodMonths > 0 && specInputs.capitalizeInterestAtGraceEnd === true

  return {
    principal,
    annualRate: annualInterestRatePct / 100,
    termMonths,
    gracePeriodMonths,
    capitalizeInterestAtGraceEnd,
    interestDayCountConvention: specInputs.interestDayCountConvention ?? '30/360',
    paymentRounding: specInputs.paymentRounding ?? 'none'
  }
}

function mapLegacyLoanPreviewToSpecOutputs(legacyPreview) {
  const paymentCountSource =
    legacyPreview.paymentCount !== undefined ? legacyPreview.paymentCount : legacyPreview.termMonths

  return {
    monthlyPayment: toFiniteNumber(legacyPreview.monthlyInstallment, 'monthlyInstallment'),
    paymentCount: toPositiveInteger(paymentCountSource, 'paymentCount'),
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
