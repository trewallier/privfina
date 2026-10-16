const FIXED_RATE_LOAN_FRONTEND_FIELD_ADAPTER = {
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
  },
  gracePeriodMonths: {
    inputId: 'loan-grace-period-months',
    formName: 'gracePeriodMonths'
  },
  capitalizeInterestAtGraceEnd: {
    inputId: 'loan-capitalize-interest-at-grace-end',
    formName: 'capitalizeInterestAtGraceEnd'
  }
}

const FIXED_RATE_LOAN_CORE_FIELD_NAMES = [
  'principal',
  'annualInterestRatePct',
  'termMonths',
  'startDate'
]

import { FIXED_RATE_LOAN_PRODUCT_SPEC } from './fixed-rate-loan-product-spec.js'
import {
  toInputType,
  applyNumericConstraints,
  orderedSpecFields,
  ensureFieldLabelTitleElement,
  reorderFormRowBySpec
} from './spec-form-utils.js'

function mapLoanTermValueToMonths(termValue, termUnit) {
  const numericTermValue = Number(termValue)
  const normalizedTermUnit = String(termUnit || 'months').trim().toLowerCase() === 'years' ? 'years' : 'months'
  return normalizedTermUnit === 'years' ? numericTermValue * 12 : numericTermValue
}

function normalizeOptionalGracePeriodMonths(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return 0
  }

  const gracePeriodMonths = Number(value)
  if (!Number.isInteger(gracePeriodMonths) || gracePeriodMonths < 0) {
    throw new Error('Grace period months must be a non-negative integer.')
  }

  return gracePeriodMonths
}

function applyFixedRateLoanSpecToForm({ loanForm, loanBox }) {
  if (!loanForm) {
    return
  }

  const fields = orderedSpecFields(FIXED_RATE_LOAN_PRODUCT_SPEC)
  fields.forEach((field) => {
    const adapter = FIXED_RATE_LOAN_FRONTEND_FIELD_ADAPTER[field.name]
    if (!adapter) {
      return
    }

    const input = loanForm.querySelector(`#${adapter.inputId}`)
    if (!input) {
      return
    }

    input.name = adapter.formName
    if (input.type !== 'checkbox') {
      input.type = toInputType(field)
      input.required = Boolean(field.required)
      if (input.type === 'number') {
        applyNumericConstraints(input, field.constraints)
        if (field.type === 'integer') {
          input.step = '1'
        }
      }
    }

    const label = input.closest('label')
    if (label) {
      const titleElement = ensureFieldLabelTitleElement(label, 'loan-field-label')
      titleElement.textContent = field.label
    }
  })

  if (loanBox) {
    const summaryTitle = loanBox.querySelector('.summary-title')
    if (summaryTitle) {
      summaryTitle.textContent = FIXED_RATE_LOAN_PRODUCT_SPEC.ui.formTitle
    }
  }

  const coreFields = fields.filter((field) => FIXED_RATE_LOAN_CORE_FIELD_NAMES.includes(field.name))
  reorderFormRowBySpec(loanForm, coreFields, FIXED_RATE_LOAN_FRONTEND_FIELD_ADAPTER)
}

function mapFormDataToFixedRateLoanSpecInputs(formData) {
  const termUnit = String(formData.get('termUnit') || 'months').trim().toLowerCase()
  const termValue = Number(formData.get('termValue'))
  const gracePeriodMonths = normalizeOptionalGracePeriodMonths(formData.get('gracePeriodMonths'))
  const capitalizeInterestAtGraceEnd =
    gracePeriodMonths > 0 &&
    (formData.get('capitalizeInterestAtGraceEnd') === 'on' ||
      formData.get('capitalizeInterestAtGraceEnd') === true ||
      formData.get('capitalizeInterestAtGraceEnd') === 'true')

  return {
    principal: Number(formData.get('principal')),
    annualInterestRatePct: Number(formData.get('annualRate')),
    termMonths: mapLoanTermValueToMonths(termValue, termUnit),
    startDate: String(formData.get('startDate') || '').trim(),
    gracePeriodMonths,
    capitalizeInterestAtGraceEnd
  }
}

export {
  FIXED_RATE_LOAN_PRODUCT_SPEC,
  FIXED_RATE_LOAN_FRONTEND_FIELD_ADAPTER,
  FIXED_RATE_LOAN_CORE_FIELD_NAMES,
  applyFixedRateLoanSpecToForm,
  mapFormDataToFixedRateLoanSpecInputs,
  orderedSpecFields
}
