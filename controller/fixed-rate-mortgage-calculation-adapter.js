import { toFiniteNumber, toPositiveInteger, toNonNegativeNumber } from './spec-input-validators.js'

function mapFixedRateMortgageSpecInputsToLegacyCalculationInput(specInputs) {
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

function calculateFixedRateMortgageFromSpecInputs(specInputs, options) {
  const createLoanRepaymentPreview = options?.createLoanRepaymentPreview
  if (typeof createLoanRepaymentPreview !== 'function') {
    throw new Error('createLoanRepaymentPreview function is required.')
  }

  const legacyInput = mapFixedRateMortgageSpecInputsToLegacyCalculationInput(specInputs)
  const legacyPreview = createLoanRepaymentPreview(legacyInput)
  return mapLegacyLoanPreviewToSpecOutputs(legacyPreview)
}

function mapFixedRateMortgageSpecInputsToLegacyLoanBundleInput(specInputs, extras = {}) {
  const legacyInput = mapFixedRateMortgageSpecInputsToLegacyCalculationInput(specInputs)
  const startDate = String(specInputs.startDate || '').trim()

  return {
    ...extras,
    principal: legacyInput.principal,
    annualRate: legacyInput.annualRate,
    termValue: legacyInput.termMonths,
    termUnit: 'months',
    startDate
  }
}

export {
  mapFixedRateMortgageSpecInputsToLegacyCalculationInput,
  mapLegacyLoanPreviewToSpecOutputs,
  calculateFixedRateMortgageFromSpecInputs,
  mapFixedRateMortgageSpecInputsToLegacyLoanBundleInput
}
