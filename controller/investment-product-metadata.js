import { BMAP_PRODUCT_SPEC } from './bmap-form.js'
import { DKJ_PRODUCT_SPEC, DKJ_FRONTEND_FIELD_ADAPTER } from './dkj-form.js'
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

function buildDkjSubtypeUiConfig() {
  return {
    visible: {
      issueDate: false,
      transactionDate: true,
      dueDate: true,
      spreadRate: false,
      yearlyInflation: false,
      couponPeriod: false,
      saleDate: false,
      saleValue: false,
      discountYieldPreview: true,
      discountCurrentValuePreview: true,
      inflationSchedulePreview: false,
      termMonths: Boolean(DKJ_FRONTEND_FIELD_ADAPTER.termMonths),
      remainingDays: Boolean(DKJ_FRONTEND_FIELD_ADAPTER.remainingDays)
    },
    required: {
      issueDate: false,
      transactionDate: inputRequired(DKJ_PRODUCT_SPEC, 'settlementDate'),
      dueDate: inputRequired(DKJ_PRODUCT_SPEC, 'maturityDate'),
      purchasePrice: inputRequired(DKJ_PRODUCT_SPEC, 'purchasePricePct'),
      spreadRate: false,
      yearlyInflation: false,
      couponPeriod: false,
      annualRate: false,
      termMonths: inputRequired(DKJ_PRODUCT_SPEC, 'termMonths'),
      remainingDays: inputRequired(DKJ_PRODUCT_SPEC, 'remainingDays')
    },
    text: {
      principalLabel: inputLabel(DKJ_PRODUCT_SPEC, 'faceValue', 'Face Value'),
      principalNote: 'Nominal value repaid at maturity.',
      purchasePriceLabel: inputLabel(
        DKJ_PRODUCT_SPEC,
        'purchasePricePct',
        'Purchase Price Percent'
      ),
      annualRateLabel: 'Annual rate (derived)',
      annualRateNote: 'Derived from DKJ purchase amount and redemption profile.'
    },
    annualRateReadOnly: true
  }
}

function buildBmapSubtypeUiConfig() {
  return {
    visible: {
      issueDate: false,
      transactionDate: false,
      dueDate: false,
      spreadRate: false,
      yearlyInflation: false,
      couponPeriod: false,
      saleDate: false,
      saleValue: false,
      discountYieldPreview: false,
      discountCurrentValuePreview: false,
      inflationSchedulePreview: false
    },
    required: {
      issueDate: inputRequired(BMAP_PRODUCT_SPEC, 'issueDate'),
      transactionDate: inputRequired(BMAP_PRODUCT_SPEC, 'purchaseDate'),
      dueDate: false,
      purchasePrice: false,
      spreadRate: false,
      yearlyInflation: false,
      couponPeriod: inputRequired(BMAP_PRODUCT_SPEC, 'firstCouponDate'),
      annualRate: false
    },
    text: {
      principalLabel: inputLabel(BMAP_PRODUCT_SPEC, 'principal', 'Principal'),
      principalNote: 'Principal amount used for BMAP coupon and redemption calculations.',
      purchasePriceLabel: 'Purchase price',
      annualRateLabel: 'Annual rate',
      annualRateNote: 'BMAP uses explicit DKJ base and premium inputs instead of the generic annual rate field.'
    },
    annualRateReadOnly: false
  }
}

function buildPmapSubtypeUiConfig() {
  return {
    visible: {
      issueDate: true,
      transactionDate: true,
      dueDate: true,
      spreadRate: true,
      yearlyInflation: true,
      couponPeriod: true,
      saleDate: false,
      saleValue: false,
      discountYieldPreview: false,
      discountCurrentValuePreview: false,
      inflationSchedulePreview: true
    },
    required: {
      issueDate: inputRequired(PMAP_PRODUCT_SPEC, 'startDate'),
      transactionDate: inputRequired(PMAP_PRODUCT_SPEC, 'purchaseDate'),
      dueDate: inputRequired(PMAP_PRODUCT_SPEC, 'issueDate'),
      purchasePrice: false,
      spreadRate: inputRequired(PMAP_PRODUCT_SPEC, 'interestPremiumPct'),
      yearlyInflation: inputRequired(PMAP_PRODUCT_SPEC, 'previousYearAverageInflationPct'),
      couponPeriod: inputRequired(PMAP_PRODUCT_SPEC, 'firstCouponDate'),
      annualRate: false
    },
    text: {
      principalLabel: inputLabel(PMAP_PRODUCT_SPEC, 'principal', 'Principal'),
      principalNote: 'Principal used with inflation and PMAP premium accrual assumptions.',
      purchasePriceLabel: 'Purchase price',
      annualRateLabel: 'Annual rate',
      annualRateNote: 'PMAP coupon is derived from inflation base and premium inputs.'
    },
    annualRateReadOnly: false
  }
}

function buildSpecBackedInvestmentSubtypeUiConfig() {
  return {
    bmap: buildBmapSubtypeUiConfig(),
    dkj: buildDkjSubtypeUiConfig(),
    pmap: buildPmapSubtypeUiConfig()
  }
}

export {
  FULLY_SPEC_BACKED_INVESTMENT_PRODUCTS,
  buildSpecBackedInvestmentSubtypeOptions,
  buildSpecBackedInvestmentSubtypeUiConfig
}