/**
 * Commercial home-savings composer catalog (§5e/§5f):
 * - Premium Plus 10x30 — fully-spec-backed (`home-savings-product-spec.js`;
 *   `tests/home-savings-product-spec-parity.test.ts`)
 * - Withdrawn Premium / Premium Plus 8x30 — fully-spec-backed
 * - Withdrawn Premium / Premium Plus 4x10 — schedule-usable (pinned EBKM residual)
 * Withdrawn embeds: `home-savings-withdrawn-product-specs.js`
 * (`tests/home-savings-withdrawn-product-spec-parity.test.ts`).
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

/** Europe/Budapest calendar YYYY-MM-DD (avoids UTC off-by-one near midnight). */
function todayIsoInBudapest(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Budapest',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date)
}

/**
 * Composer availability line under the product picker.
 * Withdrawn offerings: "Unavailable since {to}". Still marketed: empty string.
 */
function formatHomeSavingsAvailabilityHint(saleWindow) {
  if (saleWindow?.to != null && saleWindow.to !== '') {
    return `Unavailable since ${saleWindow.to}`
  }
  return ''
}

/**
 * Opening-fee mode info-chip body. Promo deposit bands come from the product
 * catalog (`openingFeeModeDepositBands`); loyalty lives here, not under the picker.
 */
function formatOpeningFeeModeHelp(product) {
  const bands = product?.openingFeeModeDepositBands || {}
  const formatBound = (value) => Number(value).toLocaleString('hu-HU')
  const lines = [
    'Standard 1% of contractual amount is always available.',
    'Promo modes require a 48-month loyalty commitment (Hűség).'
  ]
  const half = bands['promo-half-percent']
  if (half) {
    lines.push(
      `Promo 0.5% applies when monthly deposit is ${formatBound(half.min)}–${formatBound(half.max)} Ft.`
    )
  }
  for (const [mode, band] of Object.entries(bands)) {
    const fixedMatch = /^promo-fixed-(\d+)$/.exec(mode)
    if (!fixedMatch || !band) {
      continue
    }
    const amount = Number(fixedMatch[1]).toLocaleString('hu-HU')
    lines.push(
      `Promo fixed ${amount} Ft applies when monthly deposit is ${formatBound(band.min)}–${formatBound(band.max)} Ft.`
    )
  }
  if (!half && Object.keys(bands).length === 0) {
    lines.push('This offering has no promo opening-fee table (standard 1% only).')
  }
  return lines.join(' ')
}

/**
 * UI/composer sale-window check. Soft when `saleWindow` is absent (legacy
 * bundles). When a window is present, requires a valid `from` and enforces the
 * same inclusive bounds as engine `assertStartDateInSaleWindow`.
 */
/**
 * Sale-window bounds only. ÁSZF first deposit is exempt from tárgyhó-12 (due by
 * day 12 of the month after offer signing), so startDate may be any calendar
 * day in the window. Subsequent credit-day clamping lives in the engine.
 */
function assertComposerStartDateInSaleWindow(startDate, saleWindow) {
  if (!saleWindow) {
    return
  }
  if (!saleWindow.from || !/^\d{4}-\d{2}-\d{2}$/.test(saleWindow.from)) {
    throw new Error('saleWindow.from must be an ISO calendar date (YYYY-MM-DD).')
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    throw new Error('Savings start date is required (YYYY-MM-DD).')
  }
  if (startDate < saleWindow.from) {
    throw new Error(
      `Savings start date ${startDate} is before this módozat's sale window start ${saleWindow.from}.`
    )
  }
  if (saleWindow.to != null && saleWindow.to !== '') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(saleWindow.to)) {
      throw new Error('saleWindow.to must be an ISO calendar date (YYYY-MM-DD) when set.')
    }
    if (startDate > saleWindow.to) {
      throw new Error(
        `Savings start date ${startDate} is after this módozat's sale window end ${saleWindow.to}.`
      )
    }
  }
}

function defaultStartDateForSaleWindow(saleWindow) {
  if (!saleWindow || !saleWindow.from) {
    return ''
  }
  if (saleWindow.to) {
    return saleWindow.to
  }
  const iso = todayIsoInBudapest()
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
  todayIsoInBudapest,
  formatHomeSavingsAvailabilityHint,
  formatOpeningFeeModeHelp,
  assertComposerStartDateInSaleWindow,
  defaultStartDateForSaleWindow
}
