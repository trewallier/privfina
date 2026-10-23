/**
 * Field help copy for investment products.
 * Descriptions mirrored from docs/product-specs/products/government-securities/<product>/product.yaml
 * (inputs[].description / outputs[].description). Generic shared UI fields are local.
 */

const SHARED_INVESTMENT_UI_HELP = {
  label: 'Friendly name for this instrument row in the configured list.',
  category: 'Optional tag for grouping this instrument in lists and reports.',
  description: 'Optional free-text notes for this investment instrument.',
  subtype: 'Select a generic bond subtype or a catalog government-security product.'
}

const DKJ_FIELD_HELP = {
  faceValue: 'Nominal value repaid at maturity.',
  purchasePricePct: 'Purchase price as percentage of face value.',
  termMonths: 'Product-type maturity bucket for DKJ.',
  settlementDate: 'Settlement date in ISO format.',
  maturityDate: 'Maturity date in ISO format, if known.',
  remainingDays: 'Days remaining from settlement to maturity, used for annualized yield calculation.',
  purchaseAmount: 'Amount paid for the security at purchase.',
  redemptionValue: 'Face value repaid at maturity.',
  grossGain: 'Difference between redemption value and purchase amount.',
  simpleReturnPct: 'Gross gain relative to purchase amount.',
  annualizedYieldPct: 'Annualized yield calculated using remaining days and the official discount-bill convention.'
}

const BMAP_FIELD_HELP = {
  principal: 'Invested nominal amount.',
  dkjBaseYieldPct: 'Base yield derived from 3-month DKJ auction averages.',
  interestPremiumPct: 'Fixed premium added on top of the DKJ-based yield.',
  startDate: 'Investment start date in ISO format.',
  purchaseDate: 'Purchase or valuation date in ISO format, used for accrued-interest-related calculations.',
  issueDate: 'Issue date of the BMAP series in ISO format.',
  firstCouponDate: 'First coupon payment date in ISO format if known.',
  annualCouponRatePct: 'Annual coupon rate for the current period, equal to effective DKJ base plus premium.',
  couponPaymentFrequency: 'Frequency of coupon payments.',
  effectiveDkjBaseYieldPct: 'DKJ coupon base after applying the 0% floor.',
  periodCouponRatePct:
    'Coupon amount or rate applicable to the current coupon period using the 360-day convention.',
  accruedInterestAmount: 'Interest accrued from issue or previous coupon date to purchase or valuation date.',
  purchaseAmount: 'Purchase amount based on principal plus accrued interest, where applicable.',
  redemptionValue: 'Principal repaid at maturity.'
}

const PMAP_FIELD_HELP = {
  principal: 'Invested nominal amount.',
  interestPremiumPct: 'Fixed premium added on top of the inflation base.',
  previousYearAverageInflationPct: 'Official annual average inflation for the previous calendar year.',
  startDate: 'Investment start date in ISO format.',
  purchaseDate: 'Purchase or valuation date in ISO format, used for accrued-interest-related calculations.',
  issueDate: 'Issue date of the PMAP series in ISO format.',
  firstCouponDate: 'First coupon payment date in ISO format if known.',
  annualCouponRatePct: 'Coupon rate for the current annual interest period.',
  couponPaymentFrequency: 'Frequency of coupon payments.',
  effectiveInflationBasePct: 'Inflation base after applying the 0% floor for zero or negative inflation.',
  periodCouponRatePct: 'Coupon rate applicable to the current coupon period or first irregular period.',
  accruedInterestAmount: 'Interest accrued from issue or previous coupon date to purchase/valuation date.',
  purchaseAmount: 'Purchase amount based on principal plus accrued interest, where applicable.',
  redemptionValue: 'Principal repaid at maturity.'
}

function getDkjFieldHelp(fieldName) {
  return DKJ_FIELD_HELP[fieldName] || SHARED_INVESTMENT_UI_HELP[fieldName] || ''
}

function getBmapFieldHelp(fieldName) {
  return BMAP_FIELD_HELP[fieldName] || SHARED_INVESTMENT_UI_HELP[fieldName] || ''
}

function getPmapFieldHelp(fieldName) {
  return PMAP_FIELD_HELP[fieldName] || SHARED_INVESTMENT_UI_HELP[fieldName] || ''
}

export {
  SHARED_INVESTMENT_UI_HELP,
  DKJ_FIELD_HELP,
  BMAP_FIELD_HELP,
  PMAP_FIELD_HELP,
  getDkjFieldHelp,
  getBmapFieldHelp,
  getPmapFieldHelp
}
