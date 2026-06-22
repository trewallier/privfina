import { createInvestmentMaturityPreview } from '../instruments.js'
import { parseIsoDate, formatIsoDate } from '../recurrence.js'

function toFiniteNumber(value, label) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a finite number.`)
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

function addMonthsUtc(date, months) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()))
}

function addYearsUtc(date, years) {
  return new Date(Date.UTC(date.getUTCFullYear() + years, date.getUTCMonth(), date.getUTCDate()))
}

function deriveBmapMaturityDate(startDateIso) {
  return formatIsoDate(addYearsUtc(parseIsoDate(startDateIso), 6))
}

function deriveBmapRateOutputs(specInputs) {
  const dkjBaseYieldPct = toFiniteNumber(specInputs.dkjBaseYieldPct, 'dkjBaseYieldPct')
  const effectiveDkjBaseYieldPct = Math.max(dkjBaseYieldPct, 0)
  const interestPremiumPct = toNonNegativeNumber(specInputs.interestPremiumPct, 'interestPremiumPct')
  const annualCouponRatePct = effectiveDkjBaseYieldPct + interestPremiumPct

  return {
    effectiveDkjBaseYieldPct,
    annualCouponRatePct,
    couponPaymentFrequency: 'quarterly',
    periodCouponRatePct: annualCouponRatePct / 4
  }
}

function deriveBmapAccruedInterestAmount(specInputs, annualCouponRatePct) {
  const startDateIso = String(specInputs.startDate || '').trim()
  const purchaseDateIso = typeof specInputs.purchaseDate === 'string' ? String(specInputs.purchaseDate).trim() : ''

  if (!purchaseDateIso) {
    return 0
  }

  const accrualStartIso = typeof specInputs.issueDate === 'string' && String(specInputs.issueDate).trim()
    ? String(specInputs.issueDate).trim()
    : startDateIso
  if (purchaseDateIso < accrualStartIso) {
    throw new Error('purchaseDate must be on or after startDate or issueDate.')
  }

  const principal = toNonNegativeNumber(specInputs.principal, 'principal')
  const days = Math.floor((parseIsoDate(purchaseDateIso).getTime() - parseIsoDate(accrualStartIso).getTime()) / 86400000)
  return (principal * annualCouponRatePct * days) / (100 * 360)
}

function buildBmapLegacyInvestmentInput(specInputs, purchaseAmount, annualCouponRatePct) {
  const startDateIso = String(specInputs.startDate || '').trim()
  const purchaseDateIso = typeof specInputs.purchaseDate === 'string' ? String(specInputs.purchaseDate).trim() : ''
  const maturityDateIso = deriveBmapMaturityDate(startDateIso)
  const purchaseIso = purchaseDateIso || startDateIso

  return {
    subtype: 'custom-bond',
    principal: toNonNegativeNumber(specInputs.principal, 'principal'),
    purchasePrice: purchaseAmount,
    annualRate: annualCouponRatePct / 100,
    purchaseDate: purchaseIso,
    maturityDate: maturityDateIso,
    issueDate: typeof specInputs.issueDate === 'string' ? String(specInputs.issueDate).trim() : startDateIso,
    transactionDate: purchaseIso,
    dueDate: maturityDateIso,
    couponPeriod: '0 0 1 */3 *'
  }
}

function calculateBmapFromSpecInputs(specInputs, options) {
  const createInvestmentMaturityPreviewFn = options?.createInvestmentMaturityPreview || createInvestmentMaturityPreview
  const principal = toNonNegativeNumber(specInputs.principal, 'principal')
  const rateOutputs = deriveBmapRateOutputs(specInputs)
  const accruedInterestAmount = deriveBmapAccruedInterestAmount(specInputs, rateOutputs.annualCouponRatePct)
  const purchaseAmount = principal + accruedInterestAmount
  const legacyInput = buildBmapLegacyInvestmentInput(specInputs, purchaseAmount, rateOutputs.annualCouponRatePct)
  const legacyPreview = createInvestmentMaturityPreviewFn(legacyInput)

  return {
    ...rateOutputs,
    accruedInterestAmount,
    purchaseAmount: toFiniteNumber(legacyPreview.purchaseAmount, 'purchaseAmount'),
    redemptionValue: toFiniteNumber(legacyPreview.maturityAmount, 'maturityAmount')
  }
}

function generateQuarterlyCouponFlows(specInputs, purchaseAmount, annualCouponRatePct) {
  const startDateIso = String(specInputs.startDate || '').trim()
  const maturityDateIso = deriveBmapMaturityDate(startDateIso)
  const purchaseDateIso = typeof specInputs.purchaseDate === 'string' ? String(specInputs.purchaseDate).trim() : ''
  const firstCouponDateIso = typeof specInputs.firstCouponDate === 'string' ? String(specInputs.firstCouponDate).trim() : ''
  const principal = toNonNegativeNumber(specInputs.principal, 'principal')
  const couponAmount = (principal * annualCouponRatePct) / 100 / 4
  const flows = [
    {
      date: purchaseDateIso || startDateIso,
      amount: purchaseAmount,
      direction: 'outflow',
      category: 'investment',
      description: 'BMÁP'
    }
  ]

  let couponDate = firstCouponDateIso ? parseIsoDate(firstCouponDateIso) : addMonthsUtc(parseIsoDate(startDateIso), 3)
  const maturityDate = parseIsoDate(maturityDateIso)
  while (couponDate.getTime() <= maturityDate.getTime()) {
    const couponIso = formatIsoDate(couponDate)
    if (couponIso >= (purchaseDateIso || startDateIso)) {
      flows.push({
        date: couponIso,
        amount: couponAmount,
        direction: 'inflow',
        category: 'investment',
        description: 'BMÁP'
      })
    }
    couponDate = addMonthsUtc(couponDate, 3)
  }

  flows.push({
    date: maturityDateIso,
    amount: principal,
    direction: 'inflow',
    category: 'investment',
    description: 'BMÁP'
  })

  return flows.sort((left, right) => left.date.localeCompare(right.date))
}

function generateBmapInstrumentBundleFromSpecInputs(specInputs, extras = {}, options) {
  const calculated = calculateBmapFromSpecInputs(specInputs, options)
  const flows = generateQuarterlyCouponFlows(specInputs, calculated.purchaseAmount, calculated.annualCouponRatePct)
  const startDateIso = String(specInputs.startDate || '').trim()
  const purchaseDateIso = typeof specInputs.purchaseDate === 'string' ? String(specInputs.purchaseDate).trim() : ''

  return {
    id: extras.id || `bmap-${Date.now()}`,
    instrumentType: 'investment',
    label: extras.label || 'Bónusz Magyar Állampapír',
    config: {
      subtype: 'bmap',
      principal: calculated.purchaseAmount - calculated.accruedInterestAmount,
      dkjBaseYieldPct: Number(specInputs.dkjBaseYieldPct),
      interestPremiumPct: Number(specInputs.interestPremiumPct),
      startDate: startDateIso,
      purchaseDate: purchaseDateIso || undefined,
      issueDate: typeof specInputs.issueDate === 'string' ? String(specInputs.issueDate).trim() || undefined : undefined,
      firstCouponDate: typeof specInputs.firstCouponDate === 'string' ? String(specInputs.firstCouponDate).trim() || undefined : undefined,
      purchaseAmount: calculated.purchaseAmount,
      accruedInterestAmount: calculated.accruedInterestAmount,
      annualCouponRatePct: calculated.annualCouponRatePct,
      effectiveDkjBaseYieldPct: calculated.effectiveDkjBaseYieldPct,
      periodCouponRatePct: calculated.periodCouponRatePct,
      couponPaymentFrequency: calculated.couponPaymentFrequency,
      category: extras.category || 'investment',
      description: extras.description
    },
    preview: {
      purchaseAmount: calculated.purchaseAmount,
      maturityAmount: calculated.redemptionValue,
      gainAmount: calculated.redemptionValue - calculated.purchaseAmount,
      subtype: 'bmap',
      annualCouponRatePct: calculated.annualCouponRatePct,
      couponPaymentFrequency: calculated.couponPaymentFrequency,
      effectiveDkjBaseYieldPct: calculated.effectiveDkjBaseYieldPct,
      periodCouponRatePct: calculated.periodCouponRatePct,
      accruedInterestAmount: calculated.accruedInterestAmount,
      redemptionValue: calculated.redemptionValue
    },
    generatedFlows: flows,
    createdAt: extras.createdAt,
    updatedAt: new Date().toISOString()
  }
}

export {
  deriveBmapRateOutputs,
  deriveBmapAccruedInterestAmount,
  calculateBmapFromSpecInputs,
  generateQuarterlyCouponFlows,
  generateBmapInstrumentBundleFromSpecInputs
}