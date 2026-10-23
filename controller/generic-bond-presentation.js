/**
 * Declarative presentation metadata for generic investment bond subtypes
 * (instrument-mode; not catalog product YAML). Shaped like product-spec inputs/outputs.
 */

const SHARED_META_FIELDS = {
  label: {
    name: 'label',
    label: 'Label',
    required: false,
    role: 'input',
    description: 'Friendly name for this instrument row in the configured list.',
    inputId: 'investment-label'
  },
  category: {
    name: 'category',
    label: 'Category',
    required: false,
    role: 'input',
    description: 'Optional tag for grouping this instrument in lists and reports.',
    inputId: 'investment-category'
  },
  description: {
    name: 'description',
    label: 'Description',
    required: false,
    role: 'input',
    description: 'Optional free-text notes for this investment instrument.',
    inputId: 'investment-description'
  },
  maturityPreview: {
    name: 'maturityPreview',
    label: 'Maturity preview',
    required: false,
    role: 'output',
    description: 'Calculated maturity or redemption amount for the current inputs.',
    inputId: 'investment-maturity-preview'
  },
  purchasePreview: {
    name: 'purchasePreview',
    label: 'Purchase amount preview',
    required: false,
    role: 'output',
    description: 'Calculated amount paid at purchase/settlement for the current inputs.',
    inputId: 'investment-purchase-preview'
  },
  gainPreview: {
    name: 'gainPreview',
    label: 'Gain preview',
    required: false,
    role: 'output',
    description: 'Calculated difference between maturity value and purchase amount.',
    inputId: 'investment-gain-preview'
  },
  discountYieldPreview: {
    name: 'discountYieldPreview',
    label: 'Discount yield',
    required: false,
    role: 'output',
    description: 'Annualized discount yield derived from face value, purchase price, and days remaining.',
    inputId: 'investment-discount-yield-preview'
  },
  discountCurrentValuePreview: {
    name: 'discountCurrentValuePreview',
    label: 'Discount current value %',
    required: false,
    role: 'output',
    description: 'Purchase price as a percentage of face value (derived).',
    inputId: 'investment-discount-current-value-preview'
  },
  inflationSchedulePreview: {
    name: 'inflationSchedulePreview',
    label: 'Inflation schedule',
    required: false,
    role: 'output',
    description: 'Derived annual accrual periods, effective rates, and accrual factors.',
    inputId: 'investment-inflation-schedule-preview'
  }
}

const GENERIC_BOND_PRESENTATION = {
  'regular-bond': {
    visible: {
      issueDate: false,
      transactionDate: true,
      dueDate: true,
      spreadRate: false,
      yearlyInflation: false,
      couponPeriod: false,
      saleDate: false,
      saleValue: false,
      discountYieldPreview: false,
      discountCurrentValuePreview: false,
      inflationSchedulePreview: false,
      annualRate: true,
      purchasePrice: true,
      principal: true
    },
    required: {
      issueDate: false,
      transactionDate: true,
      dueDate: true,
      purchasePrice: false,
      spreadRate: false,
      yearlyInflation: false,
      couponPeriod: false,
      annualRate: true,
      principal: true
    },
    fields: {
      issueDate: {
        label: 'Issue date',
        description: 'Bond issuance date (not used for regular-bond v1 cash flows).',
        inputId: 'investment-issue-date'
      },
      transactionDate: {
        label: 'Transaction date',
        description: 'Effective purchase/settlement date used for instrument cash-flow timing.',
        inputId: 'investment-transaction-date'
      },
      dueDate: {
        label: 'Due date',
        description: 'Final due/maturity date used for principal repayment and interest compounding.',
        inputId: 'investment-due-date'
      },
      principal: {
        label: 'Principal',
        description: 'Principal amount used for maturity payout calculations.',
        inputId: 'investment-principal'
      },
      purchasePrice: {
        label: 'Purchase price',
        description: 'Optional upfront amount paid. Defaults to principal when empty.',
        inputId: 'investment-purchase-price'
      },
      annualRate: {
        label: 'Annual rate',
        description: 'Provide annual nominal rate as a decimal (example: 0.05 for 5%).',
        inputId: 'investment-annual-rate'
      },
      spreadRate: {
        label: 'Spread rate',
        description: 'Not used for regular bonds.',
        inputId: 'investment-spread-rate'
      },
      yearlyInflation: {
        label: 'Yearly inflation inputs',
        description: 'Not used for regular bonds.',
        inputId: 'investment-yearly-inflation'
      },
      couponPeriod: {
        label: 'Coupon period',
        description: 'Not used for regular bonds.',
        inputId: 'investment-coupon-period'
      },
      saleDate: {
        label: 'Reserved sale date (future scope)',
        description: 'Reserved for future pre-maturity sale modeling. Not used in v1 flow generation.',
        inputId: 'investment-sale-date'
      },
      saleValue: {
        label: 'Reserved sale value (future scope)',
        description: 'Reserved companion value for optional future sale-date workflows.',
        inputId: 'investment-sale-value'
      },
      ...SHARED_META_FIELDS
    },
    annualRateReadOnly: false
  },
  'discount-bond': {
    visible: {
      issueDate: true,
      transactionDate: true,
      dueDate: true,
      spreadRate: false,
      yearlyInflation: false,
      couponPeriod: false,
      saleDate: false,
      saleValue: false,
      discountYieldPreview: true,
      discountCurrentValuePreview: true,
      inflationSchedulePreview: false,
      annualRate: true,
      purchasePrice: true,
      principal: true
    },
    required: {
      issueDate: true,
      transactionDate: true,
      dueDate: true,
      purchasePrice: true,
      spreadRate: false,
      yearlyInflation: false,
      couponPeriod: false,
      annualRate: false,
      principal: true
    },
    fields: {
      issueDate: {
        label: 'Issue date',
        description: 'Bond issuance date used by discount formulas.',
        inputId: 'investment-issue-date'
      },
      transactionDate: {
        label: 'Transaction date',
        description: 'Effective purchase/settlement date used for instrument cash-flow timing.',
        inputId: 'investment-transaction-date'
      },
      dueDate: {
        label: 'Due date',
        description: 'Final due/maturity date used for principal repayment.',
        inputId: 'investment-due-date'
      },
      principal: {
        label: 'Face value',
        description: 'Face value paid at due date.',
        inputId: 'investment-principal'
      },
      purchasePrice: {
        label: 'Purchase price',
        description: 'Upfront amount paid. Mandatory for discount bonds and must be below face value.',
        inputId: 'investment-purchase-price'
      },
      annualRate: {
        label: 'Annual rate',
        description: 'Derived from face value, purchase price, and days remaining. Read-only for discount bonds.',
        inputId: 'investment-annual-rate'
      },
      spreadRate: {
        label: 'Spread rate',
        description: 'Not used for discount bonds.',
        inputId: 'investment-spread-rate'
      },
      yearlyInflation: {
        label: 'Yearly inflation inputs',
        description: 'Not used for discount bonds.',
        inputId: 'investment-yearly-inflation'
      },
      couponPeriod: {
        label: 'Coupon period',
        description: 'Not used for discount bonds.',
        inputId: 'investment-coupon-period'
      },
      saleDate: {
        label: 'Reserved sale date (future scope)',
        description: 'Reserved for future pre-maturity sale modeling. Not used in v1 flow generation.',
        inputId: 'investment-sale-date'
      },
      saleValue: {
        label: 'Reserved sale value (future scope)',
        description: 'Reserved companion value for optional future sale-date workflows.',
        inputId: 'investment-sale-value'
      },
      ...SHARED_META_FIELDS
    },
    annualRateReadOnly: true
  },
  'inflation-linked-bond': {
    visible: {
      issueDate: true,
      transactionDate: true,
      dueDate: true,
      spreadRate: true,
      yearlyInflation: true,
      couponPeriod: false,
      saleDate: false,
      saleValue: false,
      discountYieldPreview: false,
      discountCurrentValuePreview: false,
      inflationSchedulePreview: true,
      annualRate: true,
      purchasePrice: true,
      principal: true
    },
    required: {
      issueDate: true,
      transactionDate: true,
      dueDate: true,
      purchasePrice: false,
      spreadRate: true,
      yearlyInflation: true,
      couponPeriod: false,
      annualRate: false,
      principal: true
    },
    fields: {
      issueDate: {
        label: 'Issue date',
        description: 'Bond issuance date used by inflation-linked formulas.',
        inputId: 'investment-issue-date'
      },
      transactionDate: {
        label: 'Transaction date',
        description: 'Effective purchase/settlement date used for instrument cash-flow timing.',
        inputId: 'investment-transaction-date'
      },
      dueDate: {
        label: 'Due date',
        description: 'Final due/maturity date used for principal repayment and final accrual settlement.',
        inputId: 'investment-due-date'
      },
      principal: {
        label: 'Principal',
        description: 'Principal used with inflation and spread accrual factors.',
        inputId: 'investment-principal'
      },
      purchasePrice: {
        label: 'Purchase price',
        description: 'Optional upfront amount paid. Defaults to principal when empty.',
        inputId: 'investment-purchase-price'
      },
      annualRate: {
        label: 'Annual rate',
        description: 'Not used for inflation-linked accrual in v1. Leave empty.',
        inputId: 'investment-annual-rate'
      },
      spreadRate: {
        label: 'Spread rate',
        description: 'Additional annual spread added to inflation assumptions for inflation-linked bonds.',
        inputId: 'investment-spread-rate'
      },
      yearlyInflation: {
        label: 'Yearly inflation inputs',
        description: 'Comma-separated year:rate list used to derive inflation-linked accrual factors.',
        inputId: 'investment-yearly-inflation'
      },
      couponPeriod: {
        label: 'Coupon period',
        description: 'Not used for inflation-linked bonds.',
        inputId: 'investment-coupon-period'
      },
      saleDate: {
        label: 'Reserved sale date (future scope)',
        description: 'Reserved for future pre-maturity sale modeling. Not used in v1 flow generation.',
        inputId: 'investment-sale-date'
      },
      saleValue: {
        label: 'Reserved sale value (future scope)',
        description: 'Reserved companion value for optional future sale-date workflows.',
        inputId: 'investment-sale-value'
      },
      ...SHARED_META_FIELDS
    },
    annualRateReadOnly: false
  },
  'custom-bond': {
    visible: {
      issueDate: false,
      transactionDate: true,
      dueDate: true,
      spreadRate: true,
      yearlyInflation: true,
      couponPeriod: true,
      saleDate: false,
      saleValue: false,
      discountYieldPreview: false,
      discountCurrentValuePreview: false,
      inflationSchedulePreview: false,
      annualRate: true,
      purchasePrice: true,
      principal: true
    },
    required: {
      issueDate: false,
      transactionDate: true,
      dueDate: true,
      purchasePrice: false,
      spreadRate: false,
      yearlyInflation: false,
      couponPeriod: true,
      annualRate: true,
      principal: true
    },
    fields: {
      issueDate: {
        label: 'Issue date',
        description: 'Optional issue date for custom bonds.',
        inputId: 'investment-issue-date'
      },
      transactionDate: {
        label: 'Transaction date',
        description: 'Effective purchase/settlement date used for instrument cash-flow timing.',
        inputId: 'investment-transaction-date'
      },
      dueDate: {
        label: 'Due date',
        description: 'Final due/maturity date used for principal repayment.',
        inputId: 'investment-due-date'
      },
      principal: {
        label: 'Principal',
        description: 'Principal is repaid at maturity while coupons are generated by schedule.',
        inputId: 'investment-principal'
      },
      purchasePrice: {
        label: 'Purchase price',
        description: 'Optional upfront amount paid. Defaults to principal when empty.',
        inputId: 'investment-purchase-price'
      },
      annualRate: {
        label: 'Annual rate',
        description: 'Used to compute coupon amounts for the selected coupon schedule.',
        inputId: 'investment-annual-rate'
      },
      spreadRate: {
        label: 'Spread rate',
        description: 'Optional spread input retained for custom-bond experimentation.',
        inputId: 'investment-spread-rate'
      },
      yearlyInflation: {
        label: 'Yearly inflation inputs',
        description: 'Optional inflation list retained for custom-bond experimentation.',
        inputId: 'investment-yearly-inflation'
      },
      couponPeriod: {
        label: 'Coupon period for custom bond',
        description: 'Cron-like schedule for coupon payouts in custom bond mode.',
        inputId: 'investment-coupon-period'
      },
      saleDate: {
        label: 'Reserved sale date (future scope)',
        description: 'Reserved for future pre-maturity sale modeling. Not used in v1 flow generation.',
        inputId: 'investment-sale-date'
      },
      saleValue: {
        label: 'Reserved sale value (future scope)',
        description: 'Reserved companion value for optional future sale-date workflows.',
        inputId: 'investment-sale-value'
      },
      ...SHARED_META_FIELDS
    },
    annualRateReadOnly: false
  }
}

function getGenericBondPresentation(subtype) {
  return GENERIC_BOND_PRESENTATION[subtype] || GENERIC_BOND_PRESENTATION['regular-bond']
}

/**
 * Build the legacy investmentSubtypeUiConfig shape used by applyInvestmentSubtypeUi.
 */
function buildGenericBondSubtypeUiConfig() {
  const result = {}
  for (const [subtype, presentation] of Object.entries(GENERIC_BOND_PRESENTATION)) {
    result[subtype] = {
      visible: { ...presentation.visible },
      required: { ...presentation.required },
      text: {
        principalLabel: presentation.fields.principal.label,
        principalNote: presentation.fields.principal.description,
        purchasePriceLabel: presentation.fields.purchasePrice.label,
        annualRateLabel: presentation.fields.annualRate.label,
        annualRateNote: presentation.fields.annualRate.description
      },
      annualRateReadOnly: presentation.annualRateReadOnly,
      fields: presentation.fields
    }
  }
  return result
}

export {
  SHARED_META_FIELDS,
  GENERIC_BOND_PRESENTATION,
  getGenericBondPresentation,
  buildGenericBondSubtypeUiConfig
}
