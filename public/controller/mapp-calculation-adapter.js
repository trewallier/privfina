/**
 * MÁP Plusz commercial calculation adapter (ADR 0032 / 0038 / ROADMAP §6j).
 * Rate / accrued / coupon math from `@finance_engine/instruments/mapp`.
 */
import {
  deriveMappRateOutputs,
  deriveMappAccruedInterestAmount,
  generateMappCouponFlows
} from '@finance_engine/instruments/mapp'
import { createInvestmentMaturityPreview, normalizeInstrumentBundle } from '../instruments.js'
import { toFiniteNumber, toNonNegativeNumber } from './spec-input-validators.js'
import { MAPP_PRODUCT_SPEC } from './mapp-product-spec.js'

function calculateMappFromSpecInputs(specInputs, options) {
  void options
  const principal = toNonNegativeNumber(specInputs.principal, 'principal')
  const rateOutputs = deriveMappRateOutputs(specInputs)
  const accruedInterestAmount = deriveMappAccruedInterestAmount(
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
function mapMappSpecInputsToLegacyInvestmentInput(specInputs) {
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

function mapLegacyMappPreviewToSpecOutputs(_legacyPreview, specInputs) {
  return calculateMappFromSpecInputs(specInputs)
}

function generateMappInstrumentBundleFromSpecInputs(specInputs, extras = {}) {
  const calculated = calculateMappFromSpecInputs(specInputs)
  const flows = generateMappCouponFlows(
    specInputs,
    calculated.purchaseAmount,
    calculated.annualCouponRatePct
  ).map((flow) => ({
    date: flow.date,
    amount: flow.amount,
    direction: flow.direction === 'outflow' ? 'outflow' : 'inflow',
    category: flow.category || 'investment',
    description: flow.description || 'MAPP'
  }))
  const issueDateIso = String(specInputs.issueDate || '').trim()
  const purchaseDateIso =
    typeof specInputs.purchaseDate === 'string' ? String(specInputs.purchaseDate).trim() : ''
  const maturityDateIso = String(specInputs.maturityDate || '').trim()
  const frequencyRaw = Number(specInputs.couponFrequencyMonths)
  const couponFrequencyMonths = frequencyRaw === 6 || frequencyRaw === 12 ? frequencyRaw : 12
  const maturityRedemption = [...flows].reverse().find((flow) => flow.direction === 'inflow')
  const maturityAmount = maturityRedemption
    ? toNonNegativeNumber(maturityRedemption.amount, 'maturityAmount')
    : toNonNegativeNumber(specInputs.principal, 'principal')

  return normalizeInstrumentBundle({
    id: extras.id || `mapp-${Date.now()}`,
    instrumentType: 'investment',
    label: extras.label || MAPP_PRODUCT_SPEC.ui.formTitle,
    productId: MAPP_PRODUCT_SPEC.id,
    productSpecVersion: MAPP_PRODUCT_SPEC.specVersion,
    config: {
      productId: MAPP_PRODUCT_SPEC.id,
      productSpecVersion: MAPP_PRODUCT_SPEC.specVersion,
      subtype: 'mapp',
      principal: calculated.purchaseAmount - calculated.accruedInterestAmount,
      annualCouponRatePct: calculated.annualCouponRatePct,
      purchaseDate: purchaseDateIso || undefined,
      issueDate: issueDateIso || undefined,
      maturityDate: maturityDateIso,
      firstCouponDate:
        typeof specInputs.firstCouponDate === 'string'
          ? String(specInputs.firstCouponDate).trim() || undefined
          : undefined,
      couponFrequencyMonths,
      dayCountConvention: specInputs.dayCountConvention || 'ACT/ACT',
      couponSchedule: Array.isArray(specInputs.couponSchedule)
        ? specInputs.couponSchedule
        : undefined,
      purchaseAmount: calculated.purchaseAmount,
      accruedInterestAmount: calculated.accruedInterestAmount,
      category: extras.category || 'investment',
      description: extras.description
    },
    preview: {
      purchaseAmount: calculated.purchaseAmount,
      maturityAmount,
      gainAmount: maturityAmount - calculated.purchaseAmount,
      subtype: 'mapp',
      annualCouponRatePct: calculated.annualCouponRatePct,
      accruedInterestAmount: calculated.accruedInterestAmount
    },
    generatedFlows: flows,
    createdAt: extras.createdAt,
    updatedAt: new Date().toISOString()
  })
}

export {
  mapMappSpecInputsToLegacyInvestmentInput,
  mapLegacyMappPreviewToSpecOutputs,
  calculateMappFromSpecInputs,
  generateMappInstrumentBundleFromSpecInputs,
  createInvestmentMaturityPreview
}
