/**
 * MÁK commercial calculation adapter (ADR 0032 / 0038 / 0044 / 0047).
 * Rate / accrued / coupon math from `@finance_engine/instruments/ktv`.
 * FIX: ACT/365F + Babakötvény-style first-period stub on ga.
 * FLOAT: when periodMonths is set, ACT/360 quarterly cash path + period-turn accrual.
 */
import {
  deriveKtvRateOutputs,
  deriveKtvAccruedInterestAmount,
  generateKtvAnnualCouponFlows,
  generateKtvFloatCouponFlows,
  isKtvFloatSpecInputs,
  listKtvFloatPeriodTurnsIso
} from '@finance_engine/instruments/ktv'
import { createInvestmentMaturityPreview, normalizeInstrumentBundle } from '../instruments.js'
import { toFiniteNumber, toNonNegativeNumber } from './spec-input-validators.js'
import { KTV_PRODUCT_SPEC } from './ktv-product-spec.js'

function calculateKtvFromSpecInputs(specInputs, options) {
  void options
  const principal = toNonNegativeNumber(specInputs.principal, 'principal')
  const rateOutputs = deriveKtvRateOutputs(specInputs)
  const accruedInterestAmount = deriveKtvAccruedInterestAmount(
    specInputs,
    rateOutputs.annualCouponRatePct
  )
  const purchaseAmount = principal + accruedInterestAmount
  return {
    ...rateOutputs,
    accruedInterestAmount,
    purchaseAmount: toFiniteNumber(purchaseAmount, 'purchaseAmount')
  }
}

/** @deprecated Kept for tests that still pass a preview factory; unused for rate math. */
function mapKtvSpecInputsToLegacyInvestmentInput(specInputs) {
  const principal = toNonNegativeNumber(specInputs.principal, 'principal')
  const issueDate = String(specInputs.issueDate || '').trim()
  const purchaseDate =
    typeof specInputs.purchaseDate === 'string' ? String(specInputs.purchaseDate).trim() : ''
  const maturityDate = String(specInputs.maturityDate || '').trim()
  const annualCouponRatePct = Number(specInputs.annualCouponRatePct)
  return {
    subtype: 'inflation-linked-bond',
    principal,
    issueDate,
    transactionDate: purchaseDate || issueDate,
    dueDate: maturityDate,
    spreadRate: annualCouponRatePct / 100,
    yearlyInflation: [],
    yearlyInflationRaw: ''
  }
}

function mapLegacyKtvPreviewToSpecOutputs(_legacyPreview, specInputs) {
  return calculateKtvFromSpecInputs(specInputs)
}

function buildFloatPeriodRateMap(specInputs, annualCouponRatePct) {
  const turns = listKtvFloatPeriodTurnsIso(specInputs)
  const rateMap = {}
  const purchaseIso = String(specInputs.purchaseDate || '').trim()
  for (const turn of turns) {
    // Period-end payments on/after purchase use the current resolved ga when known.
    if (purchaseIso && turn < purchaseIso) continue
    rateMap[turn] = annualCouponRatePct
  }
  return rateMap
}

function generateKtvInstrumentBundleFromSpecInputs(specInputs, extras = {}) {
  const calculated = calculateKtvFromSpecInputs(specInputs)
  const useFloat = isKtvFloatSpecInputs(specInputs)
  const rawFlows = useFloat
    ? generateKtvFloatCouponFlows(
        specInputs,
        calculated.purchaseAmount,
        buildFloatPeriodRateMap(specInputs, calculated.annualCouponRatePct)
      )
    : generateKtvAnnualCouponFlows(
        specInputs,
        calculated.purchaseAmount,
        calculated.annualCouponRatePct
      )
  const flows = rawFlows.map((flow) => ({
    date: flow.date,
    amount: flow.amount,
    direction: flow.direction === 'outflow' ? 'outflow' : 'inflow',
    category: flow.category || 'investment',
    description: flow.description || 'MÁK'
  }))
  const issueDateIso = String(specInputs.issueDate || '').trim()
  const purchaseDateIso =
    typeof specInputs.purchaseDate === 'string' ? String(specInputs.purchaseDate).trim() : ''
  const maturityDateIso = String(specInputs.maturityDate || '').trim()

  return normalizeInstrumentBundle({
    id: extras.id || `ktv-${Date.now()}`,
    instrumentType: 'investment',
    label: extras.label || KTV_PRODUCT_SPEC.ui.formTitle,
    productId: KTV_PRODUCT_SPEC.id,
    productSpecVersion: KTV_PRODUCT_SPEC.specVersion,
    config: {
      productId: KTV_PRODUCT_SPEC.id,
      productSpecVersion: KTV_PRODUCT_SPEC.specVersion,
      subtype: 'ktv',
      principal: calculated.purchaseAmount - calculated.accruedInterestAmount,
      annualCouponRatePct: calculated.annualCouponRatePct,
      purchaseDate: purchaseDateIso || undefined,
      issueDate: issueDateIso || undefined,
      maturityDate: maturityDateIso,
      firstCouponDate:
        typeof specInputs.firstCouponDate === 'string'
          ? String(specInputs.firstCouponDate).trim() || undefined
          : undefined,
      dayCountConvention:
        specInputs.dayCountConvention || (useFloat ? 'ACT/360' : 'ACT/365F'),
      couponSchedule: Array.isArray(specInputs.couponSchedule)
        ? specInputs.couponSchedule
        : undefined,
      periodMonths: useFloat ? Number(specInputs.periodMonths) : undefined,
      purchaseAmount: calculated.purchaseAmount,
      accruedInterestAmount: calculated.accruedInterestAmount,
      category: extras.category || 'investment',
      description: extras.description
    },
    preview: {
      purchaseAmount: calculated.purchaseAmount,
      maturityAmount: toNonNegativeNumber(specInputs.principal, 'principal'),
      gainAmount:
        toNonNegativeNumber(specInputs.principal, 'principal') - calculated.purchaseAmount,
      subtype: 'ktv',
      annualCouponRatePct: calculated.annualCouponRatePct,
      accruedInterestAmount: calculated.accruedInterestAmount
    },
    generatedFlows: flows,
    createdAt: extras.createdAt,
    updatedAt: new Date().toISOString()
  })
}

export {
  mapKtvSpecInputsToLegacyInvestmentInput,
  mapLegacyKtvPreviewToSpecOutputs,
  calculateKtvFromSpecInputs,
  generateKtvInstrumentBundleFromSpecInputs,
  createInvestmentMaturityPreview
}
