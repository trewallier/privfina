import {
  annualizeDkjSimpleReturnPct,
  deriveDkjRemainingDays
} from '@finance_engine/instruments/day_count'
import { toFiniteNumber, toPositiveInteger, toNonNegativeNumber } from './spec-input-validators.js'

function resolveRemainingDays(specInputs) {
  const remainingDaysRaw = specInputs?.remainingDays
  if (remainingDaysRaw !== undefined && remainingDaysRaw !== null && remainingDaysRaw !== '') {
    return toPositiveInteger(remainingDaysRaw, 'remainingDays')
  }

  const settlementDate = String(specInputs?.settlementDate || '').trim()
  const maturityDate = String(specInputs?.maturityDate || '').trim()
  const derived = deriveDkjRemainingDays(settlementDate, maturityDate)
  if (derived == null) {
    throw new Error('remainingDays could not be derived from settlementDate and maturityDate.')
  }
  return toPositiveInteger(derived, 'remainingDays')
}

function mapDkjSpecInputsToLegacyInvestmentInput(specInputs) {
  const faceValue = toNonNegativeNumber(specInputs.faceValue, 'faceValue')
  const purchasePricePct = toNonNegativeNumber(specInputs.purchasePricePct, 'purchasePricePct')
  toPositiveInteger(specInputs.termMonths, 'termMonths')
  const settlementDate = String(specInputs.settlementDate || '').trim()
  if (!settlementDate) {
    throw new Error('settlementDate is required.')
  }

  const maturityDate = String(specInputs.maturityDate || '').trim()
  if (!maturityDate) {
    throw new Error('maturityDate is required.')
  }

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
  const purchaseAmount = toFiniteNumber(
    legacyPreview.purchaseAmount ?? legacyPreview.purchaseAmount,
    'purchaseAmount'
  )
  const redemptionValue = toFiniteNumber(
    legacyPreview.maturityAmount ?? legacyPreview.maturityAmount,
    'maturityAmount'
  )
  const grossGain = toFiniteNumber(legacyPreview.gainAmount ?? legacyPreview.gainAmount, 'gainAmount')
  const annualizedYieldPct =
    legacyPreview.discountMetrics && typeof legacyPreview.discountMetrics.yieldPercent === 'number'
      ? legacyPreview.discountMetrics.yieldPercent
      : toFiniteNumber(legacyPreview.discountMetrics?.yieldPercent ?? 0, 'yieldPercent')

  const simpleReturnPct = purchaseAmount > 0 ? (grossGain / purchaseAmount) * 100 : 0

  return {
    purchaseAmount,
    redemptionValue,
    grossGain,
    simpleReturnPct,
    annualizedYieldPct
  }
}

function resolveAnnualizedYieldPct(
  remainingDays,
  fallbackAnnualizedYieldPct,
  simpleReturnPct,
  dayCountConvention
) {
  if (remainingDays == null) {
    return fallbackAnnualizedYieldPct
  }
  return annualizeDkjSimpleReturnPct(simpleReturnPct, remainingDays, dayCountConvention)
}

function calculateDkjFromSpecInputs(specInputs, options) {
  const createInvestmentMaturityPreview = options?.createInvestmentMaturityPreview
  if (typeof createInvestmentMaturityPreview !== 'function') {
    throw new Error('createInvestmentMaturityPreview function is required.')
  }

  const remainingDays = resolveRemainingDays(specInputs)
  const legacyInput = mapDkjSpecInputsToLegacyInvestmentInput(specInputs)
  const legacyPreview = createInvestmentMaturityPreview(legacyInput)
  const mapped = mapLegacyInvestmentPreviewToSpecOutputs(legacyPreview)
  return {
    ...mapped,
    remainingDays,
    annualizedYieldPct: resolveAnnualizedYieldPct(
      remainingDays,
      mapped.annualizedYieldPct,
      mapped.simpleReturnPct,
      specInputs.dayCountConvention
    )
  }
}

export {
  mapDkjSpecInputsToLegacyInvestmentInput,
  mapLegacyInvestmentPreviewToSpecOutputs,
  calculateDkjFromSpecInputs
}
