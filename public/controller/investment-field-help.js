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
  maturityDate: 'Maturity date in ISO format.',
  dayCountConvention: 'Day-count used for annualized yield (default ACT/360 denominator 360).',
  remainingDays: 'Derived days from settlement to maturity used for annualized yield.',
  purchaseAmount: 'Amount paid for the security at purchase.',
  redemptionValue: 'Face value repaid at maturity.',
  grossGain: 'Difference between redemption value and purchase amount.',
  simpleReturnPct: 'Gross gain relative to purchase amount.',
  annualizedYieldPct:
    'Annualized yield using remaining days from settlement to maturity and the official discount-bill convention.'
}

const BMAP_FIELD_HELP = {
  principal: 'Invested nominal amount.',
  annualCouponRatePct:
    'Effective annual coupon rate for the applicable interest period (combined period kamat as published).',
  purchaseDate:
    'Purchase or valuation date in ISO format, used for accrued-interest-related calculations.',
  issueDate: 'Issue date of the BMAP series in ISO format.',
  maturityDate: 'Maturity date of the BMAP series in ISO format.',
  startDate: 'Investment start date in ISO format; defaults to issue date when omitted.',
  firstCouponDate:
    'First coupon payment date in ISO format when a full couponSchedule is not supplied.',
  dayCountConvention: 'Interest day-count convention for accrued interest (default ACT/360).',
  couponSchedule:
    'Optional list of coupon periods `{ from, to?, rate? }`; future rates may be omitted.',
  accruedInterestAmount:
    'Interest accrued from issue or previous coupon date to purchase or valuation date.',
  purchaseAmount: 'Purchase amount based on principal plus accrued interest, where applicable.'
}

const PMAP_FIELD_HELP = {
  principal: 'Invested nominal amount.',
  annualCouponRatePct:
    'Effective annual coupon rate for the applicable interest period (combined period kamat as published).',
  purchaseDate:
    'Purchase or valuation date in ISO format, used for accrued-interest-related calculations.',
  issueDate: 'Issue date of the PMAP series in ISO format.',
  maturityDate: 'Maturity date of the PMAP series in ISO format.',
  startDate: 'Investment start date in ISO format; defaults to issue date when omitted.',
  firstCouponDate:
    'First coupon payment date in ISO format when a full couponSchedule is not supplied.',
  dayCountConvention: 'Interest day-count convention for accrued interest (default ACT/360).',
  couponSchedule:
    'Optional list of coupon periods `{ from, to?, rate? }`; future rates may be omitted.',
  accruedInterestAmount:
    'Interest accrued from issue or previous coupon date to purchase/valuation date.',
  purchaseAmount: 'Purchase amount based on principal plus accrued interest, where applicable.'
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
