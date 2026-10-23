import { PMAP_PRODUCT_SPEC } from './pmap-product-spec.js'
import { mapPmapSpecInputsToLegacyInvestmentInput } from './pmap-calculation-adapter.js'
import {
  toInputType,
  applyNumericConstraints,
  orderedSpecFields
} from './spec-form-utils.js'
import { applyFieldChrome, ensureFieldLabelTitleElement } from './field-chrome.js'
import { getPmapFieldHelp } from './investment-field-help.js'
import { parseMoneyAmount } from './money-format.js'

const PMAP_FRONTEND_FIELD_ADAPTER = {
  principal: { inputId: 'pmap-principal', formName: 'principal' },
  interestPremiumPct: { inputId: 'pmap-interest-premium-pct', formName: 'interestPremiumPct' },
  previousYearAverageInflationPct: {
    inputId: 'pmap-previous-year-inflation-pct',
    formName: 'previousYearAverageInflationPct'
  },
  startDate: { inputId: 'pmap-start-date', formName: 'startDate' },
  purchaseDate: { inputId: 'pmap-purchase-date', formName: 'purchaseDate' },
  issueDate: { inputId: 'pmap-issue-date', formName: 'issueDate' },
  firstCouponDate: { inputId: 'pmap-first-coupon-date', formName: 'firstCouponDate' }
}

const PMAP_OUTPUT_PREVIEW_ADAPTER = {
  redemptionValue: {
    inputId: 'commercial-investment-maturity-preview',
    legacyInputId: 'investment-maturity-preview'
  },
  annualCouponRatePct: {
    inputId: 'commercial-investment-inflation-schedule-preview',
    legacyInputId: 'investment-inflation-schedule-preview'
  },
  couponPaymentFrequency: {
    inputId: 'commercial-investment-inflation-schedule-preview',
    legacyInputId: 'investment-inflation-schedule-preview'
  }
}

function queryFormInput(form, adapter) {
  if (!form || !adapter) return null
  return (
    form.querySelector(`#${adapter.inputId}`) ||
    (adapter.legacyInputId ? form.querySelector(`#${adapter.legacyInputId}`) : null)
  )
}

function applyPmapSpecToForm({ investmentForm, investmentBox }) {
  void investmentBox
  if (!investmentForm) return

  const fields = orderedSpecFields(PMAP_PRODUCT_SPEC)

  fields.forEach((field) => {
    const adapter = PMAP_FRONTEND_FIELD_ADAPTER[field.name]
    if (!adapter) return
    const input = investmentForm.querySelector(`#${adapter.inputId}`)
    if (!input) return

    input.name = adapter.formName
    if (field.unit === 'currency' || input.classList.contains('money-amount')) {
      input.type = 'text'
      input.setAttribute('inputmode', 'decimal')
      input.classList.add('money-amount')
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
          description: field.description || getPmapFieldHelp(field.name),
          required: Boolean(field.required),
          role: 'input',
          helpId: `${adapter.inputId}-help`,
          labelClassName: 'pmap-field-label'
        },
        input
      )
    }
  })

  const inflationPreview = queryFormInput(
    investmentForm,
    PMAP_OUTPUT_PREVIEW_ADAPTER.annualCouponRatePct
  )
  const inflationLabel = inflationPreview ? inflationPreview.closest('label') : null
  if (inflationLabel) {
    applyFieldChrome(
      inflationLabel,
      {
        label: 'Coupon preview',
        description:
          getPmapFieldHelp('annualCouponRatePct') +
          ' ' +
          getPmapFieldHelp('couponPaymentFrequency'),
        required: false,
        role: 'output',
        helpId: `${inflationPreview.id}-help`,
        labelClassName: 'investment-field-label'
      },
      inflationPreview
    )
  }

  const maturityPreview = queryFormInput(
    investmentForm,
    PMAP_OUTPUT_PREVIEW_ADAPTER.redemptionValue
  )
  const maturityLabel = maturityPreview ? maturityPreview.closest('label') : null
  if (maturityLabel) {
    applyFieldChrome(
      maturityLabel,
      {
        label: 'Redemption Value',
        description: getPmapFieldHelp('redemptionValue'),
        required: false,
        role: 'output',
        helpId: `${maturityPreview.id}-help`,
        labelClassName: 'investment-field-label'
      },
      maturityPreview
    )
  }
}

function setPmapFieldVisibility(investmentForm, visible) {
  if (!investmentForm) return
  const wrap = investmentForm.querySelector('#investment-pmap-wrap')
  if (wrap) {
    wrap.hidden = !visible
  }
}

function mapFormDataToPmapSpecInputs(formData) {
  return {
    principal: parseMoneyAmount(formData.get('principal')),
    interestPremiumPct: Number(
      formData.get('interestPremiumPct') ?? formData.get('spreadRate')
    ),
    previousYearAverageInflationPct: Number(
      formData.get('previousYearAverageInflationPct') ?? formData.get('yearlyInflation')
    ),
    startDate: String(formData.get('startDate') || '').trim(),
    purchaseDate: String(formData.get('purchaseDate') || '').trim() || undefined,
    issueDate: String(formData.get('issueDate') || '').trim() || undefined,
    firstCouponDate: String(formData.get('firstCouponDate') || '').trim() || undefined
  }
}

function mapPmapSpecInputsToInvestmentBundleInput(specInputs, meta = {}) {
  const legacyInput = mapPmapSpecInputsToLegacyInvestmentInput(specInputs)

  return {
    id: meta.id,
    productId: PMAP_PRODUCT_SPEC.id,
    productSpecVersion: PMAP_PRODUCT_SPEC.specVersion,
    label: meta.label || PMAP_PRODUCT_SPEC.ui.formTitle,
    subtype: 'inflation-linked-bond',
    purchaseDate: legacyInput.transactionDate,
    maturityDate: legacyInput.dueDate,
    issueDate: legacyInput.issueDate,
    transactionDate: legacyInput.transactionDate,
    dueDate: legacyInput.dueDate,
    principal: legacyInput.principal,
    purchasePrice: undefined,
    annualRate: undefined,
    spreadRate: legacyInput.spreadRate,
    yearlyInflationRaw: legacyInput.yearlyInflationRaw,
    saleDate: '',
    saleValue: undefined,
    couponPeriod: specInputs.firstCouponDate || '',
    category: meta.category || 'investment',
    description: meta.description,
    createdAt: meta.createdAt,
    interestPremiumPct: specInputs.interestPremiumPct,
    previousYearAverageInflationPct: specInputs.previousYearAverageInflationPct,
    startDate: specInputs.startDate,
    firstCouponDate: specInputs.firstCouponDate
  }
}

export {
  PMAP_PRODUCT_SPEC,
  PMAP_FRONTEND_FIELD_ADAPTER,
  PMAP_OUTPUT_PREVIEW_ADAPTER,
  applyPmapSpecToForm,
  setPmapFieldVisibility,
  mapFormDataToPmapSpecInputs,
  mapPmapSpecInputsToInvestmentBundleInput,
  orderedSpecFields,
  ensureFieldLabelTitleElement
}
