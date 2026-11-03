import { PMAP_PRODUCT_SPEC } from './pmap-product-spec.js'
import {
  mapPmapSpecInputsToLegacyInvestmentInput,
  generatePmapInstrumentBundleFromSpecInputs
} from './pmap-calculation-adapter.js'
import {
  toInputType,
  applyNumericConstraints,
  orderedSpecFields
} from './spec-form-utils.js'
import { applyFieldChrome, ensureFieldLabelTitleElement } from './field-chrome.js'
import { applyDenominationToMoneyInput, parseMoneyAmount } from './money-format.js'

const PMAP_FRONTEND_FIELD_ADAPTER = {
  principal: { inputId: 'pmap-principal', formName: 'principal' },
  annualCouponRatePct: {
    inputId: 'pmap-annual-coupon-rate-pct',
    formName: 'annualCouponRatePct'
  },
  maturityDate: { inputId: 'pmap-maturity-date', formName: 'maturityDate' },
  purchaseDate: { inputId: 'pmap-purchase-date', formName: 'purchaseDate' },
  issueDate: { inputId: 'pmap-issue-date', formName: 'issueDate' },
  firstCouponDate: { inputId: 'pmap-first-coupon-date', formName: 'firstCouponDate' }
}

const PMAP_OUTPUT_PREVIEW_ADAPTER = {
  purchaseAmount: {
    inputId: 'commercial-investment-purchase-preview',
    legacyInputId: 'investment-purchase-preview'
  },
  annualCouponRatePct: {
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

function applyPmapSpecToForm({
  investmentForm,
  investmentBox,
  setAmountDefaultIfEmpty = false
} = {}) {
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
      if (field.name === 'principal') {
        // Only seed defaults on create paths; edit populate must run after this apply.
        applyDenominationToMoneyInput(input, {
          denominationUnit: PMAP_PRODUCT_SPEC.denominationUnit,
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
          labelClassName: 'pmap-field-label'
        },
        input
      )
    }
  })

  PMAP_PRODUCT_SPEC.outputs.forEach((field) => {
    const adapter = PMAP_OUTPUT_PREVIEW_ADAPTER[field.name]
    if (!adapter) return
    const input = queryFormInput(investmentForm, adapter)
    const label = input ? input.closest('label') : null
    if (!label) return
    applyFieldChrome(
      label,
      {
        label: field.label,
        description: field.description || '',
        required: false,
        role: 'output',
        helpId: `${input.id}-help`,
        labelClassName: 'investment-field-label'
      },
      input
    )
  })
}

function setPmapFieldVisibility(investmentForm, visible) {
  if (!investmentForm) return
  const wrap = investmentForm.querySelector('#investment-pmap-wrap')
  if (wrap) {
    wrap.hidden = !visible
  }
}

function parseCouponScheduleField(raw) {
  const text = String(raw || '').trim()
  if (!text) return undefined
  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : undefined
  } catch {
    return undefined
  }
}

function mapFormDataToPmapSpecInputs(formData) {
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

function mapPmapSpecInputsToInvestmentBundleInput(specInputs, meta = {}) {
  const legacyInput = mapPmapSpecInputsToLegacyInvestmentInput(specInputs)

  return {
    id: meta.id,
    productId: PMAP_PRODUCT_SPEC.id,
    productSpecVersion: PMAP_PRODUCT_SPEC.specVersion,
    label: meta.label || PMAP_PRODUCT_SPEC.ui.formTitle,
    subtype: 'pmap',
    purchaseDate: legacyInput.transactionDate,
    maturityDate: legacyInput.dueDate,
    issueDate: legacyInput.issueDate,
    transactionDate: legacyInput.transactionDate,
    dueDate: legacyInput.dueDate,
    principal: legacyInput.principal,
    purchasePrice: undefined,
    annualRate: undefined,
    spreadRate: undefined,
    yearlyInflationRaw: '',
    saleDate: '',
    saleValue: undefined,
    couponPeriod: specInputs.firstCouponDate || '',
    category: meta.category || 'investment',
    description: meta.description,
    createdAt: meta.createdAt,
    annualCouponRatePct: specInputs.annualCouponRatePct,
    firstCouponDate: specInputs.firstCouponDate,
    dayCountConvention: specInputs.dayCountConvention,
    couponSchedule: specInputs.couponSchedule
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
  generatePmapInstrumentBundleFromSpecInputs,
  orderedSpecFields,
  ensureFieldLabelTitleElement
}
