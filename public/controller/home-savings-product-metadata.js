/**
 * Commercial home-savings composer catalog derived from the embedded product
 * spec (`home-savings-product-spec.js`). Keep YAML ↔ embedded parity via
 * `tests/home-savings-product-spec-parity.test.ts` (fully-spec-backed).
 */
import { HOME_SAVINGS_PREMIUM_PLUSZ_10X30_PRODUCT_SPEC } from './home-savings-product-spec.js'

const HOME_SAVINGS_PREMIUM_TIERS = {
  ...HOME_SAVINGS_PREMIUM_PLUSZ_10X30_PRODUCT_SPEC.premiumTiers
}

function catalogEntryFromEmbeddedSpec(spec) {
  const accountFee = (spec.fees || []).find((fee) => fee.type === 'account-management')
  const monthlyDepositInput = (spec.inputs || []).find((field) => field.name === 'monthlyDeposit')
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
    minMonthlyDeposit: monthlyDepositInput?.constraints?.minimum ?? 10_000,
    maxMonthlyDeposit: monthlyDepositInput?.constraints?.maximum ?? 100_000,
    accountFeeMonthly: accountFee?.value ?? 500,
    defaultMonthlyDeposit: spec.defaults.monthlyDeposit,
    defaultTermMonths: spec.defaults.termMonths,
    defaultHousingPurpose: spec.defaults.housingPurpose,
    defaultOpeningFeeMode: spec.defaults.openingFeeMode,
    openingFeeModes: monthlyDepositInput
      ? [...(spec.inputs.find((f) => f.name === 'openingFeeMode')?.constraints?.enum || [])]
      : ['standard-1pct', 'promo-half-percent', 'promo-fixed-65000'],
    openingFeeModeDepositBands: { ...spec.openingFeeModeDepositBands },
    premiumTiers: { ...spec.premiumTiers },
    eligibilityHints: [...(spec.eligibilityHints || [])],
    discountHints: [...(spec.discountHints || [])],
    premiumHints: spec.premiumHints,
    commerciallyBlockedReason: null,
    spec
  }
}

const HOME_SAVINGS_PRODUCTS = [
  catalogEntryFromEmbeddedSpec(HOME_SAVINGS_PREMIUM_PLUSZ_10X30_PRODUCT_SPEC)
]

function buildHomeSavingsProductOptions() {
  return HOME_SAVINGS_PRODUCTS.map((product) => ({
    value: product.productCode,
    label: product.displayName,
    productId: product.productId,
    migrationStatus: product.migrationStatus
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
  switch (mode) {
    case 'standard-1pct':
      return 'Standard 1% of contract amount'
    case 'promo-half-percent':
      return 'Promo 0.5% of contract amount'
    case 'promo-fixed-65000':
      return 'Promo fixed 65 000 Ft'
    default:
      return mode
  }
}

export {
  HOME_SAVINGS_PREMIUM_TIERS,
  HOME_SAVINGS_PRODUCTS,
  HOME_SAVINGS_PREMIUM_PLUSZ_10X30_PRODUCT_SPEC,
  buildHomeSavingsProductOptions,
  findHomeSavingsProduct,
  findHomeSavingsProductById,
  resolveHomeSavingsReadinessHint,
  openingFeeModeLabel
}
