import {
  toInputType,
  applyNumericConstraints,
  orderedSpecFields
} from './spec-form-utils.js'
import { applyFieldChrome, ensureFieldLabelTitleElement } from './field-chrome.js'
import { applyDenominationToMoneyInput, parseMoneyAmount } from './money-format.js'

const DKJ_PRODUCT_SPEC = {
  specVersion: 'v2alpha2',
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
      description: 'Amount repaid at maturity in forints (HUF).',
      constraints: { minimum: 10000 }
    },
    {
      name: 'purchasePricePct',
      type: 'number',
      label: 'Purchase Price Percent',
      required: true,
      unit: 'percent',
      description: 'Price paid as a percent of face value (for example 99.5 means below par).',
      constraints: { minimum: 0, maximum: 200 }
    },
    {
      name: 'termMonths',
      type: 'integer',
      label: 'Term Bucket in Months',
      required: true,
      unit: 'months',
      description: 'Official DKJ term bucket (3, 6, or 12 months). Does not invent a maturity date.',
      constraints: { enum: [3, 6, 12] }
    },
    {
      name: 'settlementDate',
      type: 'string',
      label: 'Settlement Date',
      required: true,
      unit: 'date',
      description: 'Date the purchase settles (YYYY-MM-DD).'
    },
    {
      name: 'maturityDate',
      type: 'string',
      label: 'Maturity Date',
      required: true,
      unit: 'date',
      description:
        'Date face value is repaid (YYYY-MM-DD). Required — the calculator does not invent it from the term bucket.'
    },
    {
      name: 'dayCountConvention',
      type: 'string',
      label: 'Day Count Convention',
      required: false,
      unit: 'text',
      description:
        'Year length used when annualizing return. Defaults to actual days over a 360-day year (ACT/360).',
      constraints: { enum: ['ACT/360', 'ACT/365F', '30E/360'] }
    }
  ],
  outputs: [
    {
      name: 'purchaseAmount',
      type: 'number',
      label: 'Purchase Amount',
      required: true,
      unit: 'currency',
      description: 'Cash paid at settlement.'
    },
    {
      name: 'redemptionValue',
      type: 'number',
      label: 'Redemption Value',
      required: true,
      unit: 'currency',
      description: 'Face amount repaid at maturity.'
    },
    {
      name: 'grossGain',
      type: 'number',
      label: 'Gross Gain',
      required: true,
      unit: 'currency',
      description: 'Redemption value minus purchase amount.'
    },
    {
      name: 'simpleReturnPct',
      type: 'number',
      label: 'Simple Return',
      required: false,
      unit: 'percent',
      description: 'Gross gain as a percent of the purchase amount.'
    },
    {
      name: 'annualizedYieldPct',
      type: 'number',
      label: 'Annualized Yield',
      required: true,
      unit: 'percent',
      description:
        'Holding-period return scaled to a yearly rate using remaining days and the day-count year length.'
    },
    {
      name: 'remainingDays',
      type: 'integer',
      label: 'Remaining Days',
      required: false,
      unit: 'days',
      description: 'Calendar days from settlement to maturity, used for the yearly yield.'
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
          'maturityDate',
          'dayCountConvention'
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

function applyDkjSpecToForm({
  investmentForm,
  investmentBox,
  setAmountDefaultIfEmpty = false
} = {}) {
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
        // Only seed defaults on create paths; edit populate must run after this apply.
        applyDenominationToMoneyInput(input, {
          denominationUnit: DKJ_PRODUCT_SPEC.denominationUnit,
          minimum: field.constraints?.minimum,
          setDefaultIfEmpty: setAmountDefaultIfEmpty
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
          description: field.description || '',
          required: Boolean(field.required),
          role: 'input',
          helpId: `${adapter.inputId}-help`,
          labelClassName: 'dkj-field-label'
        },
        input
      )
    }
  })

  // remainingDays is derived (settlement → maturity), not a primary input.
  const remainingAdapter = DKJ_FRONTEND_FIELD_ADAPTER.remainingDays
  const remainingInput = investmentForm.querySelector(`#${remainingAdapter.inputId}`)
  if (remainingInput) {
    remainingInput.name = remainingAdapter.formName
    remainingInput.readOnly = true
    const remainingOutput = DKJ_PRODUCT_SPEC.outputs.find((field) => field.name === 'remainingDays')
    const remainingLabel = remainingInput.closest('label')
    if (remainingLabel) {
      applyFieldChrome(
        remainingLabel,
        {
          label: remainingOutput?.label || 'Remaining Days',
          description: remainingOutput?.description || '',
          required: false,
          role: 'derived',
          helpId: `${remainingAdapter.inputId}-help`,
          labelClassName: 'dkj-field-label'
        },
        remainingInput
      )
    }
  }

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
        description: field.description || '',
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
    maturityDate: String(formData.get('maturityDate') || formData.get('dueDate') || '').trim(),
    dayCountConvention: String(formData.get('dayCountConvention') || '').trim() || undefined,
    // Derived autofill target; adapter re-derives when omitted.
    remainingDays: String(formData.get('remainingDays') || '').trim()
      ? Number(formData.get('remainingDays'))
      : undefined
  }
}

function calendarDaysBetween(settlementDate, maturityDate) {
  const start = new Date(`${settlementDate}T00:00:00Z`)
  const end = new Date(`${maturityDate}T00:00:00Z`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return undefined
  }
  return Math.floor((end.getTime() - start.getTime()) / 86400000)
}

function mapDkjSpecInputsToInvestmentBundleInput(specInputs, meta = {}) {
  const purchasePrice = (specInputs.faceValue * specInputs.purchasePricePct) / 100
  const settlementDate = String(specInputs.settlementDate || '').trim()
  const maturityDate = String(specInputs.maturityDate || '').trim()
  if (!maturityDate) {
    throw new Error('maturityDate is required.')
  }
  const remainingDays =
    specInputs.remainingDays !== undefined &&
    specInputs.remainingDays !== null &&
    specInputs.remainingDays !== ''
      ? Number(specInputs.remainingDays)
      : calendarDaysBetween(settlementDate, maturityDate)

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
    remainingDays,
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
