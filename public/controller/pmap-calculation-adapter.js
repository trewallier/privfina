import { toFiniteNumber, toNonNegativeNumber } from './spec-input-validators.js'

function mapPmapSpecInputsToLegacyInvestmentInput(specInputs) {
  const principal = toNonNegativeNumber(specInputs.principal, 'principal')
  const interestPremiumPct = toFiniteNumber(specInputs.interestPremiumPct, 'interestPremiumPct')
  const prevYearInflationPct = toFiniteNumber(
    specInputs.previousYearAverageInflationPct,
    'previousYearAverageInflationPct'
  )

  const startDate = String(specInputs.startDate || '').trim()
  const purchaseDate = typeof specInputs.purchaseDate === 'string' ? String(specInputs.purchaseDate).trim() : ''
  const issueDate = typeof specInputs.issueDate === 'string' ? String(specInputs.issueDate).trim() : ''

  // PMAP pilot assumes a 10-year term by product assumption
  const start = new Date(startDate)
  const maturity = new Date(Date.UTC(start.getUTCFullYear() + 10, start.getUTCMonth(), start.getUTCDate()))
  const maturityIso = maturity.toISOString().slice(0, 10)

  // Effective inflation base is floored at 0
  const effectiveInflationBase = Math.max(prevYearInflationPct, 0)

  // Populate yearlyInflation entries for the maturity years with the floored value
  const yearlyInflation = []
  for (let y = start.getUTCFullYear() + 1; y <= start.getUTCFullYear() + 10; y += 1) {
    yearlyInflation.push({ year: y, rate: effectiveInflationBase })
  }

  return {
    subtype: 'inflation-linked-bond',
    principal,
    purchasePrice: undefined,
    issueDate: issueDate || startDate,
    transactionDate: purchaseDate || startDate,
    dueDate: maturityIso,
    spreadRate: interestPremiumPct / 100,
    yearlyInflation,
    // Public UI/preview expects a `yearlyInflationRaw` string with decimal rates like "2027:0.044"
    yearlyInflationRaw: yearlyInflation
      .map((e) => `${e.year}:${Number(e.rate) / 100}`)
      .join(', ')
  }
}

function mapLegacyPmapPreviewToSpecOutputs(legacyPreview, specInputs) {
  void legacyPreview
  const effectiveInflationBasePct = Math.max(Number(specInputs.previousYearAverageInflationPct), 0)
  const interestPremiumPct = Number(specInputs.interestPremiumPct)
  const annualCouponRatePct = effectiveInflationBasePct + interestPremiumPct
  const principal = toNonNegativeNumber(specInputs.principal, 'principal')

  return {
    effectiveInflationBasePct,
    annualCouponRatePct,
    couponPaymentFrequency: 'annual',
    redemptionValue: principal
  }
}

function calculatePmapFromSpecInputs(specInputs, options) {
  const createInvestmentMaturityPreview = options?.createInvestmentMaturityPreview
  if (typeof createInvestmentMaturityPreview !== 'function') {
    throw new Error('createInvestmentMaturityPreview function is required.')
  }

  const legacyInput = mapPmapSpecInputsToLegacyInvestmentInput(specInputs)
  const legacyPreview = createInvestmentMaturityPreview(legacyInput)
  return mapLegacyPmapPreviewToSpecOutputs(legacyPreview, specInputs)
}

export { mapPmapSpecInputsToLegacyInvestmentInput, mapLegacyPmapPreviewToSpecOutputs, calculatePmapFromSpecInputs }
