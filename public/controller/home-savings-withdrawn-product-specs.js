/**
 * Embedded catalog entries for withdrawn OTP Premium / Premium Plus módozatok
 * (ROADMAP §5f). Keep in sync with
 * `docs/product-specs/products/home-savings/<code>/product.yaml`
 * (asserted by `tests/home-savings-withdrawn-product-spec-parity.test.ts`).
 *
 * Premium / Premium Plus **8x30** are fully-spec-backed (ADR 0031 EBKM green).
 * Premium / Premium Plus **4x10** stay schedule-usable with pinned 0.01
 * without-Premium EBKM residuals (ADR 0033 hybrid rejected — PR #94/#95).
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
  description:
    'Withdrawn OTP Lakástakarék PRÉMIUM PLUSZ 8x30 product scheme (módozat). Sold 2025-08-01 through 2026-08-02. Customer-perspective savings schedule only. startDate must fall in saleWindow (historical). LTP home loan out of scope.',
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
  eligibilityRules: [
    'natural-person-or-condominium-cooperative-saver',
    'hungarian-residential-or-stay-address-for-natural-person',
    'housing-purpose-required-for-premium',
    'no-state-support-post-2018-10-17',
    'loyalty-commitment-required-for-promo-opening-fee',
    'start-date-must-fall-in-sale-window'
  ],
  discounts: [
    {
      name: 'promo-opening-fee-half-percent',
      type: 'fee-waiver',
      value: 50,
      unit: 'percent',
      conditions: [
        'monthly-deposit-10000-to-49990',
        'loyalty-commitment-48-months',
        'promo-hirdetmeny-active'
      ],
      appliesToFeeNames: ['szamlanyitasi-dij']
    },
    {
      name: 'promo-opening-fee-fixed-50000',
      type: 'fee-waiver',
      value: 0,
      unit: 'amount',
      conditions: [
        'monthly-deposit-50000-to-100000',
        'loyalty-commitment-48-months',
        'promo-hirdetmeny-active',
        'opening-fee-fixed-50000-ft'
      ],
      appliesToFeeNames: ['szamlanyitasi-dij']
    }
  ],
  fees: [
    {
      name: 'szamlanyitasi-dij',
      type: 'account-opening',
      value: 1,
      unit: 'percent',
      timing: 'upfront'
    },
    {
      name: 'szamlavezetesi-dij',
      type: 'account-management',
      value: 350,
      unit: 'amount',
      timing: 'periodic'
    },
    {
      name: 'huseg-feloldas-dij',
      type: 'other',
      value: 100,
      unit: 'percent',
      timing: 'on-event'
    }
  ],
  inputs: [
    {
      name: 'monthlyDeposit',
      type: 'number',
      label: 'Monthly Deposit',
      required: true,
      unit: 'currency',
      constraints: { minimum: 10_000, maximum: 100_000 }
    },
    {
      name: 'termMonths',
      type: 'integer',
      label: 'Savings Term (Months)',
      required: true,
      unit: 'months',
      constraints: { minimum: 1, maximum: 96 }
    },
    {
      name: 'startDate',
      type: 'string',
      label: 'Savings Start Date',
      required: true,
      unit: 'date'
    },
    {
      name: 'housingPurpose',
      type: 'boolean',
      label: 'Housing Purpose Assumed',
      required: true
    },
    {
      name: 'openingFeeMode',
      type: 'string',
      label: 'Opening Fee Mode',
      required: true,
      constraints: {
        enum: ['standard-1pct', 'promo-half-percent', 'promo-fixed-50000']
      }
    },
    {
      name: 'contractAmount',
      type: 'number',
      label: 'Contract Amount',
      required: false,
      unit: 'currency'
    }
  ],
  derivedVariables: [
    { name: 'accountOpeningFee', type: 'number', label: 'Account Opening Fee', unit: 'currency' },
    { name: 'premiumRatePct', type: 'number', label: 'Premium Rate Percent', unit: 'percent' }
  ],
  outputs: [
    { name: 'totalDeposits', type: 'number', label: 'Total Deposits', unit: 'currency' },
    { name: 'totalAccountFees', type: 'number', label: 'Total Account Fees', unit: 'currency' },
    { name: 'premiumAmount', type: 'number', label: 'Premium Amount', unit: 'currency' },
    { name: 'terminalPayout', type: 'number', label: 'Terminal Payout', unit: 'currency' },
    { name: 'ebkmPct', type: 'number', label: 'EBKM Percent', unit: 'percent' }
  ],
  ui: {
    formTitle: 'OTP Home Savings Premium Plus 8x30 (withdrawn)',
    sections: [
      {
        id: 'contract',
        title: 'Contract',
        fieldNames: [
          'monthlyDeposit',
          'termMonths',
          'startDate',
          'housingPurpose',
          'openingFeeMode',
          'contractAmount'
        ]
      },
      {
        id: 'results',
        title: 'Results',
        fieldNames: [
          'totalDeposits',
          'totalAccountFees',
          'premiumAmount',
          'terminalPayout',
          'ebkmPct'
        ]
      }
    ]
  },
  premiumTiers: {
    bands: [{ minHoldingMonths: 96, ratePct: 30 }]
  },
  migrationStatus: 'fully-spec-backed',
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
  description:
    'Withdrawn OTP Lakástakarék PRÉMIUM 8x30 product scheme (módozat). Sold 2023-03-01 through 2025-07-31 (replaced by PRÉMIUM PLUSZ 8x30). Customer-perspective savings schedule only. startDate must fall in saleWindow.',
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
  eligibilityRules: [
    'natural-person-or-condominium-cooperative-saver',
    'hungarian-residential-or-stay-address-for-natural-person',
    'housing-purpose-required-for-premium',
    'no-state-support-post-2018-10-17',
    'start-date-must-fall-in-sale-window'
  ],
  discounts: [],
  fees: [
    {
      name: 'szamlanyitasi-dij',
      type: 'account-opening',
      value: 1,
      unit: 'percent',
      timing: 'upfront'
    },
    {
      name: 'szamlavezetesi-dij',
      type: 'account-management',
      value: 150,
      unit: 'amount',
      timing: 'periodic'
    }
  ],
  inputs: [
    {
      name: 'monthlyDeposit',
      type: 'number',
      label: 'Monthly Deposit',
      required: true,
      unit: 'currency',
      constraints: { minimum: 10_000, maximum: 50_000 }
    },
    {
      name: 'termMonths',
      type: 'integer',
      label: 'Savings Term (Months)',
      required: true,
      unit: 'months',
      constraints: { minimum: 1, maximum: 96 }
    },
    {
      name: 'startDate',
      type: 'string',
      label: 'Savings Start Date',
      required: true,
      unit: 'date'
    },
    {
      name: 'housingPurpose',
      type: 'boolean',
      label: 'Housing Purpose Assumed',
      required: true
    },
    {
      name: 'openingFeeMode',
      type: 'string',
      label: 'Opening Fee Mode',
      required: true,
      constraints: { enum: ['standard-1pct'] }
    },
    {
      name: 'contractAmount',
      type: 'number',
      label: 'Contract Amount',
      required: false,
      unit: 'currency'
    }
  ],
  derivedVariables: [
    { name: 'accountOpeningFee', type: 'number', label: 'Account Opening Fee', unit: 'currency' },
    { name: 'premiumRatePct', type: 'number', label: 'Premium Rate Percent', unit: 'percent' }
  ],
  outputs: [
    { name: 'totalDeposits', type: 'number', label: 'Total Deposits', unit: 'currency' },
    { name: 'totalAccountFees', type: 'number', label: 'Total Account Fees', unit: 'currency' },
    { name: 'premiumAmount', type: 'number', label: 'Premium Amount', unit: 'currency' },
    { name: 'terminalPayout', type: 'number', label: 'Terminal Payout', unit: 'currency' },
    { name: 'ebkmPct', type: 'number', label: 'EBKM Percent', unit: 'percent' }
  ],
  ui: {
    formTitle: 'OTP Home Savings Premium 8x30 (withdrawn)',
    sections: [
      {
        id: 'contract',
        title: 'Contract',
        fieldNames: [
          'monthlyDeposit',
          'termMonths',
          'startDate',
          'housingPurpose',
          'openingFeeMode',
          'contractAmount'
        ]
      },
      {
        id: 'results',
        title: 'Results',
        fieldNames: [
          'totalDeposits',
          'totalAccountFees',
          'premiumAmount',
          'terminalPayout',
          'ebkmPct'
        ]
      }
    ]
  },
  premiumTiers: {
    bands: [{ minHoldingMonths: 96, ratePct: 30 }]
  },
  migrationStatus: 'fully-spec-backed',
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
