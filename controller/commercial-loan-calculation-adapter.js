import {
  mapFixedRateLoanLikeSpecInputsToLegacyCalculationInput,
  calculateFixedRateLoanLikeFromSpecInputs
} from './loan-legacy-bridges.js'
import { findCommercialLoanProduct } from './commercial-loan-product-metadata.js'

function calculateCommercialLoanFromSpecInputs(specInputs, options) {
  return calculateFixedRateLoanLikeFromSpecInputs(specInputs, options)
}

function mapCommercialLoanSpecInputsToLegacyLoanBundleInput(specInputs, extras = {}) {
  const product =
    findCommercialLoanProduct(specInputs.productCode) ||
    findCommercialLoanProduct(extras.productCode)

  if (!product) {
    throw new Error('Unknown commercial loan product.')
  }

  const legacyInput = mapFixedRateLoanLikeSpecInputsToLegacyCalculationInput(specInputs)
  const startDate = String(specInputs.startDate || '').trim()

  return {
    ...extras,
    productId: product.productId,
    productSpecVersion: product.specVersion,
    label: String(extras.label || '').trim() || product.displayName,
    principal: legacyInput.principal,
    annualRate: legacyInput.annualRate,
    termValue: legacyInput.termMonths,
    termUnit: 'months',
    startDate,
    gracePeriodMonths: legacyInput.gracePeriodMonths,
    capitalizeInterestAtGraceEnd: false,
    loanPurpose: specInputs.loanPurpose,
    commercialProductCode: product.productCode
  }
}

export {
  calculateCommercialLoanFromSpecInputs,
  mapCommercialLoanSpecInputsToLegacyLoanBundleInput
}
