const KTV_PRODUCT_SPEC = {
  specVersion: 'v2alpha3',
  id: 'government-security.ktv.standard',
  family: 'government-security',
  variant: 'ktv',
  productCode: 'ktv',
  displayName: 'Hungarian Government Bond (MÁK)',
  denominationUnit: 10000,
  inputs: [
    {
      name: 'principal',
      type: 'number',
      label: 'Principal',
      required: true,
      unit: 'currency',
      description:
        'Face amount you invest in forints (HUF). Official ÁKK alapcímlet is 10 000 Ft — principal must be a multiple of 10 000.',
      constraints: { minimum: 10000 }
    },
    {
      name: 'annualCouponRatePct',
      type: 'number',
      label: 'Annual Coupon Rate',
      required: true,
      unit: 'percent',
      description: 'Published effective annual coupon rate (ga). Irregular first-period payable stub is derived as ga × days/365 (ACT/365F), not a FixMÁP covering-band rate. Do not invent FLOAT rates.',
      constraints: { minimum: 0, maximum: 100 }
    },
    {
      name: 'purchaseDate',
      type: 'string',
      label: 'Purchase Date',
      required: true,
      unit: 'date',
      description: 'Date when the purchase is accounted for. Used to compute interest already earned.'
    },
    {
      name: 'issueDate',
      type: 'string',
      label: 'Issue Date',
      required: true,
      unit: 'date',
      description: 'Date this series was issued (kibocsátás napja).'
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
      description: 'First interest payment date. Prefer offering paymentDates when autofilled (2037/A — 2026-09-23).'
    },
    {
      name: 'dayCountConvention',
      type: 'string',
      label: 'Day Count Convention',
      required: false,
      unit: 'text',
      description: 'How days are counted for accrued interest and the first-period stub. Locked 2037/A witness uses ACT/365F (Actual/365). ADR 0044 ingest ACT/360 when offering dayCount is null is a quote fallback only — not product math for this series.',
      constraints: { enum: [
  'ACT/360',
  'ACT/365F',
  '30E/360'
] }
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
      description: 'Interest already earned from the previous coupon (or issue) through the purchase date. Accrues on published ga under the day-count convention (2037/A — ACT/365F), not on the payable first-period stub.'
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
    formTitle: 'Hungarian Government Bond (MÁK)',
    sections: [
      {
        id: 'ktv-core',
        title: 'MÁK Inputs',
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

export { KTV_PRODUCT_SPEC }
