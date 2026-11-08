import { MAPP_PRODUCT_SPEC } from './mapp-product-spec.js'
import {
  mapMappSpecInputsToLegacyInvestmentInput,
  generateMappInstrumentBundleFromSpecInputs
} from './mapp-calculation-adapter.js'
import {
  toInputType,
  applyNumericConstraints,
  orderedSpecFields
} from './spec-form-utils.js'
import { applyFieldChrome, ensureFieldLabelTitleElement } from './field-chrome.js'
import { applyDenominationToMoneyInput, parseMoneyAmount } from './money-format.js'
import { parseCouponScheduleField } from './commercial-investment-coupon-profile.js'

const MAPP_FRONTEND_FIELD_ADAPTER = {
  principal: { inputId: 'mapp-principal', formName: 'principal' },
  annualCouponRatePct: {
    inputId: 'mapp-annual-coupon-rate-pct',
    formName: 'annualCouponRatePct'
  },
  maturityDate: { inputId: 'mapp-maturity-date', formName: 'maturityDate' },
  purchaseDate: { inputId: 'mapp-purchase-date', formName: 'purchaseDate' },
  issueDate: { inputId: 'mapp-issue-date', formName: 'issueDate' },
  firstCouponDate: { inputId: 'mapp-first-coupon-date', formName: 'firstCouponDate' }
}

const MAPP_OUTPUT_PREVIEW_ADAPTER = {
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

function applyMappSpecToForm({
  investmentForm,
  investmentBox,
  setAmountDefaultIfEmpty = false
} = {}) {
  void investmentBox
  if (!investmentForm) return

  const fields = orderedSpecFields(MAPP_PRODUCT_SPEC)

  fields.forEach((field) => {
    const adapter = MAPP_FRONTEND_FIELD_ADAPTER[field.name]
    if (!adapter) return
    const input = investmentForm.querySelector(`#${adapter.inputId}`)
    if (!input) return

    input.name = adapter.formName
    if (field.unit === 'currency' || input.classList.contains('money-amount')) {
      input.type = 'text'
      input.setAttribute('inputmode', 'decimal')
      input.classList.add('money-amount')
      if (field.name === 'principal') {
        applyDenominationToMoneyInput(input, {
          denominationUnit: MAPP_PRODUCT_SPEC.denominationUnit,
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
          labelClassName: 'mapp-field-label'
        },
        input
      )
    }
  })

  MAPP_PRODUCT_SPEC.outputs.forEach((field) => {
    const adapter = MAPP_OUTPUT_PREVIEW_ADAPTER[field.name]
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

function setMappFieldVisibility(investmentForm, visible) {
  // Main host wrap is toggled by the family registry hostWrapId (ADR 0040).
  void investmentForm
  void visible
}

function parseCouponFrequencyMonths(raw) {
  const n = Number(raw)
  return n === 6 || n === 12 ? n : undefined
}

function mapFormDataToMappSpecInputs(formData) {
  return {
    principal: parseMoneyAmount(formData.get('principal')),
    annualCouponRatePct: Number(formData.get('annualCouponRatePct')),
    purchaseDate: String(formData.get('purchaseDate') || '').trim(),
    issueDate: String(formData.get('issueDate') || '').trim(),
    maturityDate: String(formData.get('maturityDate') || '').trim(),
    firstCouponDate: String(formData.get('firstCouponDate') || '').trim() || undefined,
    couponFrequencyMonths: parseCouponFrequencyMonths(formData.get('couponFrequencyMonths')),
    dayCountConvention: String(formData.get('dayCountConvention') || '').trim() || undefined,
    couponSchedule: parseCouponScheduleField(formData.get('couponSchedule'))
  }
}

function mapMappSpecInputsToInvestmentBundleInput(specInputs, meta = {}) {
  const legacyInput = mapMappSpecInputsToLegacyInvestmentInput(specInputs)

  return {
    id: meta.id,
    productId: MAPP_PRODUCT_SPEC.id,
    productSpecVersion: MAPP_PRODUCT_SPEC.specVersion,
    label: meta.label || MAPP_PRODUCT_SPEC.ui.formTitle,
    subtype: 'mapp',
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
    couponFrequencyMonths: specInputs.couponFrequencyMonths,
    dayCountConvention: specInputs.dayCountConvention,
    couponSchedule: specInputs.couponSchedule
  }
}

export {
  MAPP_PRODUCT_SPEC,
  MAPP_FRONTEND_FIELD_ADAPTER,
  MAPP_OUTPUT_PREVIEW_ADAPTER,
  applyMappSpecToForm,
  setMappFieldVisibility,
  mapFormDataToMappSpecInputs,
  mapMappSpecInputsToInvestmentBundleInput,
  generateMappInstrumentBundleFromSpecInputs,
  orderedSpecFields,
  ensureFieldLabelTitleElement
}
