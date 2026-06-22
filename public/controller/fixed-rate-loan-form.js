const FIXED_RATE_LOAN_PRODUCT_SPEC = {
  inputs: [
    {
      name: 'principal',
      type: 'number',
      label: 'Principal',
      required: true,
      unit: 'currency',
      constraints: {
        minimum: 1
      }
    },
    {
      name: 'annualInterestRatePct',
      type: 'number',
      label: 'Annual Interest Rate',
      required: true,
      unit: 'percent',
      constraints: {
        minimum: 0,
        maximum: 100
      }
    },
    {
      name: 'termMonths',
      type: 'integer',
      label: 'Term in Months',
      required: true,
      unit: 'months',
      constraints: {
        minimum: 1
      }
    },
    {
      name: 'startDate',
      type: 'string',
      label: 'Start Date',
      required: true,
      unit: 'date'
    }
  ],
  ui: {
    formTitle: 'Fixed Rate Loan',
    sections: [
      {
        id: 'loan-core',
        title: 'Loan Inputs',
        fieldNames: ['principal', 'annualInterestRatePct', 'termMonths', 'startDate']
      }
    ]
  }
}

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
  }
}

import { toInputType, applyNumericConstraints, orderedSpecFields } from './spec-form-utils.js'

function ensureLabelTitleElement(label) {
  let titleElement = label.querySelector('.loan-field-label')
  if (!titleElement) {
    titleElement = document.createElement('span')
    titleElement.className = 'loan-field-label'
    label.insertBefore(titleElement, label.firstChild)
    label.insertBefore(document.createTextNode(' '), titleElement.nextSibling)
  }
  return titleElement
}

// `orderedSpecFields` is imported from `spec-form-utils.js`

function reorderLoanRowBySpec(loanForm, fields) {
  const firstRow = loanForm.querySelector('.row')
  if (!firstRow) {
    return
  }

  const mappedInputIds = fields
    .map((field) => FIXED_RATE_LOAN_FRONTEND_FIELD_ADAPTER[field.name])
    .filter(Boolean)
    .map((entry) => entry.inputId)

  const mappedLabelsInOrder = fields
    .map((field) => {
      const adapter = FIXED_RATE_LOAN_FRONTEND_FIELD_ADAPTER[field.name]
      if (!adapter) {
        return null
      }
      const input = loanForm.querySelector(`#${adapter.inputId}`)
      return input ? input.closest('label') : null
    })
    .filter(Boolean)

  const remainingLabels = Array.from(firstRow.children).filter((node) => {
    const input = node.querySelector('input, select')
    return !input || !mappedInputIds.includes(input.id)
  })

  ;[...mappedLabelsInOrder, ...remainingLabels].forEach((label) => {
    firstRow.appendChild(label)
  })
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
      const titleElement = ensureLabelTitleElement(label)
      titleElement.textContent = field.label
    }
  })

  if (loanBox) {
    const summaryTitle = loanBox.querySelector('.summary-title')
    if (summaryTitle) {
      summaryTitle.textContent = FIXED_RATE_LOAN_PRODUCT_SPEC.ui.formTitle
    }
  }

  reorderLoanRowBySpec(loanForm, fields)
}

export {
  FIXED_RATE_LOAN_PRODUCT_SPEC,
  FIXED_RATE_LOAN_FRONTEND_FIELD_ADAPTER,
  applyFixedRateLoanSpecToForm,
  orderedSpecFields
}