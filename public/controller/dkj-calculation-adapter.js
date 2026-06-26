import { toFiniteNumber, toPositiveInteger, toNonNegativeNumber } from './spec-input-validators.js'

function addMonthsToIsoDate(dateIso, months) {
  const source = new Date(`${dateIso}T00:00:00Z`)
  if (Number.isNaN(source.getTime())) {
    throw new Error('settlementDate must be an ISO date string.')
  }

  const target = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + months, source.getUTCDate()))
  return target.toISOString().slice(0, 10)
}

function mapDkjSpecInputsToLegacyInvestmentInput(specInputs) {
  const faceValue = toNonNegativeNumber(specInputs.faceValue, 'faceValue')
  const purchasePricePct = toNonNegativeNumber(specInputs.purchasePricePct, 'purchasePricePct')
  const termMonths = toPositiveInteger(specInputs.termMonths, 'termMonths')
  const settlementDate = String(specInputs.settlementDate || '').trim()
  if (!settlementDate) {
    throw new Error('settlementDate is required.')
  }

  const maturityDate = String(specInputs.maturityDate || '').trim() || addMonthsToIsoDate(settlementDate, termMonths)

  const purchasePrice = (faceValue * purchasePricePct) / 100

  return {
    subtype: 'discount-bond',
    principal: faceValue,
    purchasePrice,
    issueDate: settlementDate,
    transactionDate: settlementDate,
    dueDate: maturityDate
  }
}

function mapLegacyInvestmentPreviewToSpecOutputs(legacyPreview) {
  const purchaseAmount = toFiniteNumber(legacyPreview.purchaseAmount ?? legacyPreview.purchaseAmount, 'purchaseAmount')
  const redemptionValue = toFiniteNumber(legacyPreview.maturityAmount ?? legacyPreview.maturityAmount, 'maturityAmount')
  const grossGain = toFiniteNumber(legacyPreview.gainAmount ?? legacyPreview.gainAmount, 'gainAmount')
  const annualizedYieldPct = legacyPreview.discountMetrics && typeof legacyPreview.discountMetrics.yieldPercent === 'number'
    ? legacyPreview.discountMetrics.yieldPercent
    : toFiniteNumber(legacyPreview.discountMetrics?.yieldPercent ?? 0, 'yieldPercent')

  const simpleReturnPct = (purchaseAmount > 0) ? (grossGain / purchaseAmount) * 100 : 0

  return {
    purchaseAmount,
    redemptionValue,
    grossGain,
    simpleReturnPct,
    annualizedYieldPct
  }
}

function resolveAnnualizedYieldPct(specInputs, fallbackAnnualizedYieldPct, simpleReturnPct) {
  const remainingDaysRaw = specInputs?.remainingDays
  if (remainingDaysRaw === undefined || remainingDaysRaw === null || remainingDaysRaw === '') {
    return fallbackAnnualizedYieldPct
  }

  const remainingDays = toPositiveInteger(remainingDaysRaw, 'remainingDays')
  return simpleReturnPct * (360 / remainingDays)
}

function calculateDkjFromSpecInputs(specInputs, options) {
  const createInvestmentMaturityPreview = options?.createInvestmentMaturityPreview
  if (typeof createInvestmentMaturityPreview !== 'function') {
    throw new Error('createInvestmentMaturityPreview function is required.')
  }

  const legacyInput = mapDkjSpecInputsToLegacyInvestmentInput(specInputs)
  const legacyPreview = createInvestmentMaturityPreview(legacyInput)
  const mapped = mapLegacyInvestmentPreviewToSpecOutputs(legacyPreview)
  return {
    ...mapped,
    annualizedYieldPct: resolveAnnualizedYieldPct(specInputs, mapped.annualizedYieldPct, mapped.simpleReturnPct)
  }
}

export { mapDkjSpecInputsToLegacyInvestmentInput, mapLegacyInvestmentPreviewToSpecOutputs, calculateDkjFromSpecInputs }
