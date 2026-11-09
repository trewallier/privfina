import { BMAP_PRODUCT_SPEC } from './bmap-product-spec.js'
import {
  toInputType,
  applyNumericConstraints,
  orderedSpecFields
} from './spec-form-utils.js'
import { applyFieldChrome, ensureFieldLabelTitleElement } from './field-chrome.js'
import { applyDenominationToMoneyInput, parseMoneyAmount } from './money-format.js'
import { parseCouponScheduleField } from './commercial-investment-coupon-profile.js'

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
