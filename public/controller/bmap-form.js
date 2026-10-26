import {
  toInputType,
  applyNumericConstraints,
  orderedSpecFields
} from './spec-form-utils.js'
import { applyFieldChrome, ensureFieldLabelTitleElement } from './field-chrome.js'
import { getBmapFieldHelp } from './investment-field-help.js'
import { parseMoneyAmount } from './money-format.js'

const BMAP_PRODUCT_SPEC = {
  specVersion: 'v2alpha1',
  id: 'government-security.bmap.standard',
  family: 'government-security',
  variant: 'bmap',
  productCode: 'bmap',
  displayName: 'Bonus Hungarian Government Security (BMÁP)',
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
      name: 'dkjBaseYieldPct',
      type: 'number',
      label: 'DKJ Base Yield',
      required: true,
      unit: 'percent',
      description: 'Base yield derived from 3-month DKJ auction averages.',
      constraints: { minimum: -100, maximum: 100 }
    },
    {
      name: 'interestPremiumPct',
      type: 'number',
      label: 'Interest Premium',
      required: true,
      unit: 'percent',
      description: 'Fixed premium added on top of the DKJ-based yield.',
      constraints: { minimum: 0, maximum: 100 }
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
      description: 'Issue date of the BMAP series in ISO format.'
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
      description: 'Annual coupon rate for the current period, equal to effective DKJ base plus premium.'
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
      name: 'effectiveDkjBaseYieldPct',
      type: 'number',
      label: 'Effective DKJ Base Yield',
      required: true,
      unit: 'percent',
      description: 'DKJ coupon base after applying the 0% floor.'
    },
    {
      name: 'periodCouponRatePct',
      type: 'number',
      label: 'Period Coupon Rate',
      required: false,
      unit: 'percent',
      description: 'Coupon amount or rate applicable to the current coupon period using the 360-day convention.'
    },
    {
      name: 'accruedInterestAmount',
      type: 'number',
      label: 'Accrued Interest',
      required: false,
      unit: 'currency',
      description: 'Interest accrued from issue or previous coupon date to purchase or valuation date.'
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
    formTitle: 'Bonus Hungarian Government Security (BMÁP)',
    sections: [
      {
        id: 'bmap-core',
        title: 'BMAP Inputs',
        fieldNames: [
          'principal',
          'dkjBaseYieldPct',
          'interestPremiumPct',
          'startDate',
          'purchaseDate',
          'issueDate',
          'firstCouponDate'
        ]
      }
    ]
  }
}

const BMAP_FRONTEND_FIELD_ADAPTER = {
  principal: { inputId: 'bmap-principal' },
  dkjBaseYieldPct: { inputId: 'bmap-dkj-base-yield-pct' },
  interestPremiumPct: { inputId: 'bmap-interest-premium-pct' },
  startDate: { inputId: 'bmap-start-date' },
  purchaseDate: { inputId: 'bmap-purchase-date' },
  issueDate: { inputId: 'bmap-issue-date' },
  firstCouponDate: { inputId: 'bmap-first-coupon-date' }
}

function applyBmapSpecToForm({ bmapForm, bmapBox }) {
  void bmapBox
  if (!bmapForm) return

  const fields = orderedSpecFields(BMAP_PRODUCT_SPEC)
  fields.forEach((field) => {
    const adapter = BMAP_FRONTEND_FIELD_ADAPTER[field.name]
    if (!adapter) return

    const input = bmapForm.querySelector(`#${adapter.inputId}`)
    if (!input) return

    input.name = field.name
    if (field.unit === 'currency' || input.classList.contains('money-amount')) {
      input.type = 'text'
      input.setAttribute('inputmode', 'decimal')
      input.classList.add('money-amount')
    } else {
      input.type = toInputType(field)
    }
    if (input.type === 'number') {
      applyNumericConstraints(input, field.constraints)
      if (field.type === 'integer') input.step = '1'
    }

    const label = input.closest('label')
    if (label) {
      applyFieldChrome(
        label,
        {
          label: field.label,
          description: field.description || getBmapFieldHelp(field.name),
          required: Boolean(field.required),
          role: 'input',
          helpId: `${adapter.inputId}-help`,
          labelClassName: 'bmap-field-label'
        },
        input
      )
    }
  })
}

function setBmapFieldVisibility(investmentForm, visible) {
  if (!investmentForm) return
  const wrap = investmentForm.querySelector('#investment-bmap-wrap')
  if (wrap) {
    wrap.hidden = !visible
  }
}

function mapFormDataToBmapSpecInputs(formData) {
  return {
    principal: parseMoneyAmount(formData.get('principal')),
    dkjBaseYieldPct: Number(formData.get('dkjBaseYieldPct')),
    interestPremiumPct: Number(formData.get('interestPremiumPct')),
    startDate: String(formData.get('startDate') || '').trim(),
    purchaseDate: String(formData.get('purchaseDate') || '').trim() || undefined,
    issueDate: String(formData.get('issueDate') || '').trim() || undefined,
    firstCouponDate: String(formData.get('firstCouponDate') || '').trim() || undefined
  }
}

export {
  BMAP_PRODUCT_SPEC,
  BMAP_FRONTEND_FIELD_ADAPTER,
  applyBmapSpecToForm,
  setBmapFieldVisibility,
  mapFormDataToBmapSpecInputs,
  orderedSpecFields,
  ensureFieldLabelTitleElement
}
