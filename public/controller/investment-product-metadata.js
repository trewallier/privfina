import { BMAP_PRODUCT_SPEC } from './bmap-form.js'
import { DKJ_PRODUCT_SPEC } from './dkj-form.js'
import { PMAP_PRODUCT_SPEC } from './pmap-form.js'

const FULLY_SPEC_BACKED_INVESTMENT_PRODUCTS = [
  {
    subtype: 'bmap',
    spec: BMAP_PRODUCT_SPEC,
    migrationStatus: 'fully-spec-backed'
  },
  {
    subtype: 'dkj',
    spec: DKJ_PRODUCT_SPEC,
    migrationStatus: 'fully-spec-backed'
  },
  {
    subtype: 'pmap',
    spec: PMAP_PRODUCT_SPEC,
    migrationStatus: 'fully-spec-backed'
  }
]

function findSpecInput(spec, inputName) {
  return spec.inputs.find((field) => field.name === inputName)
}

function inputLabel(spec, inputName, fallback) {
  return findSpecInput(spec, inputName)?.label || fallback
}

function inputRequired(spec, inputName) {
  return Boolean(findSpecInput(spec, inputName)?.required)
}

function inputDescription(spec, inputName, fallback = '') {
  return findSpecInput(spec, inputName)?.description || fallback
}

function resolveOptionLabel(spec) {
  return spec.ui?.formTitle || spec.displayName || spec.variant
}

function buildSpecBackedInvestmentSubtypeOptions() {
  return FULLY_SPEC_BACKED_INVESTMENT_PRODUCTS.map((entry) => ({
    value: entry.subtype,
    label: resolveOptionLabel(entry.spec),
    migrationStatus: entry.migrationStatus,
    available: true
  }))
}

/**
 * Spec-backed subtypes use dedicated host wraps; generic shell fields stay hidden.
 */
function buildDedicatedHostSubtypeUiConfig(spec, options = {}) {
  return {
    usesDedicatedHost: true,
    hostId: options.hostId,
    visible: {
      issueDate: false,
      transactionDate: false,
      dueDate: false,
      spreadRate: false,
      yearlyInflation: false,
      couponPeriod: false,
      saleDate: false,
      saleValue: false,
      discountYieldPreview: Boolean(options.discountYieldPreview),
      discountCurrentValuePreview: Boolean(options.discountCurrentValuePreview),
      inflationSchedulePreview: Boolean(options.inflationSchedulePreview),
      termMonths: false,
      remainingDays: false,
      annualRate: false,
      purchasePrice: false,
      principal: false
    },
    required: {
      issueDate: false,
      transactionDate: false,
      dueDate: false,
      purchasePrice: false,
      spreadRate: false,
      yearlyInflation: false,
      couponPeriod: false,
      annualRate: false,
      termMonths: false,
      remainingDays: false,
      principal: false
    },
    text: {
      principalLabel: inputLabel(spec, options.principalField || 'principal', 'Principal'),
      principalNote: inputDescription(spec, options.principalField || 'principal'),
      purchasePriceLabel: 'Purchase price',
      annualRateLabel: 'Annual rate',
      annualRateNote: options.annualRateNote || ''
    },
    annualRateReadOnly: Boolean(options.annualRateReadOnly),
    fields: Object.fromEntries(
      (spec.inputs || []).map((field) => [
        field.name,
        {
          label: field.label,
          description: field.description || '',
          required: Boolean(field.required),
          role: 'input'
        }
      ])
    )
  }
}

function buildSpecBackedInvestmentSubtypeUiConfig() {
  return {
    bmap: buildDedicatedHostSubtypeUiConfig(BMAP_PRODUCT_SPEC, {
      hostId: 'investment-bmap-wrap',
      annualRateNote: 'BMAP uses explicit DKJ base and premium inputs instead of the generic annual rate field.'
    }),
    dkj: buildDedicatedHostSubtypeUiConfig(DKJ_PRODUCT_SPEC, {
      hostId: 'investment-dkj-wrap',
      principalField: 'faceValue',
      discountYieldPreview: true,
      discountCurrentValuePreview: true,
      annualRateReadOnly: true,
      annualRateNote: 'Derived from DKJ purchase amount and redemption profile.'
    }),
    pmap: buildDedicatedHostSubtypeUiConfig(PMAP_PRODUCT_SPEC, {
      hostId: 'investment-pmap-wrap',
      inflationSchedulePreview: true,
      annualRateNote: 'PMAP coupon is derived from inflation base and premium inputs.'
    })
  }
}

export {
  FULLY_SPEC_BACKED_INVESTMENT_PRODUCTS,
  buildSpecBackedInvestmentSubtypeOptions,
  buildSpecBackedInvestmentSubtypeUiConfig,
  inputLabel,
  inputRequired,
  inputDescription
}
