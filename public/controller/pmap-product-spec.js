const PMAP_PRODUCT_SPEC = {
  specVersion: 'v2alpha2',
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
      description: 'Face amount you invest in forints (HUF).',
      constraints: { minimum: 1 }
    },
    {
      name: 'annualCouponRatePct',
      type: 'number',
      label: 'Annual Coupon Rate',
      required: true,
      unit: 'percent',
      description:
        'Yearly interest rate for the current period, as published (already combined; not inflation plus premium).',
      constraints: { minimum: 0, maximum: 100 }
    },
    {
      name: 'purchaseDate',
      type: 'string',
      label: 'Purchase Date',
      required: true,
      unit: 'date',
      description:
        'Date when the purchase is accounted for (YYYY-MM-DD). Used to compute interest already earned.'
    },
    {
      name: 'issueDate',
      type: 'string',
      label: 'Issue Date',
      required: true,
      unit: 'date',
      description: 'Date this series was issued (YYYY-MM-DD).'
    },
    {
      name: 'maturityDate',
      type: 'string',
      label: 'Maturity Date',
      required: true,
      unit: 'date',
      description:
        'Date the bond repays principal (YYYY-MM-DD). Taken from the series; not invented by the calculator.'
    },
    {
      name: 'startDate',
      type: 'string',
      label: 'Start Date',
      required: false,
      unit: 'date',
      description: 'Optional holding start (YYYY-MM-DD). Defaults to the issue date when omitted.'
    },
    {
      name: 'firstCouponDate',
      type: 'string',
      label: 'First Coupon Date',
      required: false,
      unit: 'date',
      description:
        'First interest payment date (YYYY-MM-DD) when you are not supplying a full coupon schedule.'
    },
    {
      name: 'dayCountConvention',
      type: 'string',
      label: 'Day Count Convention',
      required: false,
      unit: 'text',
      description:
        'How days are counted for accrued interest. Defaults to actual days over a 360-day year (ACT/360).',
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
      description: 'Yearly interest rate applied for the current period.'
    },
    {
      name: 'accruedInterestAmount',
      type: 'number',
      label: 'Accrued Interest',
      required: false,
      unit: 'currency',
      description:
        'Interest already earned from the previous coupon (or issue) through the purchase date.'
    },
    {
      name: 'purchaseAmount',
      type: 'number',
      label: 'Purchase Amount',
      required: false,
      unit: 'currency',
      description: 'Total paid at purchase — principal plus accrued interest when applicable.'
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
