/**
 * Embedded frontend product-spec for OTP Home Savings Premium Plus 10x30.
 * Keep in parity with
 * `docs/product-specs/products/home-savings/premium-plusz-10x30/product.yaml`
 * (asserted by `tests/home-savings-product-spec-parity.test.ts`).
 */

const HOME_SAVINGS_PREMIUM_PLUSZ_10X30_PRODUCT_SPEC = {
  specVersion: 'v2alpha1',
  kind: 'financial-product',
  id: 'home-savings.premium-plusz-10x30.standard',
  family: 'home-savings',
  variant: 'premium-plusz-10x30',
  productCode: 'premium-plusz-10x30',
  displayName: 'OTP Home Savings Premium Plus 10x30 (Lakástakarék PRÉMIUM PLUSZ 10x30)',
  description:
    'OTP Lakástakarék Zrt. home-savings (lakás-előtakarékossági) contract, PRÉMIUM PLUSZ 10x30 product scheme (módozat). Customer-perspective savings schedule only.',
  engine: {
    instrumentType: 'home-savings',
    paymentFrequency: 'monthly',
    depositInterestAnnualRatePct: 0.1,
    savingsRatePermille: 3.846,
    minContractAmount: 2_600_000,
    maxContractAmount: 26_000_000,
    evaluationMinMonths: 120,
    allocationMinMonths: 122
  },
  saleWindow: {
    from: '2026-08-03',
    to: null
  },
  eligibilityRules: [
    'natural-person-or-condominium-cooperative-saver',
    'hungarian-residential-or-stay-address-for-natural-person',
    'housing-purpose-required-for-premium',
    'no-state-support-post-2018-10-17',
    'loyalty-commitment-required-for-promo-opening-fee'
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
      name: 'promo-opening-fee-fixed-65000',
      type: 'fee-waiver',
      value: 0,
      unit: 'amount',
      conditions: [
        'monthly-deposit-50000-to-100000',
        'loyalty-commitment-48-months',
        'promo-hirdetmeny-active',
        'opening-fee-fixed-65000-ft'
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
      value: 500,
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
      constraints: { minimum: 1, maximum: 120 }
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
        enum: ['standard-1pct', 'promo-half-percent', 'promo-fixed-65000']
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
    formTitle: 'OTP Home Savings Premium Plus 10x30 (Lakástakarék PRÉMIUM PLUSZ 10x30)',
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
  /** Composer-facing Premium tiers (USZ / Hirdetmény) — not a YAML engine block. */
  premiumTiers: {
    bands: [
      { minHoldingMonths: 120, ratePct: 30 },
      { minHoldingMonths: 97, ratePct: 20 },
      { minHoldingMonths: 49, ratePct: 10 }
    ],
    months49to96: 10,
    months97to120: 20,
    maturityFrom120: 30
  },
  /** Catalog migration status mirrored into PRODUCT_CATALOG. */
  migrationStatus: 'fully-spec-backed',
  openingFeeModeDepositBands: {
    'promo-half-percent': { min: 10_000, max: 49_990 },
    'promo-fixed-65000': { min: 50_000, max: 100_000 }
  },
  eligibilityHints: [
    'Natural person or condominium/cooperative saver; Hungarian residential or stay address for natural persons.',
    'Housing-purpose use is required for OTP Home Savings Premium (soft hint in v1).',
    'No state support for contracts from 2018-10-17.'
  ],
  discountHints: [
    'Promo opening fee (0.5% or fixed 65 000 Ft) requires a 48-month loyalty commitment.',
    'Loyalty unlock fee (current cohort): 100% of the waived opening fee through month 48 (scenario mode).'
  ],
  premiumHints:
    'Premium tiers with housing purpose: 10% (months 49–96), 20% (97–120), 30% at maturity from month 120. Premium applies to contractual deposits only.',
  defaults: {
    monthlyDeposit: 50_000,
    termMonths: 120,
    housingPurpose: true,
    openingFeeMode: 'promo-fixed-65000'
  }
}

export { HOME_SAVINGS_PREMIUM_PLUSZ_10X30_PRODUCT_SPEC }
