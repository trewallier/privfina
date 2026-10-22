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

function bindMoneyAmountInput(input) {
  if (!input || input.dataset.moneyBound === '1') {
    return
  }

  input.dataset.moneyBound = '1'
  input.setAttribute('inputmode', 'decimal')
  input.setAttribute('autocomplete', 'off')

  const reformat = () => {
    const numeric = parseMoneyAmount(input.value)
    if (!Number.isFinite(numeric)) {
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

export {
  formatMoneyAmount,
  parseMoneyAmount,
  bindMoneyAmountInput,
  bindMoneyAmountInputs
}
