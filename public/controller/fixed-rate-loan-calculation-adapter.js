function toFiniteNumber(value, label) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a finite number.`)
  }
  return parsed
}

function toPositiveInteger(value, label) {
  const parsed = toFiniteNumber(value, label)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`)
  }
  return parsed
}

function toNonNegativeNumber(value, label) {
  const parsed = toFiniteNumber(value, label)
  if (parsed < 0) {
    throw new Error(`${label} must be non-negative.`)
  }
  return parsed
}

function mapFixedRateLoanSpecInputsToLegacyCalculationInput(specInputs) {
  const principal = toNonNegativeNumber(specInputs.principal, 'principal')
  const annualInterestRatePct = toNonNegativeNumber(
    specInputs.annualInterestRatePct,
    'annualInterestRatePct'
  )
  const termMonths = toPositiveInteger(specInputs.termMonths, 'termMonths')

  return {
    principal,
    annualRate: annualInterestRatePct / 100,
    termMonths
  }
}

function mapLegacyLoanPreviewToSpecOutputs(legacyPreview) {
  return {
    monthlyPayment: toFiniteNumber(legacyPreview.monthlyInstallment, 'monthlyInstallment'),
    paymentCount: toPositiveInteger(legacyPreview.termMonths, 'termMonths'),
    totalInterest: toFiniteNumber(legacyPreview.totalInterest, 'totalInterest'),
    totalPaid: toFiniteNumber(legacyPreview.totalRepayment, 'totalRepayment')
  }
}

function calculateFixedRateLoanFromSpecInputs(specInputs, options) {
  const createLoanRepaymentPreview = options?.createLoanRepaymentPreview
  if (typeof createLoanRepaymentPreview !== 'function') {
    throw new Error('createLoanRepaymentPreview function is required.')
  }

  const legacyInput = mapFixedRateLoanSpecInputsToLegacyCalculationInput(specInputs)
  const legacyPreview = createLoanRepaymentPreview(legacyInput)
  return mapLegacyLoanPreviewToSpecOutputs(legacyPreview)
}

function mapFixedRateLoanSpecInputsToLegacyLoanBundleInput(specInputs, extras = {}) {
  const legacyInput = mapFixedRateLoanSpecInputsToLegacyCalculationInput(specInputs)
  const startDate = String(specInputs.startDate || '').trim()

  return {
    ...extras,
    principal: legacyInput.principal,
    annualRate: legacyInput.annualRate,
    termValue: legacyInput.termMonths,
    termUnit: 'months',
    startDate
  }
}

export {
  mapFixedRateLoanSpecInputsToLegacyCalculationInput,
  mapLegacyLoanPreviewToSpecOutputs,
  calculateFixedRateLoanFromSpecInputs,
  mapFixedRateLoanSpecInputsToLegacyLoanBundleInput
}