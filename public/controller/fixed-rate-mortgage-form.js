/**
 * Fixed-rate mortgage form metadata seam.
 *
 * Intentionally parked: calculation adapter + form metadata are calc-aligned and
 * covered by tests, but there is no dedicated mortgage composer box in
 * `public/index.html` / `app-controller.js` yet. Wire those when promoting the
 * product from calc-aligned to fully-spec-backed.
 */

const FIXED_RATE_MORTGAGE_FRONTEND_FIELD_ADAPTER = {
  principal: {
    inputId: 'mortgage-principal',
    formName: 'principal'
  },
  annualInterestRatePct: {
    inputId: 'mortgage-annual-rate',
    formName: 'annualRate'
  },
  termMonths: {
    inputId: 'mortgage-term-value',
    formName: 'termValue'
  },
  startDate: {
    inputId: 'mortgage-start-date',
    formName: 'startDate'
  }
}

import { FIXED_RATE_MORTGAGE_PRODUCT_SPEC } from './fixed-rate-mortgage-product-spec.js'
import {
  toInputType,
  applyNumericConstraints,
  orderedSpecFields,
  ensureFieldLabelTitleElement,
  reorderFormRowBySpec
} from './spec-form-utils.js'

function applyFixedRateMortgageSpecToForm({ mortgageForm, mortgageBox }) {
  if (!mortgageForm) {
    return
  }

  const fields = orderedSpecFields(FIXED_RATE_MORTGAGE_PRODUCT_SPEC)
  fields.forEach((field) => {
    const adapter = FIXED_RATE_MORTGAGE_FRONTEND_FIELD_ADAPTER[field.name]
    if (!adapter) {
      return
    }

    const input = mortgageForm.querySelector(`#${adapter.inputId}`)
    if (!input) {
      return
    }

    input.name = adapter.formName
    input.type = toInputType(field)
    input.required = Boolean(field.required)
    if (input.type === 'number') {
      applyNumericConstraints(input, field.constraints)
      if (field.type === 'integer') {
        input.step = '1'
      }
    }

    const label = input.closest('label')
    if (label) {
      const titleElement = ensureFieldLabelTitleElement(label, 'mortgage-field-label')
      titleElement.textContent = field.label
    }
  })

  if (mortgageBox) {
    const summaryTitle = mortgageBox.querySelector('.summary-title')
    if (summaryTitle) {
      summaryTitle.textContent = FIXED_RATE_MORTGAGE_PRODUCT_SPEC.ui.formTitle
    }
  }

  reorderFormRowBySpec(mortgageForm, fields, FIXED_RATE_MORTGAGE_FRONTEND_FIELD_ADAPTER)
}

function mapFormDataToFixedRateMortgageSpecInputs(formData) {
  return {
    principal: Number(formData.get('principal')),
    annualInterestRatePct: Number(formData.get('annualRate')),
    termMonths: Number(formData.get('termValue')),
    startDate: String(formData.get('startDate') || '').trim()
  }
}

export {
  FIXED_RATE_MORTGAGE_PRODUCT_SPEC,
  FIXED_RATE_MORTGAGE_FRONTEND_FIELD_ADAPTER,
  applyFixedRateMortgageSpecToForm,
  mapFormDataToFixedRateMortgageSpecInputs,
  orderedSpecFields
}
