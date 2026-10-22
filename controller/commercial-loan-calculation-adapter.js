import {
  mapFixedRateLoanLikeSpecInputsToLegacyCalculationInput,
  calculateFixedRateLoanLikeFromSpecInputs
} from './loan-legacy-bridges.js'
import { findCommercialLoanProduct } from './commercial-loan-product-metadata.js'
import { getCommercialLoanCommercialBlocks } from './commercial-loan-commercial-blocks.js'
import {
  applyFeesAndDiscounts,
  DEFAULT_REPRESENTATIVE_EXCLUDED_FEE_NAMES
} from './loan-fees.js'
import {
  calculateThmFromMonthlyRepayments,
  expandScheduleToMonthlyPayments
} from './thm.js'

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

function resolveExcludedFeeNames(specInputs, blocks) {
  if (Array.isArray(specInputs.excludeFeeNames)) {
    return specInputs.excludeFeeNames
  }

  const includedOptional = new Set(specInputs.includeOptionalFeeNames ?? [])
  return DEFAULT_REPRESENTATIVE_EXCLUDED_FEE_NAMES.filter((name) => {
    const fee = (blocks.fees || []).find((entry) => entry.name === name)
    if (!fee?.optional) {
      return true
    }
    return !includedOptional.has(name)
  })
}

/**
 * Composer supplies the customer annual % (post-subsidy). Only selectable rate
 * discounts (bp) are applied here. Full `resolveMortgageCustomerRate` lives in
 * `src/finance_engine/instruments/loan_subsidy.ts` for engine/YAML verification —
 * intentionally not dual-surfaced while subsidy windows stay informational (ADR 0023).
 */
function resolveCustomerAnnualRatePct(specInputs, feePackage) {
  const base = Number(specInputs.annualInterestRatePct)
  const discountBp = feePackage.totalRateDiscountBp || 0
  return Math.max(0, base - discountBp / 100)
}

/**
 * Schedule + fee package + single THM (ADR 0022 percentRounded) for the commercial composer.
 */
function calculateCommercialLoanPackage(specInputs, options) {
  const product =
    findCommercialLoanProduct(specInputs.productCode) ||
    findCommercialLoanProduct(options?.productCode)
  if (!product) {
    throw new Error('Unknown commercial loan product.')
  }

  const blocks = getCommercialLoanCommercialBlocks(product.productCode)
  const activeDiscountNames =
    specInputs.activeDiscountNames ?? blocks.defaultActiveDiscountNames ?? []
  const excludeFeeNames = resolveExcludedFeeNames(specInputs, blocks)

  const feePackage = applyFeesAndDiscounts(blocks.fees, blocks.discounts, {
    principal: Number(specInputs.principal),
    activeDiscountNames,
    excludeFeeNames
  })

  const annualInterestRatePct = resolveCustomerAnnualRatePct(specInputs, feePackage)
  const scheduleInputs = withProductDayCount(
    {
      ...specInputs,
      annualInterestRatePct
    },
    product
  )

  const createLoanRepaymentPreview = options?.createLoanRepaymentPreview
  if (typeof createLoanRepaymentPreview !== 'function') {
    throw new Error('createLoanRepaymentPreview function is required.')
  }

  const legacyInput = mapFixedRateLoanLikeSpecInputsToLegacyCalculationInput(scheduleInputs)
  const preview = createLoanRepaymentPreview(legacyInput)
  const monthlyPayments = expandScheduleToMonthlyPayments({
    gracePeriodMonths: preview.gracePeriodMonths,
    capitalizeInterestAtGraceEnd: Boolean(legacyInput.capitalizeInterestAtGraceEnd),
    graceInterestOnlyPayment: preview.graceInterestOnlyPayment,
    monthlyInstallment: preview.monthlyInstallment,
    amortizationMonths: preview.amortizationMonths
  })

  const thm = calculateThmFromMonthlyRepayments({
    principal: Number(specInputs.principal),
    upfrontFees: feePackage.totalCreditCostFees,
    monthlyPayments
  })

  return {
    productCode: product.productCode,
    monthlyPayment: preview.monthlyInstallment,
    paymentCount: preview.paymentCount,
    totalInterest: preview.totalInterest,
    totalRepayment: preview.totalRepayment,
    totalCreditCostFees: feePackage.totalCreditCostFees,
    totalPaid: preview.totalRepayment + feePackage.totalCreditCostFees,
    thmPct: thm.percentRounded,
    annualInterestRatePct,
    rateDiscountBp: feePackage.totalRateDiscountBp,
    feePackage,
    activeDiscountNames: [...activeDiscountNames],
    excludeFeeNames: [...excludeFeeNames]
  }
}

function calculateCommercialLoanFromSpecInputs(specInputs, options) {
  const packaged = calculateCommercialLoanPackage(specInputs, options)
  return {
    monthlyPayment: packaged.monthlyPayment,
    paymentCount: packaged.paymentCount,
    totalInterest: packaged.totalInterest,
    totalPaid: packaged.totalRepayment,
    totalCreditCostFees: packaged.totalCreditCostFees,
    thmPct: packaged.thmPct,
    annualInterestRatePct: packaged.annualInterestRatePct
  }
}

function mapCommercialLoanSpecInputsToLegacyLoanBundleInput(specInputs, extras = {}) {
  const product =
    findCommercialLoanProduct(specInputs.productCode) ||
    findCommercialLoanProduct(extras.productCode)

  if (!product) {
    throw new Error('Unknown commercial loan product.')
  }

  const blocks = getCommercialLoanCommercialBlocks(product.productCode)
  const activeDiscountNames =
    specInputs.activeDiscountNames ?? blocks.defaultActiveDiscountNames ?? []
  const excludeFeeNames = resolveExcludedFeeNames(specInputs, blocks)
  const feePackage = applyFeesAndDiscounts(blocks.fees, blocks.discounts, {
    principal: Number(specInputs.principal),
    activeDiscountNames,
    excludeFeeNames
  })
  const annualInterestRatePct = resolveCustomerAnnualRatePct(specInputs, feePackage)

  const legacyInput = mapFixedRateLoanLikeSpecInputsToLegacyCalculationInput(
    withProductDayCount(
      {
        ...specInputs,
        annualInterestRatePct
      },
      product
    )
  )
  const startDate = String(specInputs.startDate || '').trim()

  return {
    ...extras,
    productId: product.productId,
    productSpecVersion: product.specVersion,
    label: String(extras.label || '').trim() || product.displayName,
    principal: legacyInput.principal,
    annualRate: legacyInput.annualRate,
    /** Pre-discount customer rate (%) as entered in the composer. */
    baseAnnualInterestRatePct: Number(specInputs.annualInterestRatePct),
    termValue: legacyInput.termMonths,
    termUnit: 'months',
    startDate,
    gracePeriodMonths: legacyInput.gracePeriodMonths,
    capitalizeInterestAtGraceEnd: false,
    interestDayCountConvention: legacyInput.interestDayCountConvention,
    paymentRounding: legacyInput.paymentRounding,
    loanPurpose: specInputs.loanPurpose,
    commercialProductCode: product.productCode,
    activeDiscountNames: [...activeDiscountNames],
    includeOptionalFeeNames: [...(specInputs.includeOptionalFeeNames ?? [])]
  }
}

export {
  calculateCommercialLoanPackage,
  calculateCommercialLoanFromSpecInputs,
  mapCommercialLoanSpecInputsToLegacyLoanBundleInput
}
