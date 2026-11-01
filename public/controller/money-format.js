/**
 * Display helpers for money amounts: space-grouped thousands (e.g. 5 000, 1 000 000).
 */

function formatMoneyAmount(value, { fractionDigits = 2, empty = '—' } = {}) {
  if (value === undefined || value === null || value === '') {
    return empty
  }

  const numeric = typeof value === 'number' ? value : parseMoneyAmount(value)
  if (!Number.isFinite(numeric)) {
    return empty
  }

  const negative = numeric < 0
  const absolute = Math.abs(numeric)
  const fixed = absolute.toFixed(fractionDigits)
  const [intPart, fracPart] = fixed.split('.')
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  const body =
    fractionDigits > 0 && fracPart !== undefined ? `${grouped}.${fracPart}` : grouped
  return negative ? `−${body}` : body
}

function parseMoneyAmount(value) {
  if (value === undefined || value === null) {
    return NaN
  }

  if (typeof value === 'number') {
    return value
  }

  const cleaned = String(value)
    .trim()
    .replace(/\u00a0/g, '')
    .replace(/\s/g, '')
    .replace(/,/g, '.')

  if (!cleaned || cleaned === '—' || cleaned === '-') {
    return NaN
  }

  return Number(cleaned)
}

/**
 * Snap an amount to the product denomination unit (and optional minimum).
 * Returns the smallest non-zero valid multiple when value is empty/invalid/below minimum.
 *
 * @param {unknown} value
 * @param {number|string|null|undefined} denominationUnit
 * @param {{ minimum?: number|string|null|undefined }} [options]
 */
function snapToDenomination(value, denominationUnit, { minimum } = {}) {
  const unit = Number(denominationUnit)
  const step = Number.isFinite(unit) && unit > 0 ? unit : 1
  let min = Number(minimum)
  if (!Number.isFinite(min) || min <= 0) {
    min = step
  }
  // Align minimum up to a valid multiple of the unit.
  const alignedMin = Math.ceil(min / step) * step

  const numeric = typeof value === 'number' ? value : parseMoneyAmount(value)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return alignedMin
  }

  const snapped = Math.round(numeric / step) * step
  if (snapped < alignedMin) {
    return alignedMin
  }
  return snapped
}

/**
 * Smallest non-zero valid denomination amount for a product.
 * @param {number|string|null|undefined} denominationUnit
 * @param {{ minimum?: number|string|null|undefined }} [options]
 */
function defaultDenominationAmount(denominationUnit, options = {}) {
  return snapToDenomination(null, denominationUnit, options)
}

/**
 * True when value is a finite multiple of denominationUnit and meets minimum.
 * Used on submit; blur path snaps instead.
 *
 * @param {unknown} value
 * @param {number|string|null|undefined} denominationUnit
 * @param {{ minimum?: number|string|null|undefined }} [options]
 */
function isMultipleOfDenomination(value, denominationUnit, { minimum } = {}) {
  const unit = Number(denominationUnit)
  const step = Number.isFinite(unit) && unit > 0 ? unit : 1
  let min = Number(minimum)
  if (!Number.isFinite(min) || min <= 0) {
    min = step
  }
  const alignedMin = Math.ceil(min / step) * step
  const numeric = typeof value === 'number' ? value : parseMoneyAmount(value)
  if (!Number.isFinite(numeric) || numeric < alignedMin) {
    return false
  }
  const quotient = numeric / step
  return Math.abs(quotient - Math.round(quotient)) < 1e-9
}

function bindMoneyAmountInput(input) {
  if (!input || input.dataset.moneyBound === '1') {
    return
  }

  input.dataset.moneyBound = '1'
  input.setAttribute('inputmode', 'decimal')
  input.setAttribute('autocomplete', 'off')

  const reformat = () => {
    const unit = Number(input.dataset.denominationUnit)
    const minimum = Number(input.dataset.denominationMinimum)
    let numeric = parseMoneyAmount(input.value)
    if (Number.isFinite(unit) && unit > 0) {
      numeric = snapToDenomination(input.value, unit, {
        minimum: Number.isFinite(minimum) ? minimum : unit
      })
    } else if (!Number.isFinite(numeric)) {
      return
    }
    input.value = formatMoneyAmount(numeric)
  }

  // Readonly preview fields are written already formatted by preview sync.
  if (input.readOnly) {
    return
  }

  const showRawForEdit = () => {
    const numeric = parseMoneyAmount(input.value)
    if (!Number.isFinite(numeric)) {
      return
    }
    // Keep a plain editable number while focused (no grouping).
    input.value = String(numeric)
  }

  input.addEventListener('focus', showRawForEdit)
  input.addEventListener('blur', reformat)

  // Initial display if a numeric value is already present.
  if (String(input.value || '').trim() !== '') {
    reformat()
  }
}

function bindMoneyAmountInputs(root = document) {
  root.querySelectorAll('input.money-amount').forEach((input) => {
    bindMoneyAmountInput(input)
  })
}

/**
 * Apply denomination metadata and optional default when the amount is empty.
 * @param {HTMLInputElement|null|undefined} input
 * @param {{ denominationUnit?: number|string|null, minimum?: number|string|null, setDefaultIfEmpty?: boolean }} options
 */
function applyDenominationToMoneyInput(
  input,
  { denominationUnit, minimum, setDefaultIfEmpty = false } = {}
) {
  if (!input) {
    return
  }
  const unit = Number(denominationUnit)
  if (Number.isFinite(unit) && unit > 0) {
    input.dataset.denominationUnit = String(unit)
  } else {
    delete input.dataset.denominationUnit
  }
  const min = Number(minimum)
  if (Number.isFinite(min) && min > 0) {
    input.dataset.denominationMinimum = String(min)
  } else if (Number.isFinite(unit) && unit > 0) {
    input.dataset.denominationMinimum = String(unit)
  } else {
    delete input.dataset.denominationMinimum
  }

  if (setDefaultIfEmpty && !String(input.value || '').trim()) {
    const amount = defaultDenominationAmount(unit, {
      minimum: Number.isFinite(min) ? min : unit
    })
    input.value = formatMoneyAmount(amount)
  }
}

export {
  formatMoneyAmount,
  parseMoneyAmount,
  snapToDenomination,
  defaultDenominationAmount,
  isMultipleOfDenomination,
  applyDenominationToMoneyInput,
  bindMoneyAmountInput,
  bindMoneyAmountInputs
}
