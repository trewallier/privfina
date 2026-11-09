const BABA_PRODUCT_SPEC = {
  specVersion: 'v2alpha3',
  id: 'government-security.baba.standard',
  family: 'government-security',
  variant: 'baba',
  productCode: 'baba',
  displayName: 'Baby Bond (Babakötvény)',
  denominationUnit: 1,
  inputs: [
    {
      name: 'principal',
      type: 'number',
      label: 'Principal',
      required: true,
      unit: 'currency',
      description: 'Face amount you invest in forints (HUF). Denomination unit is 1 HUF.',
      constraints: { minimum: 1 }
    },
    {
      name: 'annualCouponRatePct',
      type: 'number',
      label: 'Annual Coupon Rate',
      required: true,
      unit: 'percent',
      description:
        'Published yearly coupon rate (p.a.) for the current period (effective rate = KSH prior-year average CPI floored at 0% + series interest premium). Stepped bands live in couponSchedule when present. Do not require separate CPI and premium composer inputs.',
      constraints: { minimum: 0, maximum: 100 }
    },
    {
      name: 'purchaseDate',
      type: 'string',
      label: 'Purchase Date',
      required: true,
      unit: 'date',
      description:
        'Date when the purchase is accounted for. Used to compute interest already earned.'
    },
    {
      name: 'issueDate',
      type: 'string',
      label: 'Issue Date',
      required: true,
      unit: 'date',
      description: 'Date this series was issued (kamatozás kezdőnapja).'
    },
    {
      name: 'maturityDate',
      type: 'string',
      label: 'Maturity Date',
      required: true,
      unit: 'date',
      description: 'Date the bond repays principal. Taken from the series when autofilled.'
    },
    {
      name: 'firstCouponDate',
      type: 'string',
      label: 'First Coupon Date',
      required: false,
      unit: 'date',
      description:
        'First interest payment date. Prefer offering paymentDates when autofilled (2045/S — every 1 February; first 2027-02-01).'
    },
    {
      name: 'dayCountConvention',
      type: 'string',
      label: 'Day Count Convention',
      required: false,
      unit: 'text',
      description:
        'Accrued interest and irregular first-period cash coupons follow the Ismertető ACT/ACT (Tényleges/tényleges) period-fraction formulas. This field is retained for parity with sibling govsec hosts; Babakötvény calculators use ACT/ACT for accrued and first-period gp.',
      constraints: { enum: ['ACT/ACT', 'ACT/360', 'ACT/365F', '30E/360'] }
    }
  ],
  outputs: [
    {
      name: 'annualCouponRatePct',
      type: 'number',
      label: 'Annual Coupon Rate',
      required: true,
      unit: 'percent',
      description: 'Yearly interest rate (ga) applied for the current period.'
    },
    {
      name: 'accruedInterestAmount',
      type: 'number',
      label: 'Accrued Interest',
      required: false,
      unit: 'currency',
      description:
        'Interest already earned through the purchase date per the Ismertető ACT/ACT period-fraction formula (irregular first period supported).'
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
    formTitle: 'Baby Bond (Babakötvény)',
    sections: [
      {
        id: 'baba-core',
        title: 'Babakötvény Inputs',
        fieldNames: [
          'principal',
          'purchaseDate',
          'annualCouponRatePct',
          'issueDate',
          'maturityDate',
          'firstCouponDate',
          'dayCountConvention'
        ]
      }
    ]
  }
}

export { BABA_PRODUCT_SPEC }
