/**
 * Browser instrument adapters (ADR 0032 / ROADMAP §6a).
 * Formula math is owned by `@finance_engine`. This module keeps UI normalize helpers
 * and thin wrappers that map browser form shapes onto engine APIs.
 */
import {
  rollBusinessDay,
  calculateLoanMonthlyInstallment,
  monthlyInterestRateFromAnnual,
  resolveLoanSchedule,
  createLoanRepaymentPreview as createEngineLoanRepaymentPreview,
  createLoanInstrumentBundle,
  createInvestmentMaturityPreview as createEngineInvestmentMaturityPreview,
  createInvestmentInstrumentBundle,
  generateSalaryInstrumentCashFlows,
  generateSubscriptionInstrumentCashFlows,
  ceilToTenForint,
  resolveMonthlyDepositFromContractAmount,
  resolveContractAmountFromMonthlyDeposit,
  resolveHomeSavingsPremiumRatePct,
  calculateHomeSavingsDepositInterest,
  resolveHomeSavingsSchedule,
  generateHomeSavingsInstrumentCashFlows,
  createHomeSavingsInstrumentBundle as createEngineHomeSavingsInstrumentBundle
} from '@finance_engine/browser'

function createId(prefix) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${prefix}-${Date.now()}`
}

function normalizeDirection(direction) {
  return direction === 'outflow' ? 'outflow' : 'inflow'
}

function normalizeOptionalString(value) {
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function normalizeGeneratedFlow(flow, fallbackCategory, lineageContext = {}) {
  if (!flow || typeof flow !== 'object') {
    return null
  }

  const date = String(flow.date || '').trim()
  const amount = Number(flow.amount)
  const direction = normalizeDirection(flow.direction)
  const category = String(flow.category || '').trim() || fallbackCategory
  const description = typeof flow.description === 'string' ? flow.description : undefined
  const id = normalizeOptionalString(flow.id)
  const sourceInstrumentId =
    normalizeOptionalString(flow.sourceInstrumentId) ||
    normalizeOptionalString(lineageContext.sourceInstrumentId)
  const sourceInstrumentType =
    normalizeOptionalString(flow.sourceInstrumentType) ||
    normalizeOptionalString(lineageContext.sourceInstrumentType)

  if (!date || !Number.isFinite(amount) || amount < 0) {
    return null
  }

  return {
    id,
    date,
    amount,
    direction,
    category,
    description,
    sourceInstrumentId,
    sourceInstrumentType
  }
}

function stampGeneratedFlowLineage(flows, bundleId, instrumentType) {
  return flows.map((flow, index) => ({
    ...flow,
    id: normalizeOptionalString(flow.id) || `${bundleId}-flow-${index}`,
    sourceInstrumentId: bundleId,
    sourceInstrumentType: instrumentType
  }))
}

function normalizeInstrumentBundle(bundle) {
  if (!bundle || typeof bundle !== 'object') {
    return null
  }

  const instrumentType =
    bundle.instrumentType === 'subscription'
      ? 'subscription'
      : bundle.instrumentType === 'salary'
        ? 'salary'
        : bundle.instrumentType === 'loan'
          ? 'loan'
          : bundle.instrumentType === 'investment'
            ? 'investment'
            : bundle.instrumentType === 'home-savings'
              ? 'home-savings'
              : null

  if (!instrumentType) {
    return null
  }

  const id = typeof bundle.id === 'string' && bundle.id.trim() ? bundle.id.trim() : createId('instrument')
  const label =
    typeof bundle.label === 'string' && bundle.label.trim()
      ? bundle.label.trim()
      : `${instrumentType} instrument`
  const config = bundle.config && typeof bundle.config === 'object' ? { ...bundle.config } : {}
  const productId =
    normalizeOptionalString(bundle.productId) || normalizeOptionalString(config.productId)
  const productSpecVersion =
    normalizeOptionalString(bundle.productSpecVersion) ||
    normalizeOptionalString(config.productSpecVersion)
  if (productId) {
    config.productId = productId
  }
  if (productSpecVersion) {
    config.productSpecVersion = productSpecVersion
  }
  const fallbackCategory =
    instrumentType === 'salary'
      ? 'salary'
      : instrumentType === 'loan'
        ? 'loan'
        : instrumentType === 'investment'
          ? 'investment'
          : instrumentType === 'home-savings'
            ? 'home-savings'
            : 'subscription'
  const lineageContext = { sourceInstrumentId: id, sourceInstrumentType: instrumentType }
  const generatedFlows = stampGeneratedFlowLineage(
    Array.isArray(bundle.generatedFlows)
      ? bundle.generatedFlows
          .map((entry) => normalizeGeneratedFlow(entry, fallbackCategory, lineageContext))
          .filter((entry) => entry !== null)
      : [],
    id,
    instrumentType
  )

  return {
    id,
    instrumentType,
    label,
    productId,
    productSpecVersion,
    config,
    preview: bundle.preview && typeof bundle.preview === 'object' ? bundle.preview : undefined,
    generatedFlows,
    createdAt: typeof bundle.createdAt === 'string' ? bundle.createdAt : new Date().toISOString(),
    updatedAt: typeof bundle.updatedAt === 'string' ? bundle.updatedAt : new Date().toISOString()
  }
}

function normalizeInstrumentBundles(bundles) {
  if (!Array.isArray(bundles)) {
    return []
  }
  return bundles.map(normalizeInstrumentBundle).filter((bundle) => bundle !== null)
}

function parseHolidayList(raw) {
  if (!raw || typeof raw !== 'string') {
    return []
  }
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry))
}

function resolveLoanTermMonths(input) {
  if (Number.isInteger(Number(input.termMonths)) && Number(input.termMonths) > 0) {
    return Number(input.termMonths)
  }
  const parsed = Number(input.termValue)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('Loan term must be a positive integer.')
  }
  return input.termUnit === 'years' ? parsed * 12 : parsed
}

function createLoanRepaymentPreview(input) {
  const termMonths = resolveLoanTermMonths(input)
  return createEngineLoanRepaymentPreview({
    ...input,
    termMonths
  })
}

function generateLoanInstrumentBundle(input) {
  const termMonths = resolveLoanTermMonths(input)
  const gracePeriodMonths = Number(input.gracePeriodMonths) || 0
  const capitalizeInterestAtGraceEnd =
    gracePeriodMonths > 0 && input.capitalizeInterestAtGraceEnd === true

  const engineBundle = createLoanInstrumentBundle({
    id: input.id,
    label: input.label,
    productId: input.productId,
    productSpecVersion: input.productSpecVersion,
    principal: Number(input.principal),
    annualRate: Number(input.annualRate),
    termMonths,
    startDate: input.startDate,
    repaymentDayOfMonth: Number(input.repaymentDayOfMonth),
    gracePeriodMonths,
    capitalizeInterestAtGraceEnd,
    interestDayCountConvention: input.interestDayCountConvention,
    paymentRounding: input.paymentRounding,
    includeDisbursement: input.includeDisbursement,
    category: input.category || 'loan',
    description: input.description,
    createdAt: input.createdAt
  })

  return normalizeInstrumentBundle({
    ...engineBundle,
    config: {
      ...engineBundle.config,
      termValue: input.termValue !== undefined ? Number(input.termValue) : termMonths,
      termUnit: input.termUnit || 'months',
      loanPurpose: input.loanPurpose,
      commercialProductCode: input.commercialProductCode,
      baseAnnualInterestRatePct:
        input.baseAnnualInterestRatePct !== undefined
          ? Number(input.baseAnnualInterestRatePct)
          : undefined,
      activeDiscountNames: Array.isArray(input.activeDiscountNames)
        ? [...input.activeDiscountNames]
        : undefined,
      includeOptionalFeeNames: Array.isArray(input.includeOptionalFeeNames)
        ? [...input.includeOptionalFeeNames]
        : undefined
    }
  })
}

function generateSalaryInstrumentBundle(input) {
  const scheduleMode = input.scheduleMode === 'cron-like' ? 'cron-like' : 'custom-monthly-working-day'
  const holidays = parseHolidayList(input.holidaysRaw || '')
  const endDate =
    typeof input.endDate === 'string' && input.endDate.trim() ? input.endDate.trim() : undefined
  const occurrences =
    input.occurrences === undefined || input.occurrences === null || input.occurrences === ''
      ? undefined
      : Number(input.occurrences)

  const generatedFlows = generateSalaryInstrumentCashFlows({
    startDate: input.startDate,
    endDate,
    occurrences,
    amount: Number(input.amount),
    category: input.category || 'salary',
    description: input.description,
    scheduleMode,
    cronPeriod: input.cronPeriod,
    customMonthlyRule: {
      targetDayOfMonth: input.targetDayOfMonth ?? 10,
      businessDayConvention: input.businessDayConvention || 'preceding',
      holidays
    }
  })

  return normalizeInstrumentBundle({
    id: input.id || createId('salary'),
    instrumentType: 'salary',
    label: input.label || 'Salary',
    config: {
      scheduleMode,
      startDate: input.startDate,
      endDate,
      occurrences,
      amount: Number(input.amount),
      category: input.category || 'salary',
      description: input.description,
      cronPeriod: input.cronPeriod,
      targetDayOfMonth: input.targetDayOfMonth,
      businessDayConvention: input.businessDayConvention || 'preceding',
      holidays
    },
    generatedFlows,
    createdAt: input.createdAt,
    updatedAt: new Date().toISOString()
  })
}

function generateSubscriptionInstrumentBundle(input) {
  const endDate =
    typeof input.endDate === 'string' && input.endDate.trim() ? input.endDate.trim() : undefined
  const occurrences =
    input.occurrences === undefined || input.occurrences === null || input.occurrences === ''
      ? undefined
      : Number(input.occurrences)

  const generatedFlows = generateSubscriptionInstrumentCashFlows({
    period: String(input.period || '').trim(),
    startDate: input.startDate,
    endDate,
    occurrences,
    amount: Number(input.amount),
    category: input.category || 'subscription',
    description: input.description
  })

  return normalizeInstrumentBundle({
    id: input.id || createId('subscription'),
    instrumentType: 'subscription',
    label: input.label || 'Subscription',
    config: {
      period: String(input.period || '').trim(),
      startDate: input.startDate,
      endDate,
      occurrences,
      amount: Number(input.amount),
      category: input.category || 'subscription',
      description: input.description
    },
    generatedFlows,
    createdAt: input.createdAt,
    updatedAt: new Date().toISOString()
  })
}

function parseYearlyInflation(raw) {
  if (Array.isArray(raw)) {
    return raw
  }
  if (!raw || typeof raw !== 'string') {
    return []
  }
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .map((entry) => {
      const match = /^(\d{4})\s*:\s*([+-]?(?:\d+\.?\d*|\d*\.\d+))$/.exec(entry)
      if (!match) {
        return null
      }
      return { year: Number(match[1]), rate: Number(match[2]) }
    })
    .filter((entry) => entry !== null)
}

function mapInvestmentBrowserInputToEngine(input) {
  const subtype = input.subtype === 'dkj' ? 'discount-bond' : input.subtype
  const yearlyInflation = parseYearlyInflation(input.yearlyInflation ?? input.yearlyInflationRaw)
  const useContractDates =
    subtype === 'discount-bond' || subtype === 'inflation-linked-bond'
  const purchaseDate = useContractDates
    ? String(input.transactionDate || input.purchaseDate || '').trim()
    : String(input.purchaseDate || '').trim()
  const maturityDate = useContractDates
    ? String(input.dueDate || input.maturityDate || '').trim()
    : String(input.maturityDate || '').trim()

  return {
    id: input.id,
    label: input.label,
    productId: input.productId,
    productSpecVersion: input.productSpecVersion,
    subtype,
    purchaseDate,
    maturityDate,
    issueDate: input.issueDate,
    transactionDate: input.transactionDate || purchaseDate,
    dueDate: input.dueDate || maturityDate,
    principal: Number(input.principal),
    purchasePrice: input.purchasePrice,
    annualRate: input.annualRate,
    spreadRate: input.spreadRate,
    yearlyInflation,
    saleDate: input.saleDate,
    saleValue: input.saleValue,
    couponPeriod: input.couponPeriod,
    category: input.category || 'investment',
    description: input.description,
    createdAt: input.createdAt
  }
}

function createInvestmentMaturityPreview(input) {
  return createEngineInvestmentMaturityPreview(mapInvestmentBrowserInputToEngine(input))
}

function generateInvestmentInstrumentBundle(input) {
  const engineInput = mapInvestmentBrowserInputToEngine(input)
  const engineBundle = createInvestmentInstrumentBundle(engineInput)

  return normalizeInstrumentBundle({
    ...engineBundle,
    config: {
      ...engineBundle.config,
      subtype: input.subtype,
      yearlyInflationRaw: input.yearlyInflationRaw,
      termMonths: input.termMonths,
      remainingDays: input.remainingDays,
      purchasePricePct: input.purchasePricePct
    }
  })
}

function createHomeSavingsInstrumentBundle(input) {
  const engineBundle = createEngineHomeSavingsInstrumentBundle(input)
  return normalizeInstrumentBundle(engineBundle)
}

function flattenInstrumentFlows(instrumentBundles) {
  if (!Array.isArray(instrumentBundles)) {
    return []
  }

  return instrumentBundles.flatMap((bundle) => {
    const instrumentType = bundle?.instrumentType
    const bundleId = typeof bundle?.id === 'string' ? bundle.id : undefined
    return (bundle.generatedFlows || []).map((flow, index) => ({
      ...flow,
      id: normalizeOptionalString(flow.id) || (bundleId ? `${bundleId}-flow-${index}` : undefined),
      sourceInstrumentId: normalizeOptionalString(flow.sourceInstrumentId) || bundleId,
      sourceInstrumentType: normalizeOptionalString(flow.sourceInstrumentType) || instrumentType
    }))
  })
}

export {
  normalizeInstrumentBundle,
  normalizeInstrumentBundles,
  stampGeneratedFlowLineage,
  parseHolidayList,
  rollBusinessDay,
  generateSalaryInstrumentBundle,
  generateSubscriptionInstrumentBundle,
  calculateLoanMonthlyInstallment,
  monthlyInterestRateFromAnnual,
  resolveLoanSchedule,
  createLoanRepaymentPreview,
  generateLoanInstrumentBundle,
  createInvestmentMaturityPreview,
  generateInvestmentInstrumentBundle,
  ceilToTenForint,
  resolveMonthlyDepositFromContractAmount,
  resolveContractAmountFromMonthlyDeposit,
  resolveHomeSavingsPremiumRatePct,
  calculateHomeSavingsDepositInterest,
  resolveHomeSavingsSchedule,
  generateHomeSavingsInstrumentCashFlows,
  createHomeSavingsInstrumentBundle,
  flattenInstrumentFlows
}
