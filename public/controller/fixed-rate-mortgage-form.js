/**
 * Fixed-rate mortgage form metadata seam.
 *
 * Schedule-usable (ADR 0023): shares the simplified loan composer DOM (`#loan-*`
 * fields) as a variant alongside fixed-rate-standard. Commercial published tariff notice (Hirdetmény)
 * products use the separate commercial loan composer.
 */

const FIXED_RATE_MORTGAGE_FRONTEND_FIELD_ADAPTER = {
  principal: {
    inputId: 'loan-principal',
    formName: 'principal'
  },
  annualInterestRatePct: {
    inputId: 'loan-annual-rate',
    formName: 'annualRate'
  },
  termMonths: {
    inputId: 'loan-term-value',
    formName: 'termValue'
  },
  startDate: {
    inputId: 'loan-start-date',
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
import { parseMoneyAmount } from './money-format.js'

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
    if (field.unit === 'currency' || input.classList.contains('money-amount')) {
      input.type = 'text'
      input.setAttribute('inputmode', 'decimal')
      input.classList.add('money-amount')
    } else {
      input.type = toInputType(field)
    }
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
    principal: parseMoneyAmount(formData.get('principal')),
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
