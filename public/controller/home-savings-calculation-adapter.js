/**
 * Browser commercial home-savings mapper (loan-bridge style).
 *
 * Contract-amount ‰ helpers and schedule math come from the finance-engine
 * surface (ADR 0017 / 0032). This module only maps composer/spec inputs onto
 * those primitives + the schedule/bundle generators — no third formula surface.
 * EBKM uses the same deposit/fee/Premium amounts as the chart, with terminal
 * inflow retargeted to the ÁSZF 22. § kiutalás payout date (ADR 0031).
 */
import { findHomeSavingsProduct } from './home-savings-product-metadata.js'
import { assertOpeningFeeModeForDeposit } from './home-savings-form.js'
import {
  resolveMonthlyDepositFromContractAmount,
  resolveContractAmountFromMonthlyDeposit,
  generateHomeSavingsInstrumentCashFlows
} from '../instruments.js'
import { calculateEbkmFromHomeSavingsCashFlows } from './ebkm.js'

/**
 * Resolve contractual amount from explicit input or monthly deposit via ‰.
 * Rejects an explicit contractAmount that does not map back to monthlyDeposit.
 */
function resolveHomeSavingsContractAmount(product, specInputs) {
  if (specInputs.contractAmount !== undefined && specInputs.contractAmount !== null) {
    const explicit = Number(specInputs.contractAmount)
    if (!Number.isFinite(explicit) || explicit <= 0) {
      throw new Error('contractAmount must be a positive finite number when provided.')
    }

    const impliedDeposit = resolveMonthlyDepositFromContractAmount({
      contractAmount: explicit,
      savingsRatePermille: product.savingsRatePermille
    })
    if (impliedDeposit !== Number(specInputs.monthlyDeposit)) {
      throw new Error(
        `Contract amount ${explicit} maps to monthly deposit ${impliedDeposit} Ft, not ${specInputs.monthlyDeposit} Ft.`
      )
    }
    return explicit
  }

  return resolveContractAmountFromMonthlyDeposit({
    monthlyDeposit: Number(specInputs.monthlyDeposit),
    savingsRatePermille: product.savingsRatePermille,
    minContractAmount: product.minContractAmount,
    maxContractAmount: product.maxContractAmount
  })
}

function resolveHomeSavingsOpeningFee(product, specInputs) {
  const mode = specInputs.openingFeeMode
  assertOpeningFeeModeForDeposit(product, mode, Number(specInputs.monthlyDeposit))

  if (mode === 'promo-fixed-65000') {
    return 65_000
  }

  const contractAmount = resolveHomeSavingsContractAmount(product, specInputs)
  if (mode === 'standard-1pct') {
    return (contractAmount * 1) / 100
  }
  if (mode === 'promo-half-percent') {
    return (contractAmount * 0.5) / 100
  }

  throw new Error(`Unsupported openingFeeMode: ${String(mode)}`)
}

/**
 * Map commercial composer inputs to the browser home-savings generator input.
 * Mirrors `mapHomeSavingsSpecInputsToInstrumentInput` in the TypeScript engine.
 */
function mapHomeSavingsSpecInputsToBundleInput(specInputs, options = {}) {
  const product =
    findHomeSavingsProduct(specInputs.productCode) ||
    findHomeSavingsProduct(options.productCode)
  if (!product) {
    throw new Error('Unknown home-savings product.')
  }

  const accountOpeningFee = resolveHomeSavingsOpeningFee(product, specInputs)
  const contractAmount = resolveHomeSavingsContractAmount(product, specInputs)

  return {
    id: options.id,
    label: options.label || product.displayName,
    productId: product.productId,
    productCode: product.productCode,
    productSpecVersion: product.specVersion,
    monthlyDeposit: Number(specInputs.monthlyDeposit),
    termMonths: Number(specInputs.termMonths),
    startDate: String(specInputs.startDate),
    depositDayOfMonth: specInputs.depositDayOfMonth,
    accountFeeMonthly: product.accountFeeMonthly,
    accountOpeningFee,
    housingPurpose: Boolean(specInputs.housingPurpose),
    depositInterestAnnualRatePct: product.depositInterestAnnualRatePct,
    premiumTiers: product.premiumTiers,
    earlyExitMonth: specInputs.earlyExitMonth,
    category: options.category || 'home-savings',
    // Free-text notes only — deposit cash-flow description is fixed in the generator.
    description: options.description,
    createdAt: options.createdAt,
    openingFeeMode: specInputs.openingFeeMode,
    contractAmount
  }
}

function scheduleOutputsFromBundleInput(bundleInput, schedule) {
  const cashFlows = generateHomeSavingsInstrumentCashFlows(bundleInput)
  const ebkm = calculateEbkmFromHomeSavingsCashFlows(
    cashFlows.map((flow) => ({
      date: flow.date,
      amount: flow.amount,
      direction: flow.direction === 'inflow' ? 'inflow' : 'outflow',
      description: flow.description
    }))
  )

  return {
    productId: bundleInput.productId,
    productCode: bundleInput.productCode,
    productSpecVersion: bundleInput.productSpecVersion,
    accountOpeningFee: schedule.accountOpeningFee,
    accountFeeMonthly: schedule.accountFeeMonthly,
    totalDeposits: schedule.totalDeposits,
    totalAccountFees: schedule.totalAccountFees,
    premiumRatePct: schedule.premiumRatePct,
    premiumBase: schedule.premiumBase,
    premiumAmount: schedule.premiumAmount,
    terminalPayout: schedule.terminalPayout,
    depositInterest: schedule.depositInterest,
    ebkmPct: ebkm.percentRounded,
    contractAmount: bundleInput.contractAmount,
    schedule
  }
}

/**
 * Live preview: schedule scalars plus ADR 0031 EBKM (Annex 3 on customer
 * amounts; ÁSZF kiutalás payout dating for the terminal leg).
 */
function calculateHomeSavingsScheduleFromSpecInputs(specInputs, options = {}) {
  const resolveHomeSavingsSchedule = options.resolveHomeSavingsSchedule
  if (typeof resolveHomeSavingsSchedule !== 'function') {
    throw new Error('resolveHomeSavingsSchedule function is required.')
  }

  const bundleInput = mapHomeSavingsSpecInputsToBundleInput(specInputs, options)
  const schedule = resolveHomeSavingsSchedule(bundleInput)
  return scheduleOutputsFromBundleInput(bundleInput, schedule)
}

function calculateHomeSavingsFromSpecInputs(specInputs, options = {}) {
  const createHomeSavingsInstrumentBundle = options.createHomeSavingsInstrumentBundle
  if (typeof createHomeSavingsInstrumentBundle !== 'function') {
    throw new Error('createHomeSavingsInstrumentBundle function is required.')
  }

  const bundleInput = mapHomeSavingsSpecInputsToBundleInput(specInputs, options)
  const bundle = createHomeSavingsInstrumentBundle(bundleInput)
  const preview = bundle.preview || {}

  return {
    ...scheduleOutputsFromBundleInput(bundleInput, preview),
    bundle
  }
}

export {
  resolveHomeSavingsContractAmount,
  resolveHomeSavingsOpeningFee,
  mapHomeSavingsSpecInputsToBundleInput,
  calculateHomeSavingsScheduleFromSpecInputs,
  calculateHomeSavingsFromSpecInputs
}
