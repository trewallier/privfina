import {
  toInputType,
  applyNumericConstraints,
  orderedSpecFields
} from './spec-form-utils.js'
import { applyFieldChrome, ensureFieldLabelTitleElement } from './field-chrome.js'
import { getBmapFieldHelp } from './investment-field-help.js'
import { applyDenominationToMoneyInput, parseMoneyAmount } from './money-format.js'

const BMAP_PRODUCT_SPEC = {
  specVersion: 'v2alpha1',
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
      description: 'Issue date of the BMAP series in ISO format.'
    },
    {
      name: 'maturityDate',
      type: 'string',
      label: 'Maturity Date',
      required: true,
      unit: 'date',
      description: 'Maturity date of the BMAP series in ISO format.'
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
      description: 'Interest accrued from issue or previous coupon date to purchase or valuation date.'
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
          'startDate',
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
  startDate: { inputId: 'bmap-start-date' },
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
    annualCouponRatePct: Number(formData.get('annualCouponRatePct')),
    purchaseDate: String(formData.get('purchaseDate') || '').trim(),
    issueDate: String(formData.get('issueDate') || '').trim(),
    maturityDate: String(formData.get('maturityDate') || '').trim(),
    startDate: String(formData.get('startDate') || '').trim() || undefined,
    firstCouponDate: String(formData.get('firstCouponDate') || '').trim() || undefined,
    dayCountConvention: String(formData.get('dayCountConvention') || '').trim() || undefined
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
