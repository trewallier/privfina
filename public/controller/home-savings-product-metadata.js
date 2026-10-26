/**
 * Commercial home-savings composer catalog: current Premium Plus 10x30 (embedded
 * fully-spec-backed) plus withdrawn Premium / Premium Plus módozatok (§5f).
 * Keep YAML ↔ embedded parity via `tests/home-savings-product-spec-parity.test.ts`
 * for 10x30; withdrawn specs mirrored in `home-savings-withdrawn-product-specs.js`.
 */
import { HOME_SAVINGS_PREMIUM_PLUSZ_10X30_PRODUCT_SPEC } from './home-savings-product-spec.js'
import { HOME_SAVINGS_WITHDRAWN_PRODUCT_SPECS } from './home-savings-withdrawn-product-specs.js'

const HOME_SAVINGS_PREMIUM_TIERS = {
  ...HOME_SAVINGS_PREMIUM_PLUSZ_10X30_PRODUCT_SPEC.premiumTiers
}

function catalogEntryFromEmbeddedSpec(spec) {
  const accountFee = (spec.fees || []).find((fee) => fee.type === 'account-management')
  const monthlyDepositInput = (spec.inputs || []).find((field) => field.name === 'monthlyDeposit')
  const termInput = (spec.inputs || []).find((field) => field.name === 'termMonths')
  const openingFeeInput = (spec.inputs || []).find((field) => field.name === 'openingFeeMode')
  return {
    productCode: spec.productCode,
    productId: spec.id,
    specVersion: spec.specVersion,
    displayName: spec.displayName,
    migrationStatus: spec.migrationStatus,
    depositInterestAnnualRatePct: spec.engine.depositInterestAnnualRatePct,
    savingsRatePermille: spec.engine.savingsRatePermille,
    minContractAmount: spec.engine.minContractAmount,
    maxContractAmount: spec.engine.maxContractAmount,
    evaluationMinMonths: spec.engine.evaluationMinMonths,
    allocationMinMonths: spec.engine.allocationMinMonths,
    minMonthlyDeposit: monthlyDepositInput?.constraints?.minimum ?? 10_000,
    maxMonthlyDeposit: monthlyDepositInput?.constraints?.maximum ?? 100_000,
    minTermMonths: termInput?.constraints?.minimum ?? 1,
    maxTermMonths: termInput?.constraints?.maximum ?? 120,
    accountFeeMonthly: accountFee?.value ?? 500,
    defaultMonthlyDeposit: spec.defaults.monthlyDeposit,
    defaultTermMonths: spec.defaults.termMonths,
    defaultHousingPurpose: spec.defaults.housingPurpose,
    defaultOpeningFeeMode: spec.defaults.openingFeeMode,
    openingFeeModes: [...(openingFeeInput?.constraints?.enum || ['standard-1pct'])],
    openingFeeModeDepositBands: { ...(spec.openingFeeModeDepositBands || {}) },
    premiumTiers: { ...spec.premiumTiers },
    saleWindow: spec.saleWindow
      ? { from: spec.saleWindow.from, to: spec.saleWindow.to ?? null }
      : null,
    eligibilityHints: [...(spec.eligibilityHints || [])],
    discountHints: [...(spec.discountHints || [])],
    premiumHints: spec.premiumHints,
    commerciallyBlockedReason: null,
    spec
  }
}

const HOME_SAVINGS_PRODUCTS = [
  catalogEntryFromEmbeddedSpec(HOME_SAVINGS_PREMIUM_PLUSZ_10X30_PRODUCT_SPEC),
  ...HOME_SAVINGS_WITHDRAWN_PRODUCT_SPECS.map(catalogEntryFromEmbeddedSpec)
]

function buildHomeSavingsProductOptions() {
  return HOME_SAVINGS_PRODUCTS.map((product) => ({
    value: product.productCode,
    label: product.displayName,
    productId: product.productId,
    migrationStatus: product.migrationStatus,
    saleWindow: product.saleWindow
  }))
}

function findHomeSavingsProduct(productCode) {
  return HOME_SAVINGS_PRODUCTS.find((entry) => entry.productCode === productCode) || null
}

function findHomeSavingsProductById(productId) {
  return HOME_SAVINGS_PRODUCTS.find((entry) => entry.productId === productId) || null
}

function resolveHomeSavingsReadinessHint(migrationStatus) {
  switch (migrationStatus) {
    case 'fully-spec-backed':
      return 'Readiness: fully-spec-backed — YAML, composer hosts, adapters, and examples are aligned.'
    case 'commercially-usable':
      return 'Readiness: commercially-usable — commercial composer UX and EBKM verification are wired for this offering.'
    case 'schedule-usable':
      return 'Readiness: schedule-usable — customer deposit/fee/Premium cash flows can be composed and persisted.'
    case 'calc-aligned':
      return 'Readiness: calc-aligned — engine aligned; commercial composer may still be incomplete.'
    case 'inputs-driven':
      return 'Readiness: inputs-driven — form inputs follow the spec; composer calculations may lag.'
    case 'spec-only':
      return 'Readiness: spec-only — product YAML exists; composer wiring is not ready yet.'
    default:
      return migrationStatus ? `Readiness: ${migrationStatus}` : ''
  }
}

function openingFeeModeLabel(mode) {
  if (mode === 'standard-1pct') {
    return 'Standard 1% of contract amount'
  }
  if (mode === 'promo-half-percent') {
    return 'Promo 0.5% of contract amount'
  }
  const fixedMatch = /^promo-fixed-(\d+)$/.exec(mode)
  if (fixedMatch) {
    const amount = Number(fixedMatch[1])
    return `Promo fixed ${amount.toLocaleString('hu-HU')} Ft`
  }
  return mode
}

function assertStartDateInSaleWindow(startDate, saleWindow) {
  if (!saleWindow || !saleWindow.from) {
    return
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    throw new Error('Savings start date is required (YYYY-MM-DD).')
  }
  if (startDate < saleWindow.from) {
    throw new Error(
      `Savings start date ${startDate} is before this módozat's sale window start ${saleWindow.from}.`
    )
  }
  if (saleWindow.to && startDate > saleWindow.to) {
    throw new Error(
      `Savings start date ${startDate} is after this módozat's sale window end ${saleWindow.to}.`
    )
  }
}

function defaultStartDateForSaleWindow(saleWindow) {
  if (!saleWindow || !saleWindow.from) {
    return ''
  }
  if (saleWindow.to) {
    return saleWindow.to
  }
  const today = new Date()
  const iso = today.toISOString().slice(0, 10)
  return iso < saleWindow.from ? saleWindow.from : iso
}

export {
  HOME_SAVINGS_PREMIUM_TIERS,
  HOME_SAVINGS_PRODUCTS,
  HOME_SAVINGS_PREMIUM_PLUSZ_10X30_PRODUCT_SPEC,
  buildHomeSavingsProductOptions,
  findHomeSavingsProduct,
  findHomeSavingsProductById,
  resolveHomeSavingsReadinessHint,
  openingFeeModeLabel,
  assertStartDateInSaleWindow,
  defaultStartDateForSaleWindow
}
