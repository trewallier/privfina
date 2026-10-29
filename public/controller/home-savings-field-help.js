/**
 * Input/output field help + required/optional/calculated chrome for the
 * commercial home-savings composer (parity with commercial-loan-field-help.js).
 * Spec-aligned descriptions come from product YAML / UX polish copy; promo
 * deposit bands and fixed term text are product-driven.
 */

import { applyFieldChrome } from './field-chrome.js'
import {
  formatDepositBoundsHelp,
  formatOpeningFeeModeHelp
} from './home-savings-product-metadata.js'

const SHARED_UI_FIELD_HELP = {
  productCode:
    'Select a catalog OTP Home Savings (Lakástakarék) product (not a loan or treasury investment).',
  label: 'Display name for this savings instrument on the chart and configured list.',
  category: 'Optional category tag for cash-flow grouping.',
  description: 'Optional notes stored on the instrument; deposit cash-flow labels stay fixed.',
  accountFeeMonthly: 'Monthly account-management fee for the selected módozat (Hirdetmény / Díjtáblázat).'
}

const DEFAULT_SPEC_FIELD_HELP = {
  startDate:
    'First savings month start (ISO date). Must fall inside the selected módozat’s offering period (date picker is limited to that window). Deposit day-of-month is taken from this date.',
  monthlyDeposit: 'Contractual monthly deposit for the selected product.',
  termMonths:
    'Fixed by the selected módozat. Early sell / shorter terms are out of scope for now.',
  openingFeeMode:
    'Standard 1% of contractual amount is always available. Promo modes require a 48-month loyalty commitment (Hűség). Promo deposit bands depend on the selected módozat.',
  contractAmount:
    'Contractual amount (szerződéses összeg) when known. When omitted, derived from monthly deposit via the product savings rate (‰). Must match the monthly deposit when provided.',
  housingPurpose:
    'Required to receive OTP Home Savings Premium. When unchecked, Premium amount is 0 in the schedule and preview (housing-purpose use is a condition for Premium).',
  accountOpeningFee: 'Resolved opening fee from mode + monthly deposit + contract amount.',
  totalDeposits: 'Sum of monthly deposits over the modeled term.',
  totalAccountFees:
    'Sum of monthly account-management fees over the savings term (monthly fee × term months). Does not include the account-opening fee (shown separately in Opening fee preview).',
  premiumRatePct: 'OTP Premium percent from term and housing-purpose path.',
  premiumAmount: 'OTP Home Savings Premium credited under the assumed exit path.',
  terminalPayout:
    'Customer inflow at allocation/termination (deposits + interest if modeled + Premium).',
  ebkmPct:
    'Engine EBKM from customer deposit/fee/Premium amounts (82/2010 Annex 3) with General Terms and Conditions (ÁSZF) §22 allocation payout dating for the terminal leg (first of lastDepositMonth+3 day-1). Chart schedule uses OTP-aligned maturity packaging (first of lastDeposit+2). Dual-lane display is not used.'
}

/**
 * Presentation chrome for home-savings controls.
 * `required` may be a boolean or a function(product) → boolean.
 */
const HOME_SAVINGS_FIELD_CHROME = [
  {
    inputId: 'home-savings-product',
    fieldName: 'productCode',
    label: 'Home-savings product',
    required: true,
    role: 'input'
  },
  {
    inputId: 'home-savings-label',
    fieldName: 'label',
    label: 'Label',
    required: false,
    role: 'input'
  },
  {
    inputId: 'home-savings-start-date',
    fieldName: 'startDate',
    label: 'Savings start date',
    required: true,
    role: 'input'
  },
  {
    inputId: 'home-savings-monthly-deposit',
    fieldName: 'monthlyDeposit',
    label: 'Monthly deposit',
    required: true,
    role: 'input'
  },
  {
    inputId: 'home-savings-term-months',
    fieldName: 'termMonths',
    label: 'Term (months)',
    required: true,
    role: 'input'
  },
  {
    inputId: 'home-savings-opening-fee-mode',
    fieldName: 'openingFeeMode',
    label: 'Opening fee mode',
    required: true,
    role: 'input'
  },
  {
    inputId: 'home-savings-contract-amount',
    fieldName: 'contractAmount',
    label: 'Contract amount (optional)',
    required: false,
    role: 'input'
  },
  {
    inputId: 'home-savings-housing-purpose',
    fieldName: 'housingPurpose',
    label: 'Housing purpose assumed',
    required: true,
    role: 'input'
  },
  {
    inputId: 'home-savings-category',
    fieldName: 'category',
    label: 'Category',
    required: false,
    role: 'input'
  },
  {
    inputId: 'home-savings-description',
    fieldName: 'description',
    label: 'Description',
    required: false,
    role: 'input'
  },
  {
    inputId: 'home-savings-opening-fee-preview',
    fieldName: 'accountOpeningFee',
    label: 'Opening fee preview',
    required: false,
    role: 'output'
  },
  {
    inputId: 'home-savings-account-fee-monthly-preview',
    fieldName: 'accountFeeMonthly',
    label: 'Monthly account fee',
    required: false,
    role: 'output'
  },
  {
    inputId: 'home-savings-total-deposits-preview',
    fieldName: 'totalDeposits',
    label: 'Total deposits preview',
    required: false,
    role: 'output'
  },
  {
    inputId: 'home-savings-total-account-fees-preview',
    fieldName: 'totalAccountFees',
    label: 'Total account fees preview',
    required: false,
    role: 'output'
  },
  {
    inputId: 'home-savings-premium-rate-preview',
    fieldName: 'premiumRatePct',
    label: 'Premium rate preview',
    required: false,
    role: 'output'
  },
  {
    inputId: 'home-savings-premium-amount-preview',
    fieldName: 'premiumAmount',
    label: 'Premium amount preview',
    required: false,
    role: 'output'
  },
  {
    inputId: 'home-savings-terminal-payout-preview',
    fieldName: 'terminalPayout',
    label: 'Terminal payout preview',
    required: false,
    role: 'output'
  },
  {
    inputId: 'home-savings-ebkm-preview',
    fieldName: 'ebkmPct',
    label: 'EBKM preview',
    required: false,
    role: 'output'
  }
]

function getHomeSavingsFieldHelp(product) {
  const termMonths = Number(product?.defaultTermMonths)
  const termHelp = Number.isFinite(termMonths)
    ? `Fixed at ${termMonths} months for this módozat. Early sell / shorter terms are out of scope for now.`
    : DEFAULT_SPEC_FIELD_HELP.termMonths

  return {
    ...SHARED_UI_FIELD_HELP,
    ...DEFAULT_SPEC_FIELD_HELP,
    monthlyDeposit: formatDepositBoundsHelp(product) || DEFAULT_SPEC_FIELD_HELP.monthlyDeposit,
    termMonths: termHelp,
    openingFeeMode: formatOpeningFeeModeHelp(product) || DEFAULT_SPEC_FIELD_HELP.openingFeeMode
  }
}

function resolveHomeSavingsFieldRequired(meta, product) {
  if (typeof meta.required === 'function') {
    return Boolean(meta.required(product))
  }
  return Boolean(meta.required)
}

function applyHomeSavingsFieldChrome(form, product) {
  if (!form) {
    return
  }

  const helpByField = getHomeSavingsFieldHelp(product)
  HOME_SAVINGS_FIELD_CHROME.forEach((meta) => {
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
        required: resolveHomeSavingsFieldRequired(meta, product),
        role: meta.role || 'input',
        helpId: `${meta.inputId}-help`,
        labelClassName: 'home-savings-field-label'
      },
      input
    )
  })

  // Term stays locked to the módozat default (early sell out of scope).
  const termInput = form.querySelector('#home-savings-term-months')
  if (termInput && product?.defaultTermMonths != null) {
    termInput.readOnly = true
    termInput.min = String(product.defaultTermMonths)
    termInput.max = String(product.defaultTermMonths)
  }
}

export {
  SHARED_UI_FIELD_HELP,
  DEFAULT_SPEC_FIELD_HELP,
  HOME_SAVINGS_FIELD_CHROME,
  getHomeSavingsFieldHelp,
  resolveHomeSavingsFieldRequired,
  applyHomeSavingsFieldChrome
}
