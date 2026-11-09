/**
 * Babakötvény commercial calculation adapter (ADR 0032 / 0038 / ROADMAP §6j).
 * Rate / accrued / coupon math from `@finance_engine/instruments/baba`.
 */
import {
  deriveBabaRateOutputs,
  deriveBabaAccruedInterestAmount,
  generateBabaAnnualCouponFlows
} from '@finance_engine/instruments/baba'
import { createInvestmentMaturityPreview, normalizeInstrumentBundle } from '../instruments.js'
import { toFiniteNumber, toNonNegativeNumber } from './spec-input-validators.js'
import { BABA_PRODUCT_SPEC } from './baba-form.js'

function calculateBabaFromSpecInputs(specInputs, options) {
  void options
  const principal = toNonNegativeNumber(specInputs.principal, 'principal')
  const rateOutputs = deriveBabaRateOutputs(specInputs)
  const accruedInterestAmount = deriveBabaAccruedInterestAmount(
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
function mapBabaSpecInputsToLegacyInvestmentInput(specInputs) {
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

function mapLegacyBabaPreviewToSpecOutputs(_legacyPreview, specInputs) {
  return calculateBabaFromSpecInputs(specInputs)
}

function generateBabaInstrumentBundleFromSpecInputs(specInputs, extras = {}) {
  const calculated = calculateBabaFromSpecInputs(specInputs)
  const flows = generateBabaAnnualCouponFlows(
    specInputs,
    calculated.purchaseAmount,
    calculated.annualCouponRatePct
  ).map((flow) => ({
    date: flow.date,
    amount: flow.amount,
    direction: flow.direction === 'outflow' ? 'outflow' : 'inflow',
    category: flow.category || 'investment',
    description: flow.description || 'BABA'
  }))
  const issueDateIso = String(specInputs.issueDate || '').trim()
  const purchaseDateIso =
    typeof specInputs.purchaseDate === 'string' ? String(specInputs.purchaseDate).trim() : ''
  const maturityDateIso = String(specInputs.maturityDate || '').trim()

  return normalizeInstrumentBundle({
    id: extras.id || `baba-${Date.now()}`,
    instrumentType: 'investment',
    label: extras.label || BABA_PRODUCT_SPEC.ui.formTitle,
    productId: BABA_PRODUCT_SPEC.id,
    productSpecVersion: BABA_PRODUCT_SPEC.specVersion,
    config: {
      productId: BABA_PRODUCT_SPEC.id,
      productSpecVersion: BABA_PRODUCT_SPEC.specVersion,
      subtype: 'baba',
      principal: calculated.purchaseAmount - calculated.accruedInterestAmount,
      annualCouponRatePct: calculated.annualCouponRatePct,
      purchaseDate: purchaseDateIso || undefined,
      issueDate: issueDateIso || undefined,
      maturityDate: maturityDateIso,
      firstCouponDate:
        typeof specInputs.firstCouponDate === 'string'
          ? String(specInputs.firstCouponDate).trim() || undefined
          : undefined,
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
      maturityAmount: toNonNegativeNumber(specInputs.principal, 'principal'),
      gainAmount:
        toNonNegativeNumber(specInputs.principal, 'principal') - calculated.purchaseAmount,
      subtype: 'baba',
      annualCouponRatePct: calculated.annualCouponRatePct,
      accruedInterestAmount: calculated.accruedInterestAmount
    },
    generatedFlows: flows,
    createdAt: extras.createdAt,
    updatedAt: new Date().toISOString()
  })
}

export {
  mapBabaSpecInputsToLegacyInvestmentInput,
  mapLegacyBabaPreviewToSpecOutputs,
  calculateBabaFromSpecInputs,
  generateBabaInstrumentBundleFromSpecInputs,
  createInvestmentMaturityPreview
}
