/**
 * Migration scaffolding (ADR 0013–0016 / ownership): hand-authored commercial loan
 * composer catalog for public-offering mortgage-loan products (ADR 0023).
 * Fee/discount commercial blocks live in `commercial-loan-commercial-blocks.js`.
 * Keep displayName / defaults / migrationStatus in sync with product YAML + PRODUCT_CATALOG
 * until fully-spec-backed embedded `*-product-spec.js` modules replace this map.
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

/** ADR 0025 — published tariff notice (Hirdetmény) mortgages use ACT/360 equal-month + forint rounding. */
const HIRDETMENY_DAY_COUNT = {
  interestDayCountConvention: 'act/360',
  paymentRounding: 'forint'
}

const COMMERCIAL_LOAN_PRODUCTS = [
  {
    productCode: 'otp-1x1',
    productId: 'mortgage-loan.otp-1x1.standard',
    specVersion: 'v2alpha1',
    displayName: 'OTP 1x1 Home Loan (1x1 Lakáshitel)',
    migrationStatus: 'commercially-usable',
    ...HIRDETMENY_DAY_COUNT,
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
      'Market forint home loan; conditions follow the OTP published tariff notice (Hirdetmény) for applications from 2026-04-20.'
    ],
    discountHints: [
      'Loyalty service rate discount (up to 1.2%) may apply when income-routing conditions are met.',
      'Disbursement fee waiver may apply under OTP discounted-fee campaign conditions.'
    ],
    postSubsidyInfo: null,
    commerciallyBlockedReason: null
  },
  {
    productCode: 'otp-zold',
    productId: 'mortgage-loan.otp-zold.standard',
    specVersion: 'v2alpha1',
    displayName: 'OTP Green Home Loan (Zöld Lakáshitel)',
    migrationStatus: 'commercially-usable',
    ...HIRDETMENY_DAY_COUNT,
    defaultAnnualInterestRatePct: 7.99,
    defaultTermMonths: 240,
    defaultGracePeriodMonths: 0,
    graceRequired: false,
    loanPurposes: ['new-home-purchase', 'construction', 'renovation', 'modernization'],
    eligibilityHints: [
      'Green housing energy conditions are required for the green rate discount.',
      'Representative rate assumes the 50 bp green discount (base 8.49% → 7.99%).'
    ],
    discountHints: [
      'Green rate discount: 50 bp when green housing conditions are met.',
      'OTP Green disbursement fee waiver may apply under the green fee action.'
    ],
    postSubsidyInfo: null,
    commerciallyBlockedReason: null
  },
  {
    productCode: 'vegig-fix',
    productId: 'mortgage-loan.vegig-fix.standard',
    specVersion: 'v2alpha1',
    displayName: 'OTP Fixed-for-Term Home Loan (Végig Fix Lakáshitel)',
    migrationStatus: 'commercially-usable',
    ...HIRDETMENY_DAY_COUNT,
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
      'Contractual rate fixed for the full term at the published Fixed-for-Term (Végig Fix) tariff rate.'
    ],
    discountHints: [
      'Fee-waiver discounts may apply under OTP discounted-fee campaign conditions.'
    ],
    postSubsidyInfo: null,
    commerciallyBlockedReason: null
  },
  {
    productCode: 'csok-plusz',
    productId: 'mortgage-loan.csok-plusz.standard',
    specVersion: 'v2alpha1',
    displayName: 'OTP Year-Saver CSOK Plus Home Loan (Évnyerő CSOK Plusz Lakáshitel)',
    migrationStatus: 'commercially-usable',
    ...HIRDETMENY_DAY_COUNT,
    defaultAnnualInterestRatePct: 3,
    defaultTermMonths: 240,
    defaultGracePeriodMonths: 12,
    graceRequired: true,
    loanPurposes: ['used-home-purchase', 'new-home-purchase', 'extension'],
    eligibilityHints: [
      'Eligible under 518/2023. (XI. 30.) CSOK Plus program rules.',
      'Mandatory 12-month interest-only grace at the start of the term.',
      'Only customer repayments are included in the user balance (bank↔state subsidy legs out of scope).'
    ],
    discountHints: [
      'Disbursement fee reductions may apply under program conditions.'
    ],
    postSubsidyInfo:
      'Interest-period resets (1y → 1y → 5y) and post-subsidy rate steps are informational only; the schedule uses the customer rate for the full term.',
    commerciallyBlockedReason: null
  },
  {
    productCode: 'falusi-csok',
    productId: 'mortgage-loan.falusi-csok.standard',
    specVersion: 'v2alpha1',
    displayName: 'OTP Home-Creation Loan — Village CSOK (Falusi CSOK / Otthonteremtési Lakáshitel)',
    migrationStatus: 'commercially-usable',
    ...HIRDETMENY_DAY_COUNT,
    defaultAnnualInterestRatePct: 3,
    defaultTermMonths: 240,
    defaultGracePeriodMonths: 0,
    graceRequired: false,
    loanPurposes: ['used-home-purchase', 'renovation', 'modernization', 'extension'],
    eligibilityHints: [
      'State-subsidized Village CSOK / home-creation rules apply.',
      'Only customer repayments are included in the user balance.'
    ],
    discountHints: [],
    postSubsidyInfo:
      'Interest-period resets and post-subsidy rate steps are informational only.',
    commerciallyBlockedReason: null
  },
  {
    productCode: 'otthon-start',
    productId: 'mortgage-loan.otthon-start.standard',
    specVersion: 'v2alpha1',
    displayName: 'OTP Year-Saver Home Start Loan (Évnyerő Otthon Start Lakáshitel)',
    migrationStatus: 'commercially-usable',
    ...HIRDETMENY_DAY_COUNT,
    defaultAnnualInterestRatePct: 3,
    defaultTermMonths: 240,
    defaultGracePeriodMonths: 12,
    graceRequired: false,
    loanPurposes: ['used-home-purchase', 'new-home-purchase', 'construction'],
    eligibilityHints: [
      'State-subsidized Home Start customer rate during the subsidy window.',
      'Only customer repayments are included in the user balance.'
    ],
    discountHints: [],
    postSubsidyInfo:
      '5-year interest periods and post-subsidy rate steps are informational only; schedule uses the customer rate.',
    commerciallyBlockedReason: null
  },
  {
    productCode: 'videki-otthonfelujitasi',
    productId: 'mortgage-loan.videki-otthonfelujitasi.standard',
    specVersion: 'v2alpha1',
    displayName: 'OTP Rural Home Renovation Loan (Vidéki Otthonfelújítási Lakáshitel)',
    migrationStatus: 'schedule-usable',
    ...HIRDETMENY_DAY_COUNT,
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
      'Subsidy lasts up to 120 months; post-subsidy rate steps are informational only.',
    commerciallyBlockedReason:
      'Published tariff notice (Hirdetmény) §6 installment packaging cannot amortize the stated principal; commercially-usable requires reconciled offering figures and all three ADR 0024 checks (ADR 0026).'
  }
]

function buildCommercialLoanProductOptions() {
  return COMMERCIAL_LOAN_PRODUCTS.map((product) => ({
    value: product.productCode,
    label: product.displayName,
    productId: product.productId,
    migrationStatus: product.migrationStatus
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
