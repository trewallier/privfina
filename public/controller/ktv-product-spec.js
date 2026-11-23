/** Machine-readable FLOAT reset rules (mirrors product.yaml indexReset / ADR 0047). */
const KTV_INDEX_RESET = Object.freeze({
  tenor: '3M',
  observationBusinessDaysBefore: 3,
  calendarId: 'HU-VIBER',
  roundToPct: 0.01,
  floorPct: 0.01,
  dayCountConvention: 'ACT/360',
  periodMonths: 3
})

const KTV_PRODUCT_SPEC = {
  specVersion: 'v2alpha3',
  id: 'government-security.ktv.standard',
  family: 'government-security',
  variant: 'ktv',
  productCode: 'ktv',
  displayName: 'Hungarian Government Bond (MÁK)',
  denominationUnit: 10000,
  referenceIndex: 'bubor',
  indexReset: KTV_INDEX_RESET,
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
      description:
        'Published effective annual coupon rate (ga) for FIX, or the FLOAT period rate resolved from indexReset + refs/bubor.json + refs/settlement-calendar.json at calculation / SPA autofill time. Never invent rates; never persist resolved FLOAT rates into families/ktv/coupons.',
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
      description:
        'First interest payment date. Prefer offering paymentDates when autofilled (2037/A — 2026-09-23). FLOAT turns prefer offering paymentDates; else maturity-anniversary every periodMonths.'
    },
    {
      name: 'dayCountConvention',
      type: 'string',
      label: 'Day Count Convention',
      required: false,
      unit: 'text',
      description:
        'How days are counted for accrued interest and stubs. Locked FIX 2037/A uses ACT/365F. FLOAT indexReset uses ACT/360. ADR 0044 ingest ACT/360 when offering dayCount is null is a quote fallback only — not product math for FIX 2037/A.',
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
      description:
        'Interest already earned from the previous coupon (or issue) through the purchase date. FIX accrues on published ga under ACT/365F; FLOAT accrues under indexReset ACT/360 when the period rate is known.'
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
          'issueDate',
          'maturityDate'
        ]
      }
    ]
  }
}

export { KTV_PRODUCT_SPEC, KTV_INDEX_RESET }
