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
    description: options.description || product.displayName,
    createdAt: options.createdAt,
    // Stamped on config for edit round-trips
    openingFeeMode: specInputs.openingFeeMode,
    contractAmount
  }
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
    productId: bundle.productId,
    productCode: specInputs.productCode,
    productSpecVersion: bundle.productSpecVersion,
    accountOpeningFee: preview.accountOpeningFee,
    accountFeeMonthly: preview.accountFeeMonthly,
    totalDeposits: preview.totalDeposits,
    totalAccountFees: preview.totalAccountFees,
    premiumRatePct: preview.premiumRatePct,
    premiumBase: preview.premiumBase,
    premiumAmount: preview.premiumAmount,
    terminalPayout: preview.terminalPayout,
    depositInterest: preview.depositInterest,
    contractAmount: bundleInput.contractAmount,
    schedule: preview,
    bundle
  }
}

export {
  resolveContractAmountFromMonthlyDeposit,
  resolveHomeSavingsContractAmount,
  resolveHomeSavingsOpeningFee,
  mapHomeSavingsSpecInputsToBundleInput,
  calculateHomeSavingsFromSpecInputs
}
