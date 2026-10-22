import {
  mapFixedRateLoanLikeSpecInputsToLegacyCalculationInput,
  calculateFixedRateLoanLikeFromSpecInputs
} from './loan-legacy-bridges.js'
import { findCommercialLoanProduct } from './commercial-loan-product-metadata.js'

function withProductDayCount(specInputs, product) {
  return {
    ...specInputs,
    interestDayCountConvention:
      specInputs.interestDayCountConvention ??
      product.interestDayCountConvention ??
      'act/360',
    paymentRounding: specInputs.paymentRounding ?? product.paymentRounding ?? 'forint'
  }
}

function calculateCommercialLoanFromSpecInputs(specInputs, options) {
  const product =
    findCommercialLoanProduct(specInputs.productCode) ||
    findCommercialLoanProduct(options?.productCode)
  if (!product) {
    throw new Error('Unknown commercial loan product.')
  }
  return calculateFixedRateLoanLikeFromSpecInputs(withProductDayCount(specInputs, product), options)
}

function mapCommercialLoanSpecInputsToLegacyLoanBundleInput(specInputs, extras = {}) {
  const product =
    findCommercialLoanProduct(specInputs.productCode) ||
    findCommercialLoanProduct(extras.productCode)

  if (!product) {
    throw new Error('Unknown commercial loan product.')
  }

  const legacyInput = mapFixedRateLoanLikeSpecInputsToLegacyCalculationInput(
    withProductDayCount(specInputs, product)
  )
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
    interestDayCountConvention: legacyInput.interestDayCountConvention,
    paymentRounding: legacyInput.paymentRounding,
    loanPurpose: specInputs.loanPurpose,
    commercialProductCode: product.productCode
  }
}

export {
  calculateCommercialLoanFromSpecInputs,
  mapCommercialLoanSpecInputsToLegacyLoanBundleInput
}
