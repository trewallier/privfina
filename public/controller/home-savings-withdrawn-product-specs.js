/**
 * Embedded catalog entries for withdrawn OTP Premium / Premium Plus módozatok
 * (ROADMAP §5f). Keep in sync with
 * `docs/product-specs/products/home-savings/<code>/product.yaml`
 * (asserted by `tests/home-savings-withdrawn-product-spec-parity.test.ts` for
 * identity / engine / saleWindow / premiumTiers / fees — fully-spec-backed
 * UI parity may still trail).
 * Sale windows are closed — composer/engine require startDate inside the window.
 */

const HOME_SAVINGS_PREMIUM_PLUSZ_4X10_PRODUCT_SPEC = {
  specVersion: 'v2alpha1',
  kind: 'financial-product',
  id: 'home-savings.premium-plusz-4x10.standard',
  family: 'home-savings',
  variant: 'premium-plusz-4x10',
  productCode: 'premium-plusz-4x10',
  displayName:
    'OTP Home Savings Premium Plus 4x10 (withdrawn) — start 2025-08-01…2026-08-02',
  engine: {
    instrumentType: 'home-savings',
    paymentFrequency: 'monthly',
    depositInterestAnnualRatePct: 0.1,
    savingsRatePermille: 10,
    minContractAmount: 1_000_000,
    maxContractAmount: 10_000_000,
    evaluationMinMonths: 48,
    allocationMinMonths: 50
  },
  saleWindow: { from: '2025-08-01', to: '2026-08-02' },
  fees: [
    { name: 'szamlanyitasi-dij', type: 'account-opening', value: 1, unit: 'percent' },
    { name: 'szamlavezetesi-dij', type: 'account-management', value: 350, unit: 'amount' },
    { name: 'huseg-feloldas-dij', type: 'other', value: 100, unit: 'percent' }
  ],
  inputs: [
    {
      name: 'monthlyDeposit',
      type: 'number',
      constraints: { minimum: 10_000, maximum: 100_000 }
    },
    {
      name: 'termMonths',
      type: 'integer',
      constraints: { minimum: 1, maximum: 48 }
    },
    {
      name: 'openingFeeMode',
      type: 'string',
      constraints: {
        enum: ['standard-1pct', 'promo-half-percent', 'promo-fixed-25000']
      }
    }
  ],
  premiumTiers: {
    bands: [{ minHoldingMonths: 48, ratePct: 10 }]
  },
  migrationStatus: 'schedule-usable',
  openingFeeModeDepositBands: {
    'promo-half-percent': { min: 10_000, max: 49_990 },
    'promo-fixed-25000': { min: 50_000, max: 100_000 }
  },
  eligibilityHints: [
    'Withdrawn módozat — savings start date must fall in 2025-08-01 … 2026-08-02.',
    'Natural person or condominium/cooperative saver; housing-purpose required for Premium.'
  ],
  discountHints: [
    'Promo opening fee (0.5% or fixed 25 000 Ft) required a 48-month loyalty commitment when the promo was active.'
  ],
  premiumHints:
    'Premium 10% at maturity from month 48 with housing purpose (single band for this módozat).',
  defaults: {
    monthlyDeposit: 50_000,
    termMonths: 48,
    housingPurpose: true,
    openingFeeMode: 'promo-fixed-25000'
  }
}

const HOME_SAVINGS_PREMIUM_PLUSZ_8X30_PRODUCT_SPEC = {
  specVersion: 'v2alpha1',
  kind: 'financial-product',
  id: 'home-savings.premium-plusz-8x30.standard',
  family: 'home-savings',
  variant: 'premium-plusz-8x30',
  productCode: 'premium-plusz-8x30',
  displayName:
    'OTP Home Savings Premium Plus 8x30 (withdrawn) — start 2025-08-01…2026-08-02',
  engine: {
    instrumentType: 'home-savings',
    paymentFrequency: 'monthly',
    depositInterestAnnualRatePct: 0.1,
    savingsRatePermille: 5,
    minContractAmount: 2_000_000,
    maxContractAmount: 20_000_000,
    evaluationMinMonths: 96,
    allocationMinMonths: 98
  },
  saleWindow: { from: '2025-08-01', to: '2026-08-02' },
  fees: [
    { name: 'szamlanyitasi-dij', type: 'account-opening', value: 1, unit: 'percent' },
    { name: 'szamlavezetesi-dij', type: 'account-management', value: 350, unit: 'amount' },
    { name: 'huseg-feloldas-dij', type: 'other', value: 100, unit: 'percent' }
  ],
  inputs: [
    {
      name: 'monthlyDeposit',
      type: 'number',
      constraints: { minimum: 10_000, maximum: 100_000 }
    },
    {
      name: 'termMonths',
      type: 'integer',
      constraints: { minimum: 1, maximum: 96 }
    },
    {
      name: 'openingFeeMode',
      type: 'string',
      constraints: {
        enum: ['standard-1pct', 'promo-half-percent', 'promo-fixed-50000']
      }
    }
  ],
  premiumTiers: {
    bands: [{ minHoldingMonths: 96, ratePct: 30 }]
  },
  migrationStatus: 'commercially-usable',
  openingFeeModeDepositBands: {
    'promo-half-percent': { min: 10_000, max: 49_990 },
    'promo-fixed-50000': { min: 50_000, max: 100_000 }
  },
  eligibilityHints: [
    'Withdrawn módozat — savings start date must fall in 2025-08-01 … 2026-08-02.',
    'Natural person or condominium/cooperative saver; housing-purpose required for Premium.'
  ],
  discountHints: [
    'Promo opening fee (0.5% or fixed 50 000 Ft) required a 48-month loyalty commitment when the promo was active.'
  ],
  premiumHints:
    'Premium 30% at maturity from month 96 with housing purpose (single band for this módozat).',
  defaults: {
    monthlyDeposit: 50_000,
    termMonths: 96,
    housingPurpose: true,
    openingFeeMode: 'promo-fixed-50000'
  }
}

const HOME_SAVINGS_PREMIUM_4X10_PRODUCT_SPEC = {
  specVersion: 'v2alpha1',
  kind: 'financial-product',
  id: 'home-savings.premium-4x10.standard',
  family: 'home-savings',
  variant: 'premium-4x10',
  productCode: 'premium-4x10',
  displayName: 'OTP Home Savings Premium 4x10 (withdrawn) — start 2023-03-01…2025-07-31',
  engine: {
    instrumentType: 'home-savings',
    paymentFrequency: 'monthly',
    depositInterestAnnualRatePct: 0.1,
    savingsRatePermille: 11.627,
    minContractAmount: 860_000,
    maxContractAmount: 4_300_000,
    evaluationMinMonths: 48,
    allocationMinMonths: 50
  },
  saleWindow: { from: '2023-03-01', to: '2025-07-31' },
  fees: [
    { name: 'szamlanyitasi-dij', type: 'account-opening', value: 1, unit: 'percent' },
    { name: 'szamlavezetesi-dij', type: 'account-management', value: 150, unit: 'amount' }
  ],
  inputs: [
    {
      name: 'monthlyDeposit',
      type: 'number',
      constraints: { minimum: 10_000, maximum: 50_000 }
    },
    {
      name: 'termMonths',
      type: 'integer',
      constraints: { minimum: 1, maximum: 48 }
    },
    {
      name: 'openingFeeMode',
      type: 'string',
      constraints: { enum: ['standard-1pct'] }
    }
  ],
  premiumTiers: {
    bands: [{ minHoldingMonths: 48, ratePct: 10 }]
  },
  migrationStatus: 'schedule-usable',
  openingFeeModeDepositBands: {},
  eligibilityHints: [
    'Withdrawn módozat — savings start date must fall in 2023-03-01 … 2025-07-31.',
    'Natural person or condominium/cooperative saver; housing-purpose required for Premium.'
  ],
  discountHints: ['Standard 1% opening fee for this archived offering cohort.'],
  premiumHints:
    'Premium 10% at maturity from month 48 with housing purpose (single band for this módozat).',
  defaults: {
    monthlyDeposit: 20_000,
    termMonths: 48,
    housingPurpose: true,
    openingFeeMode: 'standard-1pct'
  }
}

const HOME_SAVINGS_PREMIUM_8X30_PRODUCT_SPEC = {
  specVersion: 'v2alpha1',
  kind: 'financial-product',
  id: 'home-savings.premium-8x30.standard',
  family: 'home-savings',
  variant: 'premium-8x30',
  productCode: 'premium-8x30',
  displayName: 'OTP Home Savings Premium 8x30 (withdrawn) — start 2023-03-01…2025-07-31',
  engine: {
    instrumentType: 'home-savings',
    paymentFrequency: 'monthly',
    depositInterestAnnualRatePct: 0.1,
    savingsRatePermille: 5,
    minContractAmount: 2_000_000,
    maxContractAmount: 10_000_000,
    evaluationMinMonths: 96,
    allocationMinMonths: 98
  },
  saleWindow: { from: '2023-03-01', to: '2025-07-31' },
  fees: [
    { name: 'szamlanyitasi-dij', type: 'account-opening', value: 1, unit: 'percent' },
    { name: 'szamlavezetesi-dij', type: 'account-management', value: 150, unit: 'amount' }
  ],
  inputs: [
    {
      name: 'monthlyDeposit',
      type: 'number',
      constraints: { minimum: 10_000, maximum: 50_000 }
    },
    {
      name: 'termMonths',
      type: 'integer',
      constraints: { minimum: 1, maximum: 96 }
    },
    {
      name: 'openingFeeMode',
      type: 'string',
      constraints: { enum: ['standard-1pct'] }
    }
  ],
  premiumTiers: {
    bands: [{ minHoldingMonths: 96, ratePct: 30 }]
  },
  migrationStatus: 'commercially-usable',
  openingFeeModeDepositBands: {},
  eligibilityHints: [
    'Withdrawn módozat — savings start date must fall in 2023-03-01 … 2025-07-31.',
    'Natural person or condominium/cooperative saver; housing-purpose required for Premium.'
  ],
  discountHints: ['Standard 1% opening fee for this archived offering cohort.'],
  premiumHints:
    'Premium 30% at maturity from month 96 with housing purpose (single band for this módozat).',
  defaults: {
    monthlyDeposit: 20_000,
    termMonths: 96,
    housingPurpose: true,
    openingFeeMode: 'standard-1pct'
  }
}

const HOME_SAVINGS_WITHDRAWN_PRODUCT_SPECS = [
  HOME_SAVINGS_PREMIUM_PLUSZ_4X10_PRODUCT_SPEC,
  HOME_SAVINGS_PREMIUM_PLUSZ_8X30_PRODUCT_SPEC,
  HOME_SAVINGS_PREMIUM_4X10_PRODUCT_SPEC,
  HOME_SAVINGS_PREMIUM_8X30_PRODUCT_SPEC
]

export {
  HOME_SAVINGS_WITHDRAWN_PRODUCT_SPECS,
  HOME_SAVINGS_PREMIUM_PLUSZ_4X10_PRODUCT_SPEC,
  HOME_SAVINGS_PREMIUM_PLUSZ_8X30_PRODUCT_SPEC,
  HOME_SAVINGS_PREMIUM_4X10_PRODUCT_SPEC,
  HOME_SAVINGS_PREMIUM_8X30_PRODUCT_SPEC
}
