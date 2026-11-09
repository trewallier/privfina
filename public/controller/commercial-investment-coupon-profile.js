/**
 * Shared coupon-bearing commercial investment profile (ADR 0040).
 * PMÁP / BMÁP / FixMÁP / MÁP Plusz (and remaining §6j ÁKK coupon families)
 * derive DOM selectors, read/populate maps from these helpers — register on
 * this profile rather than growing host/`previews.js` productCode forests.
 */

function couponBearingDomPrefix(productCode) {
  return String(productCode || '').trim()
}

function buildCouponBearingMarketFieldSelectors(prefix) {
  return {
    annualCouponRatePct: `#${prefix}-annual-coupon-rate-pct`,
    maturityDate: `#${prefix}-maturity-date`,
    issueDate: `#${prefix}-issue-date`,
    firstCouponDate: `#${prefix}-first-coupon-date`,
    couponSchedule: `#${prefix}-coupon-schedule`,
    couponFrequencyMonths: `#${prefix}-coupon-frequency-months`,
    dayCountConvention: `#${prefix}-day-count-convention`
  }
}

function buildCouponBearingInputIds(prefix) {
  return [
    `${prefix}-principal`,
    `${prefix}-annual-coupon-rate-pct`,
    `${prefix}-maturity-date`,
    `${prefix}-purchase-date`,
    `${prefix}-issue-date`,
    `${prefix}-first-coupon-date`
  ]
}

function buildCouponBearingFieldLabelClass(prefix) {
  return `${prefix}-field-label`
}

function buildCouponBearingPurchaseOrSettlementSelector(prefix) {
  return `#${prefix}-purchase-date`
}

function readFormValue(form, selector) {
  return form?.querySelector(selector)?.value || ''
}

function readCouponBearingMarketFields(form, prefix) {
  return {
    principal: readFormValue(form, `#${prefix}-principal`),
    annualCouponRatePct: readFormValue(form, `#${prefix}-annual-coupon-rate-pct`),
    maturityDate: readFormValue(form, `#${prefix}-maturity-date`),
    purchaseDate: readFormValue(form, `#${prefix}-purchase-date`),
    issueDate: readFormValue(form, `#${prefix}-issue-date`),
    firstCouponDate: readFormValue(form, `#${prefix}-first-coupon-date`)
  }
}

/**
 * Unify coupon-bearing edit populate. BMÁP historically skipped
 * transactionDate / couponPeriod fallbacks — pass
 * `{ allowTransactionDateFallback: false, allowCouponPeriodFallback: false }`.
 * Defaults match PMÁP / FixMÁP (fallbacks on).
 */
function populateCouponBearingEditFields(
  form,
  prefix,
  migrated,
  formatMoneyAmount,
  options = {}
) {
  const allowTransactionDateFallback = options.allowTransactionDateFallback !== false
  const allowCouponPeriodFallback = options.allowCouponPeriodFallback !== false

  const principal = form.querySelector(`#${prefix}-principal`)
  const annualCouponRatePct = form.querySelector(`#${prefix}-annual-coupon-rate-pct`)
  const maturityDate = form.querySelector(`#${prefix}-maturity-date`)
  const purchaseDate = form.querySelector(`#${prefix}-purchase-date`)
  const issueDate = form.querySelector(`#${prefix}-issue-date`)
  const firstCouponDate = form.querySelector(`#${prefix}-first-coupon-date`)
  const couponSchedule = form.querySelector(`#${prefix}-coupon-schedule`)
  const couponFrequencyMonths = form.querySelector(`#${prefix}-coupon-frequency-months`)
  const dayCountConvention = form.querySelector(`#${prefix}-day-count-convention`)

  if (principal) {
    principal.value =
      migrated.principal !== undefined
        ? formatMoneyAmount(migrated.principal, { fractionDigits: 0 })
        : ''
  }
  if (annualCouponRatePct) {
    annualCouponRatePct.value =
      migrated.annualCouponRatePct !== undefined ? String(migrated.annualCouponRatePct) : ''
  }
  if (maturityDate) {
    maturityDate.value = migrated.maturityDate || ''
  }
  if (purchaseDate) {
    purchaseDate.value = allowTransactionDateFallback
      ? migrated.purchaseDate || migrated.transactionDate || ''
      : migrated.purchaseDate || ''
  }
  if (issueDate) {
    issueDate.value = migrated.issueDate || ''
  }
  if (firstCouponDate) {
    firstCouponDate.value = allowCouponPeriodFallback
      ? migrated.firstCouponDate || migrated.couponPeriod || ''
      : migrated.firstCouponDate || ''
  }
  if (couponSchedule) {
    couponSchedule.value = Array.isArray(migrated.couponSchedule)
      ? JSON.stringify(migrated.couponSchedule)
      : ''
  }
  if (couponFrequencyMonths) {
    couponFrequencyMonths.value =
      migrated.couponFrequencyMonths !== undefined && migrated.couponFrequencyMonths !== null
        ? String(migrated.couponFrequencyMonths)
        : ''
  }
  if (dayCountConvention) {
    dayCountConvention.value = migrated.dayCountConvention || ''
  }
}

/** Identical across PMÁP / BMÁP / FixMÁP form modules — shared pure helper. */
function parseCouponScheduleField(raw) {
  const text = String(raw || '').trim()
  if (!text) return undefined
  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : undefined
  } catch {
    return undefined
  }
}

export {
  couponBearingDomPrefix,
  buildCouponBearingMarketFieldSelectors,
  buildCouponBearingInputIds,
  buildCouponBearingFieldLabelClass,
  buildCouponBearingPurchaseOrSettlementSelector,
  readCouponBearingMarketFields,
  populateCouponBearingEditFields,
  parseCouponScheduleField
}
