const DKJ_PRODUCT_SPEC = {
  inputs: [
    {
      name: 'faceValue',
      type: 'number',
      label: 'Face Value',
      required: true,
      unit: 'currency',
      constraints: { minimum: 10000 }
    },
    {
      name: 'purchasePricePct',
      type: 'number',
      label: 'Purchase Price Percent',
      required: true,
      unit: 'percent',
      constraints: { minimum: 0, maximum: 200 }
    },
    {
      name: 'termMonths',
      type: 'integer',
      label: 'Term Bucket in Months',
      required: true,
      unit: 'months',
      constraints: { enum: [3, 6, 12] }
    },
    {
      name: 'settlementDate',
      type: 'string',
      label: 'Settlement Date',
      required: true,
      unit: 'date'
    },
    {
      name: 'maturityDate',
      type: 'string',
      label: 'Maturity Date',
      required: false,
      unit: 'date'
    },
    {
      name: 'remainingDays',
      type: 'integer',
      label: 'Remaining Days',
      required: false,
      unit: 'days',
      constraints: { minimum: 1 }
    }
  ],
  ui: {
    formTitle: 'Discount Treasury Bond',
    sections: [
      {
        id: 'dkj-core',
        title: 'DKJ Inputs',
        fieldNames: ['faceValue', 'purchasePricePct', 'termMonths', 'settlementDate', 'maturityDate', 'remainingDays']
      }
    ]
  }
}

const DKJ_FRONTEND_FIELD_ADAPTER = {
  faceValue: { inputId: 'investment-principal', formName: 'principal' },
  purchasePricePct: { inputId: 'investment-purchase-price', formName: 'purchasePrice' },
  termMonths: { inputId: 'investment-term-months', formName: 'termMonths' },
  settlementDate: { inputId: 'investment-transaction-date', formName: 'transactionDate' },
  maturityDate: { inputId: 'investment-due-date', formName: 'dueDate' },
  remainingDays: { inputId: 'investment-remaining-days', formName: 'remainingDays' }
}

import { toInputType, applyNumericConstraints, orderedSpecFields } from './spec-form-utils.js'

function addMonthsToIsoDate(dateIso, months) {
  const source = new Date(`${dateIso}T00:00:00Z`)
  if (Number.isNaN(source.getTime())) return ''
  const target = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + months, source.getUTCDate()))
  return target.toISOString().slice(0, 10)
}

function ensureLabelTitleElement(label) {
  let titleElement = label.querySelector('.investment-field-label')
  if (!titleElement) {
    titleElement = document.createElement('span')
    titleElement.className = 'investment-field-label'
    label.insertBefore(titleElement, label.firstChild)
    label.insertBefore(document.createTextNode(' '), titleElement.nextSibling)
  }
  return titleElement
}

// `orderedSpecFields` is imported from `spec-form-utils.js`

function reorderInvestmentRowBySpec(investmentForm, fields) {
  const firstRow = investmentForm.querySelector('.row')
  if (!firstRow) return

  const mappedInputIds = fields
    .map((field) => DKJ_FRONTEND_FIELD_ADAPTER[field.name])
    .filter(Boolean)
    .map((entry) => entry.inputId)

  const mappedLabelsInOrder = fields
    .map((field) => {
      const adapter = DKJ_FRONTEND_FIELD_ADAPTER[field.name]
      if (!adapter) return null
      const input = investmentForm.querySelector(`#${adapter.inputId}`)
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

function applyDkjSpecToForm({ investmentForm, investmentBox }) {
  if (!investmentForm) return

  const fields = orderedSpecFields(DKJ_PRODUCT_SPEC)
  fields.forEach((field) => {
    const adapter = DKJ_FRONTEND_FIELD_ADAPTER[field.name]
    if (!adapter) return
    const input = investmentForm.querySelector(`#${adapter.inputId}`)
    if (!input) return

    input.name = adapter.formName
    const hasEnum = Array.isArray(field?.constraints?.enum) && field.constraints.enum.length > 0
    if (hasEnum && input.tagName === 'SELECT') {
      input.innerHTML = ''
      field.constraints.enum.forEach((value) => {
        const option = document.createElement('option')
        option.value = String(value)
        option.textContent = String(value)
        input.appendChild(option)
      })
    } else {
      input.type = toInputType(field)
    }
    input.required = Boolean(field.required)
    if (input.type === 'number') {
      applyNumericConstraints(input, field.constraints)
      if (field.type === 'integer') input.step = '1'
    }

    const label = input.closest('label')
    if (label) {
      const titleElement = ensureLabelTitleElement(label)
      titleElement.textContent = field.label
    }
  })

  if (investmentBox) {
    const summaryTitle = investmentBox.querySelector('.summary-title')
    if (summaryTitle) summaryTitle.textContent = DKJ_PRODUCT_SPEC.ui.formTitle
  }

  reorderInvestmentRowBySpec(investmentForm, fields)
}

function setDkjFieldVisibility(investmentForm, visibleFieldNames) {
  if (!investmentForm) return

  const dkjOnlyFields = ['termMonths', 'remainingDays']

  dkjOnlyFields.forEach((fieldName) => {
    const adapter = DKJ_FRONTEND_FIELD_ADAPTER[fieldName]
    if (!adapter) return
    const input = investmentForm.querySelector(`#${adapter.inputId}`)
    const label = input ? input.closest('label') : null
    if (label) {
      label.hidden = !visibleFieldNames.includes(fieldName)
    }
  })
}

function mapFormDataToDkjSpecInputs(formData) {
  return {
    faceValue: Number(formData.get('principal')),
    purchasePricePct: Number(formData.get('purchasePrice')),
    termMonths: Number(formData.get('termMonths')),
    settlementDate: String(formData.get('transactionDate') || '').trim(),
    maturityDate: String(formData.get('dueDate') || '').trim() || undefined,
    remainingDays: String(formData.get('remainingDays') || '').trim()
      ? Number(formData.get('remainingDays'))
      : undefined
  }
}

function mapDkjSpecInputsToInvestmentBundleInput(specInputs, meta = {}) {
  const purchasePrice = (specInputs.faceValue * specInputs.purchasePricePct) / 100
  const settlementDate = String(specInputs.settlementDate || '').trim()
  const maturityDate = String(specInputs.maturityDate || '').trim() || addMonthsToIsoDate(settlementDate, specInputs.termMonths)

  return {
    id: meta.id,
    label: meta.label || 'Discount Treasury Bond',
    subtype: 'dkj',
    purchaseDate: settlementDate,
    maturityDate,
    issueDate: settlementDate,
    transactionDate: settlementDate,
    dueDate: maturityDate,
    principal: Number(specInputs.faceValue),
    purchasePrice,
    annualRate: undefined,
    spreadRate: undefined,
    yearlyInflationRaw: '',
    saleDate: '',
    saleValue: undefined,
    couponPeriod: '',
    category: meta.category || 'investment',
    description: meta.description,
    createdAt: meta.createdAt,
    termMonths: specInputs.termMonths,
    remainingDays: specInputs.remainingDays,
    purchasePricePct: specInputs.purchasePricePct
  }
}

export {
  DKJ_PRODUCT_SPEC,
  DKJ_FRONTEND_FIELD_ADAPTER,
  applyDkjSpecToForm,
  setDkjFieldVisibility,
  mapFormDataToDkjSpecInputs,
  mapDkjSpecInputsToInvestmentBundleInput,
  orderedSpecFields
}
