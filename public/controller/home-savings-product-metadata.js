/**
 * Migration scaffolding (ADR 0028–0030): hand-authored commercial home-savings
 * composer catalog. Keep displayName / defaults / migrationStatus in sync with
 * product YAML + PRODUCT_CATALOG until fully-spec-backed embedded modules replace this map.
 */

const HOME_SAVINGS_PREMIUM_TIERS = {
  months49to96: 10,
  months97to120: 20,
  maturityFrom120: 30
}

const HOME_SAVINGS_PRODUCTS = [
  {
    productCode: 'premium-plusz-10x30',
    productId: 'home-savings.premium-plusz-10x30.standard',
    specVersion: 'v2alpha1',
    displayName: 'OTP Lakástakarék PRÉMIUM PLUSZ 10x30',
    migrationStatus: 'schedule-usable',
    depositInterestAnnualRatePct: 0.1,
    savingsRatePermille: 3.846,
    minContractAmount: 2_600_000,
    maxContractAmount: 26_000_000,
    minMonthlyDeposit: 10_000,
    maxMonthlyDeposit: 100_000,
    accountFeeMonthly: 500,
    defaultMonthlyDeposit: 50_000,
    defaultTermMonths: 120,
    defaultHousingPurpose: true,
    defaultOpeningFeeMode: 'promo-fixed-65000',
    openingFeeModes: ['standard-1pct', 'promo-half-percent', 'promo-fixed-65000'],
    /** Hirdetmény A deposit bands for promo opening-fee modes (inclusive). */
    openingFeeModeDepositBands: {
      'promo-half-percent': { min: 10_000, max: 49_990 },
      'promo-fixed-65000': { min: 50_000, max: 100_000 }
    },
    premiumTiers: { ...HOME_SAVINGS_PREMIUM_TIERS },
    // Keep in sync with product.yaml — asserted by tests/home-savings-composer-parity.test.ts.
    eligibilityHints: [
      'Natural person or condominium/cooperative saver; Hungarian residential or stay address for natural persons.',
      'Housing-purpose use is required for OTP Lakástakarék Prémium (soft hint in v1).',
      'No state support for contracts from 2018-10-17.'
    ],
    discountHints: [
      'Promo opening fee (0.5% or fixed 65 000 Ft) requires a 48-month loyalty commitment.',
      'Loyalty unlock fee (current cohort): 100% of the waived opening fee through month 48 (scenario mode).'
    ],
    premiumHints:
      'Premium tiers with housing purpose: 10% (months 49–96), 20% (97–120), 30% at maturity from month 120. Premium applies to contractual deposits only.',
    commerciallyBlockedReason:
      'Schedule→EBKM (calendar-day Annex 3 on customer cash flows) still diverges from published Hirdetmény EBKM; commercially-usable requires closing that gap without fitted lag/netting knobs (ADR 0031 quarantine). Maturity/interest uses ÁSZF §10 ACT/360 with OTP-aligned first-of-month lastDeposit+2 packaging (not literal §22 (1)).'
  }
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
      return 'Readiness: inputs-driven — form inputs follow the spec; calculations may lag.'
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
  buildHomeSavingsProductOptions,
  findHomeSavingsProduct,
  findHomeSavingsProductById,
  resolveHomeSavingsReadinessHint,
  openingFeeModeLabel
}
