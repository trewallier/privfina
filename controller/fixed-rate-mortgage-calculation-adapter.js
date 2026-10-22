import { FIXED_RATE_MORTGAGE_PRODUCT_SPEC } from './fixed-rate-mortgage-product-spec.js'
import {
  mapFixedRateLoanLikeSpecInputsToLegacyCalculationInput,
  mapLegacyLoanPreviewToSpecOutputs,
  calculateFixedRateLoanLikeFromSpecInputs
} from './loan-legacy-bridges.js'

function withSimplifiedDayCount(specInputs) {
  const engine = FIXED_RATE_MORTGAGE_PRODUCT_SPEC.engine || {}
  return {
    ...specInputs,
    interestDayCountConvention:
      specInputs.interestDayCountConvention ?? engine.interestDayCountConvention ?? '30/360',
    paymentRounding: specInputs.paymentRounding ?? engine.paymentRounding ?? 'none'
  }
}

function mapFixedRateMortgageSpecInputsToLegacyCalculationInput(specInputs) {
  return mapFixedRateLoanLikeSpecInputsToLegacyCalculationInput(withSimplifiedDayCount(specInputs))
}

function calculateFixedRateMortgageFromSpecInputs(specInputs, options) {
  return calculateFixedRateLoanLikeFromSpecInputs(withSimplifiedDayCount(specInputs), options)
}

function mapFixedRateMortgageSpecInputsToLegacyLoanBundleInput(specInputs, extras = {}) {
  const legacyInput = mapFixedRateMortgageSpecInputsToLegacyCalculationInput(specInputs)
  const startDate = String(specInputs.startDate || '').trim()

  return {
    ...extras,
    productId: FIXED_RATE_MORTGAGE_PRODUCT_SPEC.id,
    productSpecVersion: FIXED_RATE_MORTGAGE_PRODUCT_SPEC.specVersion,
    label: String(extras.label || '').trim() || FIXED_RATE_MORTGAGE_PRODUCT_SPEC.ui.formTitle,
    principal: legacyInput.principal,
    annualRate: legacyInput.annualRate,
    termValue: legacyInput.termMonths,
    termUnit: 'months',
    startDate,
    gracePeriodMonths: legacyInput.gracePeriodMonths,
    capitalizeInterestAtGraceEnd: legacyInput.capitalizeInterestAtGraceEnd,
    interestDayCountConvention: legacyInput.interestDayCountConvention,
    paymentRounding: legacyInput.paymentRounding
  }
}

export {
  mapFixedRateMortgageSpecInputsToLegacyCalculationInput,
  mapLegacyLoanPreviewToSpecOutputs,
  calculateFixedRateMortgageFromSpecInputs,
  mapFixedRateMortgageSpecInputsToLegacyLoanBundleInput
}
