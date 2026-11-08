const MAPP_PRODUCT_SPEC = {
  specVersion: 'v2alpha3',
  id: 'government-security.mapp.standard',
  family: 'government-security',
  variant: 'mapp',
  productCode: 'mapp',
  displayName: 'Hungarian Government Security Plus (MÁP Plusz)',
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
        'Published yearly coupon rate (p.a.) for the current period; stepped bands live in couponSchedule when present. Each payment uses the Ismertető period rate gp derived from this annual rate and couponFrequencyMonths (regular gp = ga × frequencyMonths/12; irregular first period uses the published ACT/ACT add-on).',
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
      description: 'Date this series was issued.'
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
        'First interest payment (kamatteljesítés) date. Prefer offering paymentDates when autofilled.'
    },
    {
      name: 'couponFrequencyMonths',
      type: 'integer',
      label: 'Coupon Frequency (Months)',
      required: false,
      unit: 'text',
      description:
        'Months between coupon payments for this series. Use 12 for newer annual-pay MÁP Plusz offerings and 6 for older semi-annual series. Defaults to 12 when omitted. Autofill may infer from offering paymentDates spacing.',
      constraints: { enum: [6, 12] }
    },
    {
      name: 'dayCountConvention',
      type: 'string',
      label: 'Day Count Convention',
      required: false,
      unit: 'text',
      description:
        'Accrued interest for MÁP Plusz follows the Ismertető ACT/ACT period-fraction formula (Tényleges/Tényleges). This field is retained for parity with sibling govsec hosts; MÁP Plusz calculators ignore ACT/360-style denominators for accrued.',
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
    formTitle: 'Hungarian Government Security Plus (MÁP Plusz)',
    sections: [
      {
        id: 'mapp-core',
        title: 'MÁP Plusz Inputs',
        fieldNames: [
          'principal',
          'purchaseDate',
          'annualCouponRatePct',
          'issueDate',
          'maturityDate',
          'firstCouponDate',
          'couponFrequencyMonths',
          'dayCountConvention'
        ]
      }
    ]
  }
}

export { MAPP_PRODUCT_SPEC }
