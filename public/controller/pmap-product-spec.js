const PMAP_PRODUCT_SPEC = {
  specVersion: 'v2alpha1',
  id: 'government-security.pmap.standard',
  family: 'government-security',
  variant: 'pmap',
  productCode: 'pmap',
  displayName: 'Premium Hungarian Government Security (PMÁP)',
  denominationUnit: 1,
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
      name: 'annualCouponRatePct',
      type: 'number',
      label: 'Annual Coupon Rate',
      required: true,
      unit: 'percent',
      description:
        'Effective annual coupon rate for the applicable interest period (combined period kamat as published).',
      constraints: { minimum: 0, maximum: 100 }
    },
    {
      name: 'purchaseDate',
      type: 'string',
      label: 'Purchase Date',
      required: true,
      unit: 'date',
      description:
        'Purchase or valuation date in ISO format, used for accrued-interest-related calculations.'
    },
    {
      name: 'issueDate',
      type: 'string',
      label: 'Issue Date',
      required: true,
      unit: 'date',
      description: 'Issue date of the PMAP series in ISO format.'
    },
    {
      name: 'maturityDate',
      type: 'string',
      label: 'Maturity Date',
      required: true,
      unit: 'date',
      description: 'Maturity date of the PMAP series in ISO format.'
    },
    {
      name: 'startDate',
      type: 'string',
      label: 'Start Date',
      required: false,
      unit: 'date',
      description: 'Investment start date in ISO format; defaults to issue date when omitted.'
    },
    {
      name: 'firstCouponDate',
      type: 'string',
      label: 'First Coupon Date',
      required: false,
      unit: 'date',
      description:
        'First coupon payment date in ISO format when a full couponSchedule is not supplied.'
    },
    {
      name: 'dayCountConvention',
      type: 'string',
      label: 'Day Count Convention',
      required: false,
      unit: 'text',
      description: 'Interest day-count convention for accrued interest (default ACT/360).',
      constraints: { enum: ['ACT/360', 'ACT/365F', '30E/360'] }
    }
  ],
  outputs: [
    {
      name: 'annualCouponRatePct',
      type: 'number',
      label: 'Annual Coupon Rate',
      required: true,
      unit: 'percent',
      description: 'Effective annual coupon rate used for the current period.'
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
    }
  ],
  ui: {
    formTitle: 'Premium Hungarian Government Security (PMÁP)',
    sections: [
      {
        id: 'pmap-core',
        title: 'PMAP Inputs',
        fieldNames: [
          'principal',
          'purchaseDate',
          'annualCouponRatePct',
          'issueDate',
          'maturityDate',
          'startDate',
          'firstCouponDate',
          'dayCountConvention'
        ]
      }
    ]
  }
}

export { PMAP_PRODUCT_SPEC }
