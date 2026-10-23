const PMAP_PRODUCT_SPEC = {
  specVersion: 'v2alpha1',
  id: 'government-security.pmap.standard',
  family: 'government-security',
  variant: 'pmap',
  productCode: 'pmap',
  displayName: 'Premium Hungarian Government Security',
  inputs: [
    {
      name: 'principal',
      type: 'number',
      label: 'Principal',
      required: true,
      unit: 'currency',
      description: 'Invested nominal amount.',
      constraints: { minimum: 1 }
    },
    {
      name: 'interestPremiumPct',
      type: 'number',
      label: 'Interest Premium',
      required: true,
      unit: 'percent',
      description: 'Fixed premium added on top of the inflation base.',
      constraints: { minimum: 0, maximum: 100 }
    },
    {
      name: 'previousYearAverageInflationPct',
      type: 'number',
      label: 'Previous Year Average Inflation',
      required: true,
      unit: 'percent',
      description: 'Official annual average inflation for the previous calendar year.',
      constraints: { minimum: -100, maximum: 100 }
    },
    {
      name: 'startDate',
      type: 'string',
      label: 'Start Date',
      required: true,
      unit: 'date',
      description: 'Investment start date in ISO format.'
    },
    {
      name: 'purchaseDate',
      type: 'string',
      label: 'Purchase Date',
      required: false,
      unit: 'date',
      description: 'Purchase or valuation date in ISO format, used for accrued-interest-related calculations.'
    },
    {
      name: 'issueDate',
      type: 'string',
      label: 'Issue Date',
      required: false,
      unit: 'date',
      description: 'Issue date of the PMAP series in ISO format.'
    },
    {
      name: 'firstCouponDate',
      type: 'string',
      label: 'First Coupon Date',
      required: false,
      unit: 'date',
      description: 'First coupon payment date in ISO format if known.'
    }
  ],
  outputs: [
    {
      name: 'annualCouponRatePct',
      type: 'number',
      label: 'Annual Coupon Rate',
      required: true,
      unit: 'percent',
      description: 'Coupon rate for the current annual interest period.'
    },
    {
      name: 'couponPaymentFrequency',
      type: 'string',
      label: 'Coupon Payment Frequency',
      required: true,
      unit: 'text',
      description: 'Frequency of coupon payments.'
    },
    {
      name: 'effectiveInflationBasePct',
      type: 'number',
      label: 'Effective Inflation Base',
      required: true,
      unit: 'percent',
      description: 'Inflation base after applying the 0% floor for zero or negative inflation.'
    },
    {
      name: 'periodCouponRatePct',
      type: 'number',
      label: 'Period Coupon Rate',
      required: false,
      unit: 'percent',
      description: 'Coupon rate applicable to the current coupon period or first irregular period.'
    },
    {
      name: 'accruedInterestAmount',
      type: 'number',
      label: 'Accrued Interest',
      required: false,
      unit: 'currency',
      description: 'Interest accrued from issue or previous coupon date to purchase/valuation date.'
    },
    {
      name: 'purchaseAmount',
      type: 'number',
      label: 'Purchase Amount',
      required: false,
      unit: 'currency',
      description: 'Purchase amount based on principal plus accrued interest, where applicable.'
    },
    {
      name: 'redemptionValue',
      type: 'number',
      label: 'Redemption Value',
      required: true,
      unit: 'currency',
      description: 'Principal repaid at maturity.'
    }
  ],
  ui: {
    formTitle: 'Premium Hungarian Government Security',
    sections: [
      {
        id: 'pmap-core',
        title: 'PMAP Inputs',
        fieldNames: [
          'principal',
          'interestPremiumPct',
          'previousYearAverageInflationPct',
          'startDate',
          'purchaseDate',
          'issueDate',
          'firstCouponDate'
        ]
      }
    ]
  }
}

export { PMAP_PRODUCT_SPEC }
