/**
 * Input/output field help copy for the commercial loan composer.
 * Descriptions are mirrored from docs/product-specs/products/loans/<code>/product.yaml
 * (inputs[].description / outputs[].description). Fee-package preview is UI-only.
 * Also applies shared required/optional/calculated field chrome (same as investments).
 */

import { applyFieldChrome } from './field-chrome.js'

const SHARED_UI_FIELD_HELP = {
  label: 'Display name for this commercial loan in the configured instruments list.',
  category: 'Optional tag for grouping this instrument in lists and reports.',
  description: 'Optional free-text notes for this commercial loan.',
  repaymentDayOfMonth: 'Calendar day used for each scheduled monthly repayment.',
  includeDisbursement: 'When enabled, records the principal as an inflow on the start date.',
  productCode: 'Public-offering mortgage product that drives rates, fees, discounts, and THM packaging.',
  totalCreditCostFees:
    'Sum of upfront credit-cost fees included in the fee package and THM calculation for the selected product.'
}

/** Defaults aligned with otp-1x1 product.yaml; product-specific maps override. */
const DEFAULT_SPEC_FIELD_HELP = {
  principal: 'Approved forint principal disbursed for the home-loan purpose.',
  annualInterestRatePct:
    'Fixed ügyleti kamat for the full term before optional loyalty/employee discounts.',
  termMonths: 'Full contractual term in months.',
  startDate: 'Loan start date in ISO format.',
  loanPurpose: 'Purpose code affecting fees and THM presentation.',
  gracePeriodMonths:
    'Optional months at the start before amortizing repayments begin. Defaults to 0.',
  monthlyPayment: 'Level monthly annuity installment after any optional grace period.',
  totalInterest: 'Total interest paid over the full term (engine annuity path).',
  totalPaid:
    'Sum of scheduled repayments (engine) or Hirdetmény total including packaged fees when taken from the representative example.',
  thmPct: 'Published total cost of credit indicator for the representative case.'
}

const PRODUCT_SPEC_FIELD_HELP = {
  'otp-1x1': { ...DEFAULT_SPEC_FIELD_HELP },
  'otp-zold': {
    ...DEFAULT_SPEC_FIELD_HELP,
    principal: 'Approved forint principal disbursed for the green home-loan purpose.',
    annualInterestRatePct:
      'Customer rate after Zöld kamatkedvezmény when green conditions are met (7,99%).',
    loanPurpose: 'Green-eligible purpose code affecting fees and THM presentation.'
  },
  'vegig-fix': { ...DEFAULT_SPEC_FIELD_HELP },
  'csok-plusz': {
    ...DEFAULT_SPEC_FIELD_HELP,
    principal: 'Approved forint principal under the CSOK Plusz program.',
    annualInterestRatePct: 'Adósok által fizetendő kamat during the subsidy period (fixed 3,00%).',
    termMonths: 'Full contractual term in months (includes the mandatory 12-month grace).',
    gracePeriodMonths: 'Mandatory interest-only months before annuity amortization begins.',
    monthlyPayment: 'Level annuity installment from month 13 onward.',
    totalPaid:
      'Hirdetmény total including packaged fees when taken from the representative example.'
  },
  'falusi-csok': {
    ...DEFAULT_SPEC_FIELD_HELP,
    principal: 'Approved forint principal under Falusi CSOK / Otthonteremtés.',
    annualInterestRatePct: 'Adósok által fizetendő kamat during subsidy (fixed 3,00%).',
    totalPaid:
      'Hirdetmény total including packaged fees when taken from the representative example.'
  },
  'otthon-start': {
    ...DEFAULT_SPEC_FIELD_HELP,
    principal: 'Approved forint principal under Otthon Start.',
    annualInterestRatePct: 'Adósok által fizetendő kamat during subsidy (fixed 3,00%).',
    termMonths: 'Full contractual term in months (includes any optional grace).',
    gracePeriodMonths:
      'Optional interest-only months before annuity amortization (representative §6 packaging uses 12).',
    monthlyPayment: 'Level annuity installment after any grace period.',
    totalPaid:
      'Hirdetmény total including packaged fees when taken from the representative example.'
  },
  'videki-otthonfelujitasi': {
    ...DEFAULT_SPEC_FIELD_HELP,
    principal: 'Approved forint principal under Vidéki Otthonfelújítás.',
    annualInterestRatePct:
      'Adós által fizetendő kamat after the fixed 3 pp subsidy (April 2026 packaging 4,87%).',
    termMonths:
      'Full contractual term in months (representative §6 packaging uses 120 months / 10 years).',
    loanPurpose: 'Renovation/modernization purpose for the rural home-improvement program.',
    monthlyPayment: 'Level monthly annuity installment.',
    totalPaid:
      'Hirdetmény total including packaged fees when taken from the representative example.'
  }
}

/** Maps commercial form help element ids → schema / UI field names. */
const COMMERCIAL_LOAN_HELP_FIELD_BY_ID = {
  'commercial-loan-product-help': 'productCode',
  'commercial-loan-label-help': 'label',
  'commercial-loan-start-date-help': 'startDate',
  'commercial-loan-principal-help': 'principal',
  'commercial-loan-annual-rate-help': 'annualInterestRatePct',
  'commercial-loan-term-months-help': 'termMonths',
  'commercial-loan-grace-period-months-help': 'gracePeriodMonths',
  'commercial-loan-purpose-help': 'loanPurpose',
  'commercial-loan-repayment-day-help': 'repaymentDayOfMonth',
  'commercial-loan-category-help': 'category',
  'commercial-loan-description-help': 'description',
  'commercial-loan-include-disbursement-help': 'includeDisbursement',
  'commercial-loan-monthly-preview-help': 'monthlyPayment',
  'commercial-loan-total-repayment-preview-help': 'totalPaid',
  'commercial-loan-total-interest-preview-help': 'totalInterest',
  'commercial-loan-fees-preview-help': 'totalCreditCostFees',
  'commercial-loan-thm-preview-help': 'thmPct'
}

/**
 * Presentation chrome for commercial loan controls.
 * `required` may be a boolean or a function(product) → boolean.
 */
const COMMERCIAL_LOAN_FIELD_CHROME = [
  {
    inputId: 'commercial-loan-product',
    fieldName: 'productCode',
    label: 'Mortgage product',
    required: true,
    role: 'input'
  },
  {
    inputId: 'commercial-loan-label',
    fieldName: 'label',
    label: 'Label',
    required: false,
    role: 'input'
  },
  {
    inputId: 'commercial-loan-start-date',
    fieldName: 'startDate',
    label: 'Start date',
    required: true,
    role: 'input'
  },
  {
    inputId: 'commercial-loan-principal',
    fieldName: 'principal',
    label: 'Principal',
    required: true,
    role: 'input'
  },
  {
    inputId: 'commercial-loan-annual-rate',
    fieldName: 'annualInterestRatePct',
    label: 'Customer annual rate (%)',
    required: true,
    role: 'input'
  },
  {
    inputId: 'commercial-loan-term-months',
    fieldName: 'termMonths',
    label: 'Term (months)',
    required: true,
    role: 'input'
  },
  {
    inputId: 'commercial-loan-grace-period-months',
    fieldName: 'gracePeriodMonths',
    label: 'Grace period (months)',
    required: (product) => Boolean(product?.graceRequired),
    role: 'input'
  },
  {
    inputId: 'commercial-loan-purpose',
    fieldName: 'loanPurpose',
    label: 'Loan purpose',
    required: false,
    role: 'input'
  },
  {
    inputId: 'commercial-loan-repayment-day',
    fieldName: 'repaymentDayOfMonth',
    label: 'Repayment day of month',
    required: false,
    role: 'input'
  },
  {
    inputId: 'commercial-loan-category',
    fieldName: 'category',
    label: 'Category',
    required: false,
    role: 'input'
  },
  {
    inputId: 'commercial-loan-description',
    fieldName: 'description',
    label: 'Description',
    required: false,
    role: 'input'
  },
  {
    inputId: 'commercial-loan-include-disbursement',
    fieldName: 'includeDisbursement',
    label: 'Account loan disbursement inflow',
    required: false,
    role: 'input'
  },
  {
    inputId: 'commercial-loan-monthly-preview',
    fieldName: 'monthlyPayment',
    label: 'Monthly repayment preview',
    required: false,
    role: 'output'
  },
  {
    inputId: 'commercial-loan-total-repayment-preview',
    fieldName: 'totalPaid',
    label: 'Total repayment preview',
    required: false,
    role: 'output'
  },
  {
    inputId: 'commercial-loan-total-interest-preview',
    fieldName: 'totalInterest',
    label: 'Total interest preview',
    required: false,
    role: 'output'
  },
  {
    inputId: 'commercial-loan-fees-preview',
    fieldName: 'totalCreditCostFees',
    label: 'Fee package preview',
    required: false,
    role: 'output'
  },
  {
    inputId: 'commercial-loan-thm-preview',
    fieldName: 'thmPct',
    label: 'THM preview',
    required: false,
    role: 'output'
  }
]

function getCommercialLoanFieldHelp(productCode) {
  const specHelp = PRODUCT_SPEC_FIELD_HELP[productCode] || DEFAULT_SPEC_FIELD_HELP
  return {
    ...SHARED_UI_FIELD_HELP,
    ...specHelp
  }
}

function resolveCommercialLoanFieldRequired(meta, product) {
  if (typeof meta.required === 'function') {
    return Boolean(meta.required(product))
  }
  return Boolean(meta.required)
}

function applyCommercialLoanFieldChrome(form, product) {
  if (!form) {
    return
  }

  const helpByField = getCommercialLoanFieldHelp(product?.productCode)
  COMMERCIAL_LOAN_FIELD_CHROME.forEach((meta) => {
    const input = form.querySelector(`#${meta.inputId}`)
    const label = input ? input.closest('label') : null
    if (!label) {
      return
    }
    applyFieldChrome(
      label,
      {
        label: meta.label,
        description: helpByField[meta.fieldName] || '',
        required: resolveCommercialLoanFieldRequired(meta, product),
        role: meta.role || 'input',
        helpId: `${meta.inputId}-help`,
        labelClassName: 'commercial-loan-field-label'
      },
      input
    )
  })
}

function applyCommercialLoanFieldHelpToForm(form, productCode) {
  if (!form) {
    return
  }

  const helpByField = getCommercialLoanFieldHelp(productCode)
  Object.entries(COMMERCIAL_LOAN_HELP_FIELD_BY_ID).forEach(([helpId, fieldName]) => {
    const helpNode = form.querySelector(`#${helpId}`)
    const paragraph = helpNode ? helpNode.querySelector('p') : null
    const text = helpByField[fieldName]
    if (paragraph && text) {
      paragraph.textContent = text
    }
  })
}

export {
  SHARED_UI_FIELD_HELP,
  DEFAULT_SPEC_FIELD_HELP,
  PRODUCT_SPEC_FIELD_HELP,
  COMMERCIAL_LOAN_HELP_FIELD_BY_ID,
  COMMERCIAL_LOAN_FIELD_CHROME,
  getCommercialLoanFieldHelp,
  resolveCommercialLoanFieldRequired,
  applyCommercialLoanFieldChrome,
  applyCommercialLoanFieldHelpToForm
}
