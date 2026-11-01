import {
  toInputType,
  applyNumericConstraints,
  orderedSpecFields
} from './spec-form-utils.js'
import { applyFieldChrome, ensureFieldLabelTitleElement } from './field-chrome.js'
import { getDkjFieldHelp } from './investment-field-help.js'
import { applyDenominationToMoneyInput, parseMoneyAmount } from './money-format.js'

const DKJ_PRODUCT_SPEC = {
  specVersion: 'v2alpha1',
  id: 'government-security.dkj.standard',
  family: 'government-security',
  variant: 'dkj',
  productCode: 'dkj',
  displayName: 'Discount Treasury Bond (DKJ)',
  denominationUnit: 10000,
  inputs: [
    {
      name: 'faceValue',
      type: 'number',
      label: 'Face Value',
      required: true,
      unit: 'currency',
      description: 'Nominal value repaid at maturity.',
      constraints: { minimum: 10000 }
    },
    {
      name: 'purchasePricePct',
      type: 'number',
      label: 'Purchase Price Percent',
      required: true,
      unit: 'percent',
      description: 'Purchase price as percentage of face value.',
      constraints: { minimum: 0, maximum: 200 }
    },
    {
      name: 'termMonths',
      type: 'integer',
      label: 'Term Bucket in Months',
      required: true,
      unit: 'months',
      description: 'Product-type maturity bucket for DKJ.',
      constraints: { enum: [3, 6, 12] }
    },
    {
      name: 'settlementDate',
      type: 'string',
      label: 'Settlement Date',
      required: true,
      unit: 'date',
      description: 'Settlement date in ISO format.'
    },
    {
      name: 'maturityDate',
      type: 'string',
      label: 'Maturity Date',
      required: false,
      unit: 'date',
      description: 'Maturity date in ISO format, if known.'
    },
    {
      name: 'remainingDays',
      type: 'integer',
      label: 'Remaining Days',
      required: false,
      unit: 'days',
      description: 'Days remaining from settlement to maturity, used for annualized yield calculation.',
      constraints: { minimum: 1 }
    }
  ],
  outputs: [
    {
      name: 'purchaseAmount',
      type: 'number',
      label: 'Purchase Amount',
      required: true,
      unit: 'currency',
      description: 'Amount paid for the security at purchase.'
    },
    {
      name: 'redemptionValue',
      type: 'number',
      label: 'Redemption Value',
      required: true,
      unit: 'currency',
      description: 'Face value repaid at maturity.'
    },
    {
      name: 'grossGain',
      type: 'number',
      label: 'Gross Gain',
      required: true,
      unit: 'currency',
      description: 'Difference between redemption value and purchase amount.'
    },
    {
      name: 'simpleReturnPct',
      type: 'number',
      label: 'Simple Return',
      required: false,
      unit: 'percent',
      description: 'Gross gain relative to purchase amount.'
    },
    {
      name: 'annualizedYieldPct',
      type: 'number',
      label: 'Annualized Yield',
      required: true,
      unit: 'percent',
      description: 'Annualized yield calculated using remaining days and the official discount-bill convention.'
    }
  ],
  ui: {
    formTitle: 'Discount Treasury Bond (DKJ)',
    sections: [
      {
        id: 'dkj-core',
        title: 'DKJ Inputs',
        fieldNames: [
          'faceValue',
          'settlementDate',
          'purchasePricePct',
          'termMonths',
          'remainingDays',
          'maturityDate'
        ]
      }
    ]
  }
}

const DKJ_FRONTEND_FIELD_ADAPTER = {
  faceValue: { inputId: 'dkj-face-value', formName: 'faceValue' },
  purchasePricePct: { inputId: 'dkj-purchase-price-pct', formName: 'purchasePricePct' },
  termMonths: { inputId: 'dkj-term-months', formName: 'termMonths' },
  settlementDate: { inputId: 'dkj-settlement-date', formName: 'settlementDate' },
  maturityDate: { inputId: 'dkj-maturity-date', formName: 'maturityDate' },
  remainingDays: { inputId: 'dkj-remaining-days', formName: 'remainingDays' }
}

const DKJ_OUTPUT_PREVIEW_ADAPTER = {
  purchaseAmount: {
    inputId: 'commercial-investment-purchase-preview',
    legacyInputId: 'investment-purchase-preview'
  },
  redemptionValue: {
    inputId: 'commercial-investment-maturity-preview',
    legacyInputId: 'investment-maturity-preview'
  },
  grossGain: {
    inputId: 'commercial-investment-gain-preview',
    legacyInputId: 'investment-gain-preview'
  },
  simpleReturnPct: {
    inputId: 'commercial-investment-discount-current-value-preview',
    legacyInputId: 'investment-discount-current-value-preview'
  },
  annualizedYieldPct: {
    inputId: 'commercial-investment-discount-yield-preview',
    legacyInputId: 'investment-discount-yield-preview'
  }
}

function queryFormInput(form, adapter) {
  if (!form || !adapter) return null
  return (
    form.querySelector(`#${adapter.inputId}`) ||
    (adapter.legacyInputId ? form.querySelector(`#${adapter.legacyInputId}`) : null)
  )
}

function addMonthsToIsoDate(dateIso, months) {
  const source = new Date(`${dateIso}T00:00:00Z`)
  if (Number.isNaN(source.getTime())) return ''
  const target = new Date(
    Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + months, source.getUTCDate())
  )
  return target.toISOString().slice(0, 10)
}

function applyDkjSpecToForm({ investmentForm, investmentBox }) {
  void investmentBox
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
    } else if (field.unit === 'currency' || input.classList.contains('money-amount')) {
      input.type = 'text'
      input.setAttribute('inputmode', 'decimal')
      input.classList.add('money-amount')
      if (field.name === 'faceValue') {
        applyDenominationToMoneyInput(input, {
          denominationUnit: DKJ_PRODUCT_SPEC.denominationUnit,
          minimum: field.constraints?.minimum,
          setDefaultIfEmpty: true
        })
      }
    } else {
      input.type = toInputType(field)
      input.classList.remove('money-amount')
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
          description: field.description || getDkjFieldHelp(field.name),
          required: Boolean(field.required),
          role: 'input',
          helpId: `${adapter.inputId}-help`,
          labelClassName: 'dkj-field-label'
        },
        input
      )
    }
  })

  DKJ_PRODUCT_SPEC.outputs.forEach((field) => {
    const adapter = DKJ_OUTPUT_PREVIEW_ADAPTER[field.name]
    if (!adapter) return
    const input = queryFormInput(investmentForm, adapter)
    const label = input ? input.closest('label') : null
    if (!label) return
    const helpId = `${input.id}-help`
    applyFieldChrome(
      label,
      {
        label: field.label,
        description: field.description || getDkjFieldHelp(field.name),
        required: false,
        role: 'output',
        helpId,
        labelClassName: 'investment-field-label'
      },
      input
    )
  })
}

function setDkjFieldVisibility(investmentForm, visible) {
  if (!investmentForm) return
  const wrap = investmentForm.querySelector('#investment-dkj-wrap')
  if (wrap) {
    wrap.hidden = !visible
  }
}

function mapFormDataToDkjSpecInputs(formData) {
  return {
    faceValue: parseMoneyAmount(formData.get('faceValue') ?? formData.get('principal')),
    purchasePricePct: parseMoneyAmount(
      formData.get('purchasePricePct') ?? formData.get('purchasePrice')
    ),
    termMonths: Number(formData.get('termMonths')),
    settlementDate: String(
      formData.get('settlementDate') || formData.get('transactionDate') || ''
    ).trim(),
    maturityDate: String(formData.get('maturityDate') || formData.get('dueDate') || '').trim() || undefined,
    remainingDays: String(formData.get('remainingDays') || '').trim()
      ? Number(formData.get('remainingDays'))
      : undefined
  }
}

function mapDkjSpecInputsToInvestmentBundleInput(specInputs, meta = {}) {
  const purchasePrice = (specInputs.faceValue * specInputs.purchasePricePct) / 100
  const settlementDate = String(specInputs.settlementDate || '').trim()
  const maturityDate =
    String(specInputs.maturityDate || '').trim() ||
    addMonthsToIsoDate(settlementDate, specInputs.termMonths)

  return {
    id: meta.id,
    productId: DKJ_PRODUCT_SPEC.id,
    productSpecVersion: DKJ_PRODUCT_SPEC.specVersion,
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
  DKJ_OUTPUT_PREVIEW_ADAPTER,
  applyDkjSpecToForm,
  setDkjFieldVisibility,
  mapFormDataToDkjSpecInputs,
  mapDkjSpecInputsToInvestmentBundleInput,
  orderedSpecFields,
  ensureFieldLabelTitleElement
}
