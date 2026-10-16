import { FIXED_RATE_LOAN_PRODUCT_SPEC } from './fixed-rate-loan-product-spec.js'
import {
  mapFixedRateLoanLikeSpecInputsToLegacyCalculationInput,
  mapLegacyLoanPreviewToSpecOutputs,
  calculateFixedRateLoanLikeFromSpecInputs
} from './loan-legacy-bridges.js'

function mapFixedRateLoanSpecInputsToLegacyCalculationInput(specInputs) {
  return mapFixedRateLoanLikeSpecInputsToLegacyCalculationInput(specInputs)
}

function calculateFixedRateLoanFromSpecInputs(specInputs, options) {
  return calculateFixedRateLoanLikeFromSpecInputs(specInputs, options)
}

function mapFixedRateLoanSpecInputsToLegacyLoanBundleInput(specInputs, extras = {}) {
  const legacyInput = mapFixedRateLoanSpecInputsToLegacyCalculationInput(specInputs)
  const startDate = String(specInputs.startDate || '').trim()
  const termUnit = String(extras.termUnit || 'months').trim().toLowerCase() === 'years' ? 'years' : 'months'
  const numericTermValue = Number(extras.termValue)
  const termValue = Number.isFinite(numericTermValue) && numericTermValue > 0 ? numericTermValue : legacyInput.termMonths

  return {
    ...extras,
    productId: FIXED_RATE_LOAN_PRODUCT_SPEC.id,
    productSpecVersion: FIXED_RATE_LOAN_PRODUCT_SPEC.specVersion,
    label: String(extras.label || '').trim() || FIXED_RATE_LOAN_PRODUCT_SPEC.ui.formTitle,
    principal: legacyInput.principal,
    annualRate: legacyInput.annualRate,
    termValue,
    termUnit,
    startDate
  }
}

export {
  mapFixedRateLoanSpecInputsToLegacyCalculationInput,
  mapLegacyLoanPreviewToSpecOutputs,
  calculateFixedRateLoanFromSpecInputs,
  mapFixedRateLoanSpecInputsToLegacyLoanBundleInput
}
