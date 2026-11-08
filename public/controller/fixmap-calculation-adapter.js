/**
 * FixMÁP commercial calculation adapter (ADR 0032 / 0038).
 * Rate / accrued / coupon math from `@finance_engine/instruments/fixmap`.
 */
import {
  deriveFixmapRateOutputs,
  deriveFixmapAccruedInterestAmount,
  generateFixmapAnnualCouponFlows
} from '@finance_engine/instruments/fixmap'
import { createInvestmentMaturityPreview, normalizeInstrumentBundle } from '../instruments.js'
import { toFiniteNumber, toNonNegativeNumber } from './spec-input-validators.js'
import { FIXMAP_PRODUCT_SPEC } from './fixmap-form.js'

function calculateFixmapFromSpecInputs(specInputs, options) {
  void options
  const principal = toNonNegativeNumber(specInputs.principal, 'principal')
  const rateOutputs = deriveFixmapRateOutputs(specInputs)
  const accruedInterestAmount = deriveFixmapAccruedInterestAmount(
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
function mapFixmapSpecInputsToLegacyInvestmentInput(specInputs) {
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

function mapLegacyFixmapPreviewToSpecOutputs(_legacyPreview, specInputs) {
  return calculateFixmapFromSpecInputs(specInputs)
}

function generateFixmapInstrumentBundleFromSpecInputs(specInputs, extras = {}) {
  const calculated = calculateFixmapFromSpecInputs(specInputs)
  const flows = generateFixmapAnnualCouponFlows(
    specInputs,
    calculated.purchaseAmount,
    calculated.annualCouponRatePct
  ).map((flow) => ({
    date: flow.date,
    amount: flow.amount,
    direction: flow.direction === 'outflow' ? 'outflow' : 'inflow',
    category: flow.category || 'investment',
    description: flow.description || 'FixMAP'
  }))
  const issueDateIso = String(specInputs.issueDate || '').trim()
  const purchaseDateIso =
    typeof specInputs.purchaseDate === 'string' ? String(specInputs.purchaseDate).trim() : ''
  const maturityDateIso = String(specInputs.maturityDate || '').trim()

  return normalizeInstrumentBundle({
    id: extras.id || `fixmap-${Date.now()}`,
    instrumentType: 'investment',
    label: extras.label || FIXMAP_PRODUCT_SPEC.ui.formTitle,
    productId: FIXMAP_PRODUCT_SPEC.id,
    productSpecVersion: FIXMAP_PRODUCT_SPEC.specVersion,
    config: {
      productId: FIXMAP_PRODUCT_SPEC.id,
      productSpecVersion: FIXMAP_PRODUCT_SPEC.specVersion,
      subtype: 'fixmap',
      principal: calculated.purchaseAmount - calculated.accruedInterestAmount,
      annualCouponRatePct: calculated.annualCouponRatePct,
      purchaseDate: purchaseDateIso || undefined,
      issueDate: issueDateIso || undefined,
      maturityDate: maturityDateIso,
      firstCouponDate:
        typeof specInputs.firstCouponDate === 'string'
          ? String(specInputs.firstCouponDate).trim() || undefined
          : undefined,
      dayCountConvention: specInputs.dayCountConvention || 'ACT/360',
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
      subtype: 'fixmap',
      annualCouponRatePct: calculated.annualCouponRatePct,
      accruedInterestAmount: calculated.accruedInterestAmount
    },
    generatedFlows: flows,
    createdAt: extras.createdAt,
    updatedAt: new Date().toISOString()
  })
}

export {
  mapFixmapSpecInputsToLegacyInvestmentInput,
  mapLegacyFixmapPreviewToSpecOutputs,
  calculateFixmapFromSpecInputs,
  generateFixmapInstrumentBundleFromSpecInputs,
  createInvestmentMaturityPreview
}
