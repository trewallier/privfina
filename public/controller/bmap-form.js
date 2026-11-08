import {
  toInputType,
  applyNumericConstraints,
  orderedSpecFields
} from './spec-form-utils.js'
import { applyFieldChrome, ensureFieldLabelTitleElement } from './field-chrome.js'
import { applyDenominationToMoneyInput, parseMoneyAmount } from './money-format.js'
import { parseCouponScheduleField } from './commercial-investment-coupon-profile.js'

const BMAP_PRODUCT_SPEC = {
  specVersion: 'v2alpha3',
  id: 'government-security.bmap.standard',
  family: 'government-security',
  variant: 'bmap',
  productCode: 'bmap',
  displayName: 'Bonus Hungarian Government Security (BMÁP)',
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
        'Yearly interest rate for the current period, as published (already combined; not base plus premium).',
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
        'First interest payment date when you are not supplying a full coupon schedule.'
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
    formTitle: 'Bonus Hungarian Government Security (BMÁP)',
    sections: [
      {
        id: 'bmap-core',
        title: 'BMAP Inputs',
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

const BMAP_FRONTEND_FIELD_ADAPTER = {
  principal: { inputId: 'bmap-principal' },
  annualCouponRatePct: { inputId: 'bmap-annual-coupon-rate-pct' },
  purchaseDate: { inputId: 'bmap-purchase-date' },
  issueDate: { inputId: 'bmap-issue-date' },
  maturityDate: { inputId: 'bmap-maturity-date' },
  firstCouponDate: { inputId: 'bmap-first-coupon-date' }
}

function applyBmapSpecToForm({ bmapForm, bmapBox, setAmountDefaultIfEmpty = false } = {}) {
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
      if (field.name === 'principal') {
        // Only seed defaults on create paths; edit populate must run after this apply.
        applyDenominationToMoneyInput(input, {
          denominationUnit: BMAP_PRODUCT_SPEC.denominationUnit,
          minimum: field.constraints?.minimum,
          setDefaultIfEmpty: setAmountDefaultIfEmpty
        })
      }
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
          description: field.description || '',
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
  // Main host wrap is toggled by the family registry hostWrapId (ADR 0040).
  void investmentForm
  void visible
}

function mapFormDataToBmapSpecInputs(formData) {
  return {
    principal: parseMoneyAmount(formData.get('principal')),
    annualCouponRatePct: Number(formData.get('annualCouponRatePct')),
    purchaseDate: String(formData.get('purchaseDate') || '').trim(),
    issueDate: String(formData.get('issueDate') || '').trim(),
    maturityDate: String(formData.get('maturityDate') || '').trim(),
    firstCouponDate: String(formData.get('firstCouponDate') || '').trim() || undefined,
    dayCountConvention: String(formData.get('dayCountConvention') || '').trim() || undefined,
    couponSchedule: parseCouponScheduleField(formData.get('couponSchedule'))
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
