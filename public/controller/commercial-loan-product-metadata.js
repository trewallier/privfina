/**
 * Schedule-usable catalog for public-offering mortgage-loan products (ADR 0023).
 * Lightweight metadata for the commercial loan composer; full embedded YAML parity
 * lands with commercially-usable promotion.
 */

const PURPOSE_LABELS = {
  'used-home-purchase': 'Used home purchase',
  'new-home-purchase': 'New home purchase',
  construction: 'Construction',
  renovation: 'Renovation',
  modernization: 'Modernization',
  extension: 'Extension',
  refinancing: 'Refinancing'
}

const COMMERCIAL_LOAN_PRODUCTS = [
  {
    productCode: 'otp-1x1',
    productId: 'mortgage-loan.otp-1x1.standard',
    specVersion: 'v2alpha1',
    displayName: 'OTP 1x1 Lakáshitel',
    defaultAnnualInterestRatePct: 7.99,
    defaultTermMonths: 240,
    defaultGracePeriodMonths: 0,
    graceRequired: false,
    loanPurposes: [
      'used-home-purchase',
      'new-home-purchase',
      'construction',
      'renovation',
      'modernization',
      'extension',
      'refinancing'
    ],
    eligibilityHints: [
      'Market forint home loan; conditions follow the OTP Hirdetmény for applications from 2026-04-20.',
      'Optional loyalty and fee-waiver discounts are hints only in schedule-usable mode.'
    ],
    discountHints: [
      'Loyalty service rate discount (up to 1.2%) may apply when income-routing conditions are met.',
      'Disbursement fee waiver may apply under OTP Díjkedvezményes conditions.'
    ],
    postSubsidyInfo: null,
    commerciallyBlockedReason: null
  },
  {
    productCode: 'otp-zold',
    productId: 'mortgage-loan.otp-zold.standard',
    specVersion: 'v2alpha1',
    displayName: 'OTP Zöld Lakáshitel',
    defaultAnnualInterestRatePct: 7.99,
    defaultTermMonths: 240,
    defaultGracePeriodMonths: 0,
    graceRequired: false,
    loanPurposes: ['new-home-purchase', 'construction', 'renovation', 'modernization'],
    eligibilityHints: [
      'Green housing energy conditions are required for the Zöld rate discount.',
      'Representative rate assumes the 50 bp green discount (base 8.49% → 7.99%).'
    ],
    discountHints: [
      'Zöld kamatkedvezmény: 50 bp when green housing conditions are met.',
      'OTP Zöld folyósítási díj waiver may apply under the green fee action.'
    ],
    postSubsidyInfo: null,
    commerciallyBlockedReason: null
  },
  {
    productCode: 'vegig-fix',
    productId: 'mortgage-loan.vegig-fix.standard',
    specVersion: 'v2alpha1',
    displayName: 'OTP Végig Fix Lakáshitel',
    defaultAnnualInterestRatePct: 8.49,
    defaultTermMonths: 240,
    defaultGracePeriodMonths: 0,
    graceRequired: false,
    loanPurposes: [
      'used-home-purchase',
      'new-home-purchase',
      'construction',
      'renovation',
      'modernization',
      'extension',
      'refinancing'
    ],
    eligibilityHints: [
      'Contractual rate fixed for the full term at the Hirdetmény Végig Fix rate.'
    ],
    discountHints: [
      'Fee-waiver discounts may apply under OTP Díjkedvezményes conditions (hints only).'
    ],
    postSubsidyInfo: null,
    commerciallyBlockedReason: null
  },
  {
    productCode: 'csok-plusz',
    productId: 'mortgage-loan.csok-plusz.standard',
    specVersion: 'v2alpha1',
    displayName: 'OTP Évnyerő CSOK Plusz Lakáshitel',
    defaultAnnualInterestRatePct: 3,
    defaultTermMonths: 240,
    defaultGracePeriodMonths: 12,
    graceRequired: true,
    loanPurposes: ['used-home-purchase', 'new-home-purchase', 'extension'],
    eligibilityHints: [
      'Eligible under 518/2023. (XI. 30.) CSOK Plusz program rules.',
      'Mandatory 12-month interest-only grace at the start of the term.',
      'Only customer repayments are included in the user balance (bank↔state subsidy legs out of scope).'
    ],
    discountHints: [
      'Disbursement fee reductions may apply under program conditions (hints only).'
    ],
    postSubsidyInfo:
      'Interest-period resets (1y → 1y → 5y) and post-subsidy rate steps are informational only; the schedule uses the customer rate for the full term in schedule-usable mode.',
    commerciallyBlockedReason: null
  },
  {
    productCode: 'falusi-csok',
    productId: 'mortgage-loan.falusi-csok.standard',
    specVersion: 'v2alpha1',
    displayName: 'OTP Falusi CSOK Lakáshitel',
    defaultAnnualInterestRatePct: 3,
    defaultTermMonths: 240,
    defaultGracePeriodMonths: 0,
    graceRequired: false,
    loanPurposes: [
      'used-home-purchase',
      'new-home-purchase',
      'construction',
      'renovation',
      'modernization',
      'extension'
    ],
    eligibilityHints: [
      'State-subsidized Falusi CSOK / Otthonteremtés rules apply.',
      'Only customer repayments are included in the user balance.'
    ],
    discountHints: [],
    postSubsidyInfo:
      'Interest-period resets and post-subsidy rate steps are informational only in schedule-usable mode.',
    commerciallyBlockedReason: null
  },
  {
    productCode: 'otthon-start',
    productId: 'mortgage-loan.otthon-start.standard',
    specVersion: 'v2alpha1',
    displayName: 'OTP Otthon Start Lakáshitel',
    defaultAnnualInterestRatePct: 3,
    defaultTermMonths: 240,
    defaultGracePeriodMonths: 12,
    graceRequired: false,
    loanPurposes: ['used-home-purchase', 'new-home-purchase', 'construction', 'extension'],
    eligibilityHints: [
      'State-subsidized Otthon Start customer rate during the subsidy window.',
      'Only customer repayments are included in the user balance.'
    ],
    discountHints: [],
    postSubsidyInfo:
      '5-year interest periods and post-subsidy rate steps are informational only; schedule uses the customer rate in schedule-usable mode.',
    commerciallyBlockedReason: null
  },
  {
    productCode: 'videki-otthonfelujitasi',
    productId: 'mortgage-loan.videki-otthonfelujitasi.standard',
    specVersion: 'v2alpha1',
    displayName: 'OTP Vidéki Otthonfelújítási Hitel',
    defaultAnnualInterestRatePct: 4.87,
    defaultTermMonths: 120,
    defaultGracePeriodMonths: 0,
    graceRequired: false,
    loanPurposes: ['renovation', 'modernization'],
    eligibilityHints: [
      'State provides a fixed 3 pp interest subsidy for up to 10 years.',
      'Only customer repayments are included in the user balance.'
    ],
    discountHints: [],
    postSubsidyInfo:
      'Subsidy lasts up to 120 months; post-subsidy rate steps are informational only in schedule-usable mode.',
    commerciallyBlockedReason:
      'Published Hirdetmény §6 installment packaging cannot amortize the stated principal; commercially-usable requires reconciled offering figures and THM match (ADR 0023).'
  }
]

function buildCommercialLoanProductOptions() {
  return COMMERCIAL_LOAN_PRODUCTS.map((product) => ({
    value: product.productCode,
    label: product.displayName,
    productId: product.productId
  }))
}

function findCommercialLoanProduct(productCode) {
  return COMMERCIAL_LOAN_PRODUCTS.find((entry) => entry.productCode === productCode) || null
}

function findCommercialLoanProductById(productId) {
  return COMMERCIAL_LOAN_PRODUCTS.find((entry) => entry.productId === productId) || null
}

function purposeOptionLabel(purposeCode) {
  return PURPOSE_LABELS[purposeCode] || purposeCode
}

export {
  COMMERCIAL_LOAN_PRODUCTS,
  PURPOSE_LABELS,
  buildCommercialLoanProductOptions,
  findCommercialLoanProduct,
  findCommercialLoanProductById,
  purposeOptionLabel
}
