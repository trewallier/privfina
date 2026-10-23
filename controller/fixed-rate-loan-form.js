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

const FIXED_RATE_LOAN_OUTPUT_FIELD_ADAPTER = {
  monthlyPayment: {
    inputId: 'loan-monthly-preview',
    label: 'Monthly repayment preview',
    description: 'Estimated constant monthly payment after any grace period.'
  },
  totalPaid: {
    inputId: 'loan-total-repayment-preview',
    label: 'Total repayment preview',
    description: 'Estimated sum of all scheduled payments over the full term.'
  },
  totalInterest: {
    inputId: 'loan-total-interest-preview',
    label: 'Total interest preview',
    description: 'Estimated total interest cost over the full term.'
  }
}

/** UI-only shell fields (not product-spec inputs) that still need required/optional chrome. */
const FIXED_RATE_LOAN_UI_FIELD_CHROME = [
  {
    inputId: 'loan-label',
    label: 'Label',
    required: false,
    role: 'input',
    description: 'Display name for this loan in the configured instruments list.'
  },
  {
    inputId: 'loan-term-unit',
    label: 'Term unit',
    required: false,
    role: 'input',
    description: 'Whether the term value is measured in months or years.'
  },
  {
    inputId: 'loan-repayment-day',
    label: 'Repayment day of month',
    required: false,
    role: 'input',
    description: 'Calendar day used for each scheduled monthly repayment.'
  },
  {
    inputId: 'loan-category',
    label: 'Category',
    required: false,
    role: 'input',
    description: 'Optional tag for grouping this instrument in lists and reports.'
  },
  {
    inputId: 'loan-description',
    label: 'Description',
    required: false,
    role: 'input',
    description: 'Optional free-text notes for this loan.'
  },
  {
    inputId: 'loan-include-disbursement',
    label: 'Account loan disbursement inflow',
    required: false,
    role: 'input',
    description: 'When enabled, records the principal as an inflow on the start date.'
  }
]

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
  reorderFormRowBySpec
} from './spec-form-utils.js'
import { applyFieldChrome } from './field-chrome.js'
import { parseMoneyAmount } from './money-format.js'

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
      // Currency fields use formatted text inputs (space-grouped thousands).
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
          labelClassName: 'loan-field-label'
        },
        input
      )
    }
  })

  FIXED_RATE_LOAN_UI_FIELD_CHROME.forEach((meta) => {
    const input = loanForm.querySelector(`#${meta.inputId}`)
    const label = input ? input.closest('label') : null
    if (!label) {
      return
    }
    applyFieldChrome(
      label,
      {
        label: meta.label,
        description: meta.description || '',
        required: Boolean(meta.required),
        role: meta.role || 'input',
        helpId: `${meta.inputId}-help`,
        labelClassName: 'loan-field-label'
      },
      input
    )
  })

  Object.values(FIXED_RATE_LOAN_OUTPUT_FIELD_ADAPTER).forEach((meta) => {
    const input = loanForm.querySelector(`#${meta.inputId}`)
    const label = input ? input.closest('label') : null
    if (!label) {
      return
    }
    applyFieldChrome(
      label,
      {
        label: meta.label,
        description: meta.description || '',
        required: false,
        role: 'output',
        helpId: `${meta.inputId}-help`,
        labelClassName: 'loan-field-label'
      },
      input
    )
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
    principal: parseMoneyAmount(formData.get('principal')),
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
  FIXED_RATE_LOAN_OUTPUT_FIELD_ADAPTER,
  FIXED_RATE_LOAN_UI_FIELD_CHROME,
  FIXED_RATE_LOAN_CORE_FIELD_NAMES,
  applyFixedRateLoanSpecToForm,
  mapFormDataToFixedRateLoanSpecInputs,
  orderedSpecFields
}
