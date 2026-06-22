import { toFiniteNumber, toPositiveInteger, toNonNegativeNumber } from './spec-input-validators.js'

function mapDkjSpecInputsToLegacyInvestmentInput(specInputs) {
  const faceValue = toNonNegativeNumber(specInputs.faceValue, 'faceValue')
  const purchasePricePct = toNonNegativeNumber(specInputs.purchasePricePct, 'purchasePricePct')
  const termMonths = toPositiveInteger(specInputs.termMonths, 'termMonths')

  const purchasePrice = (faceValue * purchasePricePct) / 100

  return {
    subtype: 'discount-bond',
    principal: faceValue,
    purchasePrice,
    issueDate: String(specInputs.settlementDate || '').trim(),
    transactionDate: String(specInputs.settlementDate || '').trim(),
    dueDate: specInputs.maturityDate
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

function calculateDkjFromSpecInputs(specInputs, options) {
  const createInvestmentMaturityPreview = options?.createInvestmentMaturityPreview
  if (typeof createInvestmentMaturityPreview !== 'function') {
    throw new Error('createInvestmentMaturityPreview function is required.')
  }

  const legacyInput = mapDkjSpecInputsToLegacyInvestmentInput(specInputs)
  const legacyPreview = createInvestmentMaturityPreview(legacyInput)
  return mapLegacyInvestmentPreviewToSpecOutputs(legacyPreview)
}

export { mapDkjSpecInputsToLegacyInvestmentInput, mapLegacyInvestmentPreviewToSpecOutputs, calculateDkjFromSpecInputs }
