/**
 * Browser commercial home-savings mapper.
 *
 * TODO(§5e commercially-usable / ADR 0017): this re-implements contract-amount /
 * opening-fee rules already owned by `src/finance_engine/product_specs/home_savings.ts`.
 * Prefer collapsing onto shared browser primitives (or a single imported mapper) and
 * keep engine↔browser locked-example parity tests green before commercially-usable.
 */
import { findHomeSavingsProduct } from './home-savings-product-metadata.js'

function ceilToTenForint(amount) {
  return Math.ceil(amount / 10) * 10
}

function resolveMonthlyDepositFromContractAmount({ contractAmount, savingsRatePermille }) {
  return ceilToTenForint((contractAmount * savingsRatePermille) / 1000)
}

function resolveContractAmountFromMonthlyDeposit({
  monthlyDeposit,
  savingsRatePermille,
  minContractAmount,
  maxContractAmount
}) {
  const approx = (monthlyDeposit * 1000) / savingsRatePermille
  const start = Math.round(approx / 10_000) * 10_000
  for (let delta = 0; delta <= 50; delta += 1) {
    for (const candidate of delta === 0
      ? [start]
      : [start - delta * 10_000, start + delta * 10_000]) {
      if (candidate < minContractAmount || candidate > maxContractAmount) continue
      if (
        resolveMonthlyDepositFromContractAmount({
          contractAmount: candidate,
          savingsRatePermille
        }) === monthlyDeposit
      ) {
        return candidate
      }
    }
  }

  throw new Error(
    `No contract amount in [${minContractAmount}, ${maxContractAmount}] maps to monthlyDeposit ${monthlyDeposit}.`
  )
}

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
    contractAmount: bundleInput.contractAmount,
    schedule
  }
}

/** Live preview: schedule scalars only (no recurring flow expansion). */
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
  resolveMonthlyDepositFromContractAmount,
  resolveContractAmountFromMonthlyDeposit,
  resolveHomeSavingsContractAmount,
  resolveHomeSavingsOpeningFee,
  mapHomeSavingsSpecInputsToBundleInput,
  calculateHomeSavingsScheduleFromSpecInputs,
  calculateHomeSavingsFromSpecInputs
}
