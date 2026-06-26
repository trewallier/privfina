const PMAP_PRODUCT_SPEC = {
  id: 'government-security.pmap.standard',
  family: 'government-security',
  variant: 'pmap',
  displayName: 'Prémium Magyar Állampapír',
  inputs: [
    {
      name: 'principal',
      type: 'number',
      label: 'Principal',
      required: true,
      unit: 'currency',
      constraints: { minimum: 1 }
    },
    {
      name: 'interestPremiumPct',
      type: 'number',
      label: 'Interest Premium',
      required: true,
      unit: 'percent',
      constraints: { minimum: 0, maximum: 100 }
    },
    {
      name: 'previousYearAverageInflationPct',
      type: 'number',
      label: 'Previous Year Average Inflation',
      required: true,
      unit: 'percent',
      constraints: { minimum: -100, maximum: 100 }
    },
    { name: 'startDate', type: 'string', label: 'Start Date', required: true, unit: 'date' },
    { name: 'purchaseDate', type: 'string', label: 'Purchase Date', required: false, unit: 'date' },
    { name: 'issueDate', type: 'string', label: 'Issue Date', required: false, unit: 'date' },
    {
      name: 'firstCouponDate',
      type: 'string',
      label: 'First Coupon Date',
      required: false,
      unit: 'date'
    }
  ],
  outputs: [
    {
      name: 'annualCouponRatePct',
      type: 'number',
      label: 'Annual Coupon Rate',
      required: true,
      unit: 'percent'
    },
    {
      name: 'couponPaymentFrequency',
      type: 'string',
      label: 'Coupon Payment Frequency',
      required: true,
      unit: 'text'
    },
    {
      name: 'effectiveInflationBasePct',
      type: 'number',
      label: 'Effective Inflation Base',
      required: true,
      unit: 'percent'
    },
    {
      name: 'periodCouponRatePct',
      type: 'number',
      label: 'Period Coupon Rate',
      required: false,
      unit: 'percent'
    },
    {
      name: 'accruedInterestAmount',
      type: 'number',
      label: 'Accrued Interest',
      required: false,
      unit: 'currency'
    },
    {
      name: 'purchaseAmount',
      type: 'number',
      label: 'Purchase Amount',
      required: false,
      unit: 'currency'
    },
    {
      name: 'redemptionValue',
      type: 'number',
      label: 'Redemption Value',
      required: true,
      unit: 'currency'
    }
  ],
  ui: {
    formTitle: 'Prémium Magyar Állampapír',
    sections: [
      {
        id: 'pmap-core',
        title: 'PMÁP Inputs',
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