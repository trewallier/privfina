/**
 * BMAP commercial calculation adapter (ADR 0032 / 0038).
 * Rate / accrued / coupon math from `@finance_engine/instruments/bmap`.
 */
import {
  deriveBmapRateOutputs,
  deriveBmapAccruedInterestAmount,
  generateBmapQuarterlyCouponFlows
} from '@finance_engine/instruments/bmap'
import { createInvestmentMaturityPreview, normalizeInstrumentBundle } from '../instruments.js'
import { toFiniteNumber, toNonNegativeNumber } from './spec-input-validators.js'
import { BMAP_PRODUCT_SPEC } from './bmap-form.js'

function buildBmapLegacyInvestmentInput(specInputs, purchaseAmount, annualCouponRatePct) {
  const issueDateIso = String(specInputs.issueDate || '').trim()
  const startDateIso = String(specInputs.startDate || '').trim() || issueDateIso
  const purchaseDateIso =
    typeof specInputs.purchaseDate === 'string' ? String(specInputs.purchaseDate).trim() : ''
  const maturityDateIso = String(specInputs.maturityDate || '').trim()
  const purchaseIso = purchaseDateIso || startDateIso

  return {
    subtype: 'custom-bond',
    principal: toNonNegativeNumber(specInputs.principal, 'principal'),
    purchasePrice: purchaseAmount,
    annualRate: annualCouponRatePct / 100,
    purchaseDate: purchaseIso,
    maturityDate: maturityDateIso,
    issueDate: issueDateIso || startDateIso,
    transactionDate: purchaseIso,
    dueDate: maturityDateIso,
    couponPeriod: '0 0 1 */3 *'
  }
}

function calculateBmapFromSpecInputs(specInputs, options) {
  const createInvestmentMaturityPreviewFn =
    options?.createInvestmentMaturityPreview || createInvestmentMaturityPreview
  const principal = toNonNegativeNumber(specInputs.principal, 'principal')
  const rateOutputs = deriveBmapRateOutputs(specInputs)
  const accruedInterestAmount = deriveBmapAccruedInterestAmount(
    specInputs,
    rateOutputs.annualCouponRatePct
  )
  const purchaseAmount = principal + accruedInterestAmount
  const legacyInput = buildBmapLegacyInvestmentInput(
    specInputs,
    purchaseAmount,
    rateOutputs.annualCouponRatePct
  )
  const legacyPreview = createInvestmentMaturityPreviewFn(legacyInput)

  return {
    ...rateOutputs,
    accruedInterestAmount,
    purchaseAmount: toFiniteNumber(legacyPreview.purchaseAmount, 'purchaseAmount')
  }
}

function generateQuarterlyCouponFlows(specInputs, purchaseAmount, annualCouponRatePct) {
  return generateBmapQuarterlyCouponFlows(specInputs, purchaseAmount, annualCouponRatePct).map(
    (flow) => ({
      date: flow.date,
      amount: flow.amount,
      direction: flow.direction === 'outflow' ? 'outflow' : 'inflow',
      category: flow.category || 'investment',
      description: flow.description || 'BMAP'
    })
  )
}

function generateBmapInstrumentBundleFromSpecInputs(specInputs, extras = {}, options) {
  const calculated = calculateBmapFromSpecInputs(specInputs, options)
  const flows = generateQuarterlyCouponFlows(
    specInputs,
    calculated.purchaseAmount,
    calculated.annualCouponRatePct
  )
  const issueDateIso = String(specInputs.issueDate || '').trim()
  const startDateIso = String(specInputs.startDate || '').trim() || issueDateIso
  const purchaseDateIso =
    typeof specInputs.purchaseDate === 'string' ? String(specInputs.purchaseDate).trim() : ''
  const maturityDateIso = String(specInputs.maturityDate || '').trim()

  return normalizeInstrumentBundle({
    id: extras.id || `bmap-${Date.now()}`,
    instrumentType: 'investment',
    label: extras.label || BMAP_PRODUCT_SPEC.ui.formTitle,
    productId: BMAP_PRODUCT_SPEC.id,
    productSpecVersion: BMAP_PRODUCT_SPEC.specVersion,
    config: {
      productId: BMAP_PRODUCT_SPEC.id,
      productSpecVersion: BMAP_PRODUCT_SPEC.specVersion,
      subtype: 'bmap',
      principal: calculated.purchaseAmount - calculated.accruedInterestAmount,
      annualCouponRatePct: calculated.annualCouponRatePct,
      startDate: startDateIso,
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
      subtype: 'bmap',
      annualCouponRatePct: calculated.annualCouponRatePct,
      accruedInterestAmount: calculated.accruedInterestAmount
    },
    generatedFlows: flows,
    createdAt: extras.createdAt,
    updatedAt: new Date().toISOString()
  })
}

export {
  deriveBmapRateOutputs,
  deriveBmapAccruedInterestAmount,
  calculateBmapFromSpecInputs,
  generateQuarterlyCouponFlows,
  generateBmapInstrumentBundleFromSpecInputs
}
