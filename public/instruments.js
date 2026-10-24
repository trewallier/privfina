import {
  parseIsoDate,
  formatIsoDate,
  daysInMonthUtc,
  parseRecurringSchedule,
  expandRecurringFlows,
  normalizeRecurringDefinition
} from './recurrence.js'

function createId(prefix) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${prefix}-${Date.now()}`
}

function normalizeDirection(direction) {
  return direction === 'outflow' ? 'outflow' : 'inflow'
}

function normalizeAmount(amount) {
  const parsed = Number(amount)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error('Amount must be a non-negative finite number.')
  }
  return parsed
}

function normalizeOccurrences(value) {
  if (value === undefined || value === null || value === '') {
    return undefined
  }

  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('Occurrences must be a positive integer.')
  }

  return parsed
}

function assertBoundedHorizon(endDate, occurrences) {
  const hasEndDate = typeof endDate === 'string' && endDate.length > 0
  const hasOccurrences = typeof occurrences === 'number'

  if (!hasEndDate && !hasOccurrences) {
    throw new Error('Instrument generation requires end date or occurrences.')
  }
}

function isWeekendUtc(date) {
  const day = date.getUTCDay()
  return day === 0 || day === 6
}

function toHolidaySet(holidays = []) {
  return new Set(holidays)
}

function isBusinessDayUtc(date, holidaysSet) {
  return !isWeekendUtc(date) && !holidaysSet.has(formatIsoDate(date))
}

function addDaysUtc(date, days) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days))
}

function rollFollowing(baseDate, holidaysSet) {
  let candidate = baseDate
  while (!isBusinessDayUtc(candidate, holidaysSet)) {
    candidate = addDaysUtc(candidate, 1)
  }
  return candidate
}

function rollPreceding(baseDate, holidaysSet) {
  let candidate = baseDate
  while (!isBusinessDayUtc(candidate, holidaysSet)) {
    candidate = addDaysUtc(candidate, -1)
  }
  return candidate
}

function rollBusinessDay(baseDateIso, convention = 'preceding', holidays = []) {
  if (convention === 'unadjusted') {
    return baseDateIso
  }

  const baseDate = parseIsoDate(baseDateIso)
  const baseMonth = baseDate.getUTCMonth()
  const holidaysSet = toHolidaySet(holidays)

  if (convention === 'following') {
    return formatIsoDate(rollFollowing(baseDate, holidaysSet))
  }

  if (convention === 'preceding') {
    return formatIsoDate(rollPreceding(baseDate, holidaysSet))
  }

  if (convention === 'modified-following') {
    const adjusted = rollFollowing(baseDate, holidaysSet)
    if (adjusted.getUTCMonth() !== baseMonth) {
      return formatIsoDate(rollPreceding(baseDate, holidaysSet))
    }
    return formatIsoDate(adjusted)
  }

  if (convention === 'modified-preceding') {
    const adjusted = rollPreceding(baseDate, holidaysSet)
    if (adjusted.getUTCMonth() !== baseMonth) {
      return formatIsoDate(rollFollowing(baseDate, holidaysSet))
    }
    return formatIsoDate(adjusted)
  }

  throw new Error('Unsupported business-day convention.')
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
    normalizeOptionalString(flow.sourceInstrumentId) || normalizeOptionalString(lineageContext.sourceInstrumentId)
  const sourceInstrumentType =
    normalizeOptionalString(flow.sourceInstrumentType) || normalizeOptionalString(lineageContext.sourceInstrumentType)

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

function generateSalaryFlowsFromCustomRule(definition) {
  const startDate = parseIsoDate(definition.startDate)
  const endDate = definition.endDate ? parseIsoDate(definition.endDate) : null

  if (endDate && endDate.getTime() < startDate.getTime()) {
    throw new Error('Salary end date must be on or after start date.')
  }

  const targetDay = Number(definition.targetDayOfMonth ?? 10)
  if (!Number.isInteger(targetDay) || targetDay < 1 || targetDay > 31) {
    throw new Error('Salary target day must be an integer between 1 and 31.')
  }

  const convention = definition.businessDayConvention || 'preceding'
  const holidays = Array.isArray(definition.holidays) ? definition.holidays : []
  const maxOccurrences = definition.occurrences
  const generated = []

  let year = startDate.getUTCFullYear()
  let month = startDate.getUTCMonth()
  while (generated.length < maxOccurrences) {
    const day = Math.min(targetDay, daysInMonthUtc(year, month))
    const targetIso = formatIsoDate(new Date(Date.UTC(year, month, day)))
    const adjustedIso = rollBusinessDay(targetIso, convention, holidays)
    const adjustedDate = parseIsoDate(adjustedIso)

    if (adjustedDate.getTime() >= startDate.getTime()) {
      if (endDate && adjustedDate.getTime() > endDate.getTime()) {
        break
      }

      generated.push({
        date: adjustedIso,
        amount: definition.amount,
        direction: 'inflow',
        category: definition.category,
        description: definition.description
      })
    }

    month += 1
    if (month > 11) {
      month = 0
      year += 1
    }

    if (endDate) {
      const nextMonth = new Date(Date.UTC(year, month, 1))
      if (nextMonth.getTime() > endDate.getTime()) {
        break
      }
    }
  }

  return generated
}

function generateSalaryInstrumentBundle(input) {
  const amount = normalizeAmount(input.amount)
  const occurrences = normalizeOccurrences(input.occurrences)
  const endDate = typeof input.endDate === 'string' && input.endDate.trim() ? input.endDate.trim() : undefined
  assertBoundedHorizon(endDate, occurrences)

  const scheduleMode = input.scheduleMode === 'cron-like' ? 'cron-like' : 'custom-monthly-working-day'
  let generatedFlows

  if (scheduleMode === 'cron-like') {
    const cronPeriod = String(input.cronPeriod || '').trim()
    parseRecurringSchedule(cronPeriod)

    const recurringDefinition = normalizeRecurringDefinition({
      period: cronPeriod,
      startDate: input.startDate,
      endDate,
      occurrences,
      amount,
      direction: 'inflow',
      category: input.category || 'salary'
    })

    if (!recurringDefinition) {
      throw new Error('Invalid salary instrument definition.')
    }

    const rangeEnd = endDate || '9999-12-31'
    generatedFlows = expandRecurringFlows(recurringDefinition, input.startDate, rangeEnd).map((flow) => ({
      ...flow,
      description: input.description
    }))
  } else {
    generatedFlows = generateSalaryFlowsFromCustomRule({
      startDate: input.startDate,
      endDate,
      occurrences: occurrences ?? Number.MAX_SAFE_INTEGER,
      amount,
      targetDayOfMonth: input.targetDayOfMonth ?? 10,
      businessDayConvention: input.businessDayConvention || 'preceding',
      holidays: parseHolidayList(input.holidaysRaw || ''),
      category: input.category || 'salary',
      description: input.description
    })
  }

  return normalizeInstrumentBundle({
    id: input.id || createId('salary'),
    instrumentType: 'salary',
    label: input.label || 'Salary',
    config: {
      scheduleMode,
      startDate: input.startDate,
      endDate,
      occurrences,
      amount,
      category: input.category || 'salary',
      description: input.description,
      cronPeriod: input.cronPeriod,
      targetDayOfMonth: input.targetDayOfMonth,
      businessDayConvention: input.businessDayConvention || 'preceding',
      holidays: parseHolidayList(input.holidaysRaw || '')
    },
    generatedFlows,
    createdAt: input.createdAt,
    updatedAt: new Date().toISOString()
  })
}

function generateSubscriptionInstrumentBundle(input) {
  const amount = normalizeAmount(input.amount)
  const occurrences = normalizeOccurrences(input.occurrences)
  const endDate = typeof input.endDate === 'string' && input.endDate.trim() ? input.endDate.trim() : undefined
  assertBoundedHorizon(endDate, occurrences)

  const recurringDefinition = normalizeRecurringDefinition({
    period: String(input.period || '').trim(),
    startDate: input.startDate,
    endDate,
    occurrences,
    amount,
    direction: 'outflow',
    category: input.category || 'subscription'
  })

  if (!recurringDefinition) {
    throw new Error('Invalid subscription instrument definition.')
  }

  parseRecurringSchedule(recurringDefinition.period)

  const rangeEnd = endDate || '9999-12-31'
  const generatedFlows = expandRecurringFlows(recurringDefinition, recurringDefinition.startDate, rangeEnd).map(
    (flow) => ({
      ...flow,
      description: input.description
    })
  )

  return normalizeInstrumentBundle({
    id: input.id || createId('subscription'),
    instrumentType: 'subscription',
    label: input.label || 'Subscription',
    config: {
      period: recurringDefinition.period,
      startDate: recurringDefinition.startDate,
      endDate,
      occurrences,
      amount,
      category: recurringDefinition.category,
      description: input.description
    },
    generatedFlows,
    createdAt: input.createdAt,
    updatedAt: new Date().toISOString()
  })
}

const LOAN_MONTHS_PER_YEAR = 12
const LOAN_EQUAL_MONTH_DAYS_NON_LEAP = 365 / LOAN_MONTHS_PER_YEAR
const LOAN_EQUAL_MONTH_DAYS_LEAP = 366 / LOAN_MONTHS_PER_YEAR
const LOAN_ACT_360_YEAR_DAYS = 360
const LOAN_ACT_365_YEAR_DAYS = 365
const LOAN_ACT_366_YEAR_DAYS = 366

function normalizeInterestDayCountConvention(value) {
  if (value === undefined || value === null || value === '' || value === '30/360') {
    return '30/360'
  }
  if (value === 'act/360' || value === 'act/365' || value === 'act/366') {
    return value
  }
  throw new Error('interestDayCountConvention must be one of 30/360, act/360, act/365, act/366.')
}

function normalizePaymentRounding(value) {
  if (value === undefined || value === null || value === '' || value === 'none') {
    return 'none'
  }
  if (value === 'forint') {
    return 'forint'
  }
  throw new Error('paymentRounding must be none or forint.')
}

/** Equal-installment monthly factor from annual contractual rate (ADR 0025). */
function monthlyInterestRateFromAnnual(annualRate, convention = '30/360') {
  const normalized = normalizeInterestDayCountConvention(convention)
  if (normalized === 'act/360') {
    return (annualRate * LOAN_EQUAL_MONTH_DAYS_NON_LEAP) / LOAN_ACT_360_YEAR_DAYS
  }
  if (normalized === 'act/365') {
    return (annualRate * LOAN_EQUAL_MONTH_DAYS_NON_LEAP) / LOAN_ACT_365_YEAR_DAYS
  }
  if (normalized === 'act/366') {
    return (annualRate * LOAN_EQUAL_MONTH_DAYS_LEAP) / LOAN_ACT_366_YEAR_DAYS
  }
  return annualRate / LOAN_MONTHS_PER_YEAR
}

function roundLevelInstallment(amount, rounding) {
  return rounding === 'forint' ? Math.round(amount) : amount
}

function roundGraceInterestOnly(amount, rounding) {
  return rounding === 'forint' ? Math.floor(amount) : amount
}

function calculateLoanMonthlyInstallment(principal, annualRate, termMonths, options = {}) {
  const normalizedPrincipal = Number(principal)
  const normalizedAnnualRate = Number(annualRate)
  const normalizedTermMonths = Number(termMonths)

  if (!Number.isFinite(normalizedPrincipal) || normalizedPrincipal <= 0) {
    throw new Error('Loan principal must be positive.')
  }

  if (!Number.isFinite(normalizedAnnualRate) || normalizedAnnualRate < 0) {
    throw new Error('Loan annual rate must be non-negative.')
  }

  if (!Number.isInteger(normalizedTermMonths) || normalizedTermMonths <= 0) {
    throw new Error('Loan term must be a positive integer number of months.')
  }

  const interestDayCountConvention = normalizeInterestDayCountConvention(
    options.interestDayCountConvention
  )
  const paymentRounding = normalizePaymentRounding(options.paymentRounding)
  const monthlyRate = monthlyInterestRateFromAnnual(
    normalizedAnnualRate,
    interestDayCountConvention
  )
  if (monthlyRate === 0) {
    return roundLevelInstallment(normalizedPrincipal / normalizedTermMonths, paymentRounding)
  }

  const factor = Math.pow(1 + monthlyRate, normalizedTermMonths)
  const raw = (normalizedPrincipal * monthlyRate * factor) / (factor - 1)
  return roundLevelInstallment(raw, paymentRounding)
}

function normalizeLoanGracePeriodMonths(value, termMonths) {
  if (value === undefined || value === null || value === '') {
    return 0
  }

  const gracePeriodMonths = Number(value)
  if (!Number.isInteger(gracePeriodMonths) || gracePeriodMonths < 0) {
    throw new Error('Grace period months must be a non-negative integer.')
  }

  if (gracePeriodMonths >= termMonths) {
    throw new Error('Grace period months must be less than the loan term.')
  }

  return gracePeriodMonths
}

function resolveLoanSchedule(input) {
  const principal = normalizeAmount(input.principal)
  const annualRate = Number(input.annualRate)
  const termMonths = Number(input.termMonths)

  if (!Number.isFinite(annualRate) || annualRate < 0) {
    throw new Error('Loan annual rate must be non-negative.')
  }

  if (!Number.isInteger(termMonths) || termMonths <= 0) {
    throw new Error('Loan term must be a positive integer number of months.')
  }

  const gracePeriodMonths = normalizeLoanGracePeriodMonths(input.gracePeriodMonths, termMonths)
  const capitalizeInterestAtGraceEnd =
    gracePeriodMonths > 0 && input.capitalizeInterestAtGraceEnd === true
  const amortizationMonths = termMonths - gracePeriodMonths
  const interestDayCountConvention = normalizeInterestDayCountConvention(
    input.interestDayCountConvention
  )
  const paymentRounding = normalizePaymentRounding(input.paymentRounding)
  const monthlyRate = monthlyInterestRateFromAnnual(annualRate, interestDayCountConvention)

  let amortizingPrincipal = principal
  let graceInterestOnlyPayment = 0
  let graceCashTotal = 0

  if (gracePeriodMonths > 0) {
    if (capitalizeInterestAtGraceEnd) {
      amortizingPrincipal = principal * Math.pow(1 + monthlyRate, gracePeriodMonths)
    } else {
      graceInterestOnlyPayment = roundGraceInterestOnly(principal * monthlyRate, paymentRounding)
      graceCashTotal = graceInterestOnlyPayment * gracePeriodMonths
    }
  }

  const monthlyInstallment = calculateLoanMonthlyInstallment(
    amortizingPrincipal,
    annualRate,
    amortizationMonths,
    { interestDayCountConvention, paymentRounding }
  )
  const amortizationTotal = monthlyInstallment * amortizationMonths
  const totalRepayment = graceCashTotal + amortizationTotal
  const paymentCount = capitalizeInterestAtGraceEnd
    ? amortizationMonths
    : gracePeriodMonths + amortizationMonths

  return {
    principal,
    annualRate,
    termMonths,
    gracePeriodMonths,
    capitalizeInterestAtGraceEnd,
    amortizationMonths,
    interestDayCountConvention,
    paymentRounding,
    monthlyRate,
    amortizingPrincipal,
    graceInterestOnlyPayment,
    monthlyInstallment,
    paymentCount,
    totalRepayment,
    totalInterest: totalRepayment - principal
  }
}

function createLoanRepaymentPreview(input) {
  const schedule = resolveLoanSchedule({
    principal: input.principal,
    annualRate: input.annualRate,
    termMonths: input.termMonths,
    gracePeriodMonths: input.gracePeriodMonths,
    capitalizeInterestAtGraceEnd: input.capitalizeInterestAtGraceEnd,
    interestDayCountConvention: input.interestDayCountConvention,
    paymentRounding: input.paymentRounding
  })

  return {
    monthlyInstallment: schedule.monthlyInstallment,
    totalRepayment: schedule.totalRepayment,
    totalInterest: schedule.totalInterest,
    termMonths: schedule.termMonths,
    paymentCount: schedule.paymentCount,
    gracePeriodMonths: schedule.gracePeriodMonths,
    amortizationMonths: schedule.amortizationMonths,
    graceInterestOnlyPayment: schedule.graceInterestOnlyPayment,
    amortizingPrincipal: schedule.amortizingPrincipal
  }
}

function normalizeLoanTermMonths(termValue, termUnit) {
  const parsed = Number(termValue)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('Loan term must be a positive integer.')
  }

  return termUnit === 'years' ? parsed * 12 : parsed
}

function incrementLoanYearMonth(year, month) {
  const nextMonth = month + 1
  if (nextMonth > 11) {
    return { year: year + 1, month: 0 }
  }
  return { year, month: nextMonth }
}

function generateLoanInstrumentFlows(input) {
  const termMonths = normalizeLoanTermMonths(input.termValue, input.termUnit)
  const schedule = resolveLoanSchedule({
    principal: input.principal,
    annualRate: input.annualRate,
    termMonths,
    gracePeriodMonths: input.gracePeriodMonths,
    capitalizeInterestAtGraceEnd: input.capitalizeInterestAtGraceEnd,
    interestDayCountConvention: input.interestDayCountConvention,
    paymentRounding: input.paymentRounding
  })
  const repaymentDayOfMonth = Number(input.repaymentDayOfMonth)
  const startDate = parseIsoDate(String(input.startDate || '').trim())
  const category = input.category || 'loan'
  const description = input.description
  const flows = []

  if (input.includeDisbursement !== false) {
    flows.push({
      date: formatIsoDate(startDate),
      amount: schedule.principal,
      direction: 'inflow',
      category,
      description
    })
  }

  let year = startDate.getUTCFullYear()
  let month = startDate.getUTCMonth()
  if (repaymentDayOfMonth < startDate.getUTCDate()) {
    const next = incrementLoanYearMonth(year, month)
    year = next.year
    month = next.month
  }

  if (schedule.gracePeriodMonths > 0 && !schedule.capitalizeInterestAtGraceEnd) {
    for (let index = 0; index < schedule.gracePeriodMonths; index += 1) {
      const monthDays = daysInMonthUtc(year, month)
      const day = Math.min(repaymentDayOfMonth, monthDays)
      const paymentDate = new Date(Date.UTC(year, month, day))
      flows.push({
        date: formatIsoDate(paymentDate),
        amount: schedule.graceInterestOnlyPayment,
        direction: 'outflow',
        category,
        description
      })
      const next = incrementLoanYearMonth(year, month)
      year = next.year
      month = next.month
    }
  } else if (schedule.gracePeriodMonths > 0 && schedule.capitalizeInterestAtGraceEnd) {
    for (let index = 0; index < schedule.gracePeriodMonths; index += 1) {
      const next = incrementLoanYearMonth(year, month)
      year = next.year
      month = next.month
    }
  }

  let remainingPrincipal = schedule.amortizingPrincipal
  for (let index = 0; index < schedule.amortizationMonths; index += 1) {
    const monthDays = daysInMonthUtc(year, month)
    const day = Math.min(repaymentDayOfMonth, monthDays)
    const paymentDate = new Date(Date.UTC(year, month, day))
    const interestPortion = remainingPrincipal * schedule.monthlyRate
    const principalPortion = Math.min(
      schedule.monthlyInstallment - interestPortion,
      remainingPrincipal
    )
    remainingPrincipal = Math.max(0, remainingPrincipal - principalPortion)

    flows.push({
      date: formatIsoDate(paymentDate),
      amount: schedule.monthlyInstallment,
      direction: 'outflow',
      category,
      description
    })

    const next = incrementLoanYearMonth(year, month)
    year = next.year
    month = next.month
  }

  return flows.sort((a, b) => a.date.localeCompare(b.date))
}

function generateLoanInstrumentBundle(input) {
  const termMonths = normalizeLoanTermMonths(input.termValue, input.termUnit)
  const gracePeriodMonths = normalizeLoanGracePeriodMonths(input.gracePeriodMonths, termMonths)
  const capitalizeInterestAtGraceEnd =
    gracePeriodMonths > 0 && input.capitalizeInterestAtGraceEnd === true
  const interestDayCountConvention = normalizeInterestDayCountConvention(
    input.interestDayCountConvention
  )
  const paymentRounding = normalizePaymentRounding(input.paymentRounding)
  const preview = createLoanRepaymentPreview({
    principal: input.principal,
    annualRate: input.annualRate,
    termMonths,
    gracePeriodMonths,
    capitalizeInterestAtGraceEnd,
    interestDayCountConvention,
    paymentRounding
  })
  const generatedFlows = generateLoanInstrumentFlows({
    ...input,
    termValue: termMonths,
    termUnit: 'months',
    gracePeriodMonths,
    capitalizeInterestAtGraceEnd,
    interestDayCountConvention,
    paymentRounding
  })

  return normalizeInstrumentBundle({
    id: input.id || createId('loan'),
    instrumentType: 'loan',
    label: input.label || 'Loan',
    productId: input.productId,
    productSpecVersion: input.productSpecVersion,
    config: {
      productId: input.productId,
      productSpecVersion: input.productSpecVersion,
      principal: Number(input.principal),
      annualRate: Number(input.annualRate),
      termMonths,
      termValue: Number(input.termValue),
      termUnit: input.termUnit || 'months',
      startDate: input.startDate,
      repaymentDayOfMonth: Number(input.repaymentDayOfMonth),
      gracePeriodMonths,
      capitalizeInterestAtGraceEnd,
      interestDayCountConvention,
      paymentRounding,
      includeDisbursement: input.includeDisbursement !== false,
      category: input.category || 'loan',
      description: input.description,
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
    },
    preview,
    generatedFlows,
    createdAt: input.createdAt,
    updatedAt: new Date().toISOString()
  })
}

function parseYearlyInflation(raw) {
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

      return {
        year: Number(match[1]),
        rate: Number(match[2])
      }
    })
    .filter((entry) => entry !== null)
}

function resolveInvestmentDates(input) {
  const issueDateRaw = String(input.issueDate || '').trim()
  const transactionDateRaw = String(input.transactionDate || '').trim()
  const dueDateRaw = String(input.dueDate || '').trim()

  const issueDate = parseIsoDate(issueDateRaw)
  const transactionDate = parseIsoDate(transactionDateRaw)
  const dueDate = parseIsoDate(dueDateRaw)

  if (transactionDate.getTime() > dueDate.getTime()) {
    throw new Error('Transaction date must be on or before due date.')
  }

  if (issueDate.getTime() > dueDate.getTime()) {
    throw new Error('Issue date must be on or before due date.')
  }

  return {
    issueDate,
    transactionDate,
    dueDate
  }
}

function daysBetween(startDate, endDate) {
  const millisPerDay = 24 * 60 * 60 * 1000
  return Math.round((endDate.getTime() - startDate.getTime()) / millisPerDay)
}

function assertDiscountBondContract(input) {
  // `dkj` is a legacy investment-subtype alias for the discount-bond calculation
  // strategy (product code government-security.dkj); not a productCode amortizer branch.
  if (input.subtype !== 'discount-bond' && input.subtype !== 'dkj') {
    return
  }

  if (!input.issueDate || !input.transactionDate || !input.dueDate) {
    throw new Error('Discount bond requires issue date, transaction date, and due date.')
  }

  const principal = normalizeAmount(input.principal)
  const purchaseAmount = Number(input.purchasePrice)
  if (!Number.isFinite(purchaseAmount) || purchaseAmount <= 0) {
    throw new Error('Discount bond purchase price must be positive.')
  }
  if (input.subtype === 'discount-bond' && purchaseAmount >= principal) {
    throw new Error('Discount bond purchase price must be below face value.')
  }

  const { transactionDate, dueDate } = resolveInvestmentDates(input)
  if (daysBetween(transactionDate, dueDate) <= 0) {
    throw new Error('Discount bond due date must be after transaction date.')
  }
}

function deriveDiscountBondMetrics(input) {
  assertDiscountBondContract(input)

  const principal = normalizeAmount(input.principal)
  const purchaseAmount = Number(input.purchasePrice)
  const { transactionDate, dueDate } = resolveInvestmentDates(input)
  const daysRemaining = daysBetween(transactionDate, dueDate)
  const currentValuePercent = (purchaseAmount / principal) * 100
  const yieldPercent = ((100 - currentValuePercent) / currentValuePercent) * (360 / daysRemaining) * 100

  return {
    daysRemaining,
    currentValuePercent,
    yieldPercent
  }
}

function createAnnualMaturityDates(issueDate, dueDate) {
  const results = []
  const dueMonth = dueDate.getUTCMonth()
  const dueDay = dueDate.getUTCDate()

  for (let year = issueDate.getUTCFullYear() + 1; year <= dueDate.getUTCFullYear(); year += 1) {
    const candidate = new Date(Date.UTC(year, dueMonth, dueDay))
    if (candidate.getTime() > issueDate.getTime() && candidate.getTime() <= dueDate.getTime()) {
      results.push(candidate)
    }
  }

  if (results.length === 0 || results[results.length - 1].getTime() !== dueDate.getTime()) {
    results.push(dueDate)
  }

  return results
}

function assertInflationLinkedContract(input) {
  if (input.subtype !== 'inflation-linked-bond') {
    return
  }

  if (!input.issueDate || !input.transactionDate || !input.dueDate) {
    throw new Error('Inflation-linked bond requires issue date, transaction date, and due date.')
  }

  const spreadRate = Number(input.spreadRate)
  if (!Number.isFinite(spreadRate)) {
    throw new Error('Inflation-linked bond spread rate is required.')
  }

  const yearlyInflation = parseYearlyInflation(input.yearlyInflationRaw)
  if (yearlyInflation.length === 0) {
    throw new Error('Inflation-linked bond requires yearly inflation inputs.')
  }
}

function deriveInflationLinkedMetrics(input) {
  assertInflationLinkedContract(input)

  const { issueDate, transactionDate, dueDate } = resolveInvestmentDates(input)
  const yearlyInflation = parseYearlyInflation(input.yearlyInflationRaw)
  const yearlyInflationMap = new Map(yearlyInflation.map((entry) => [entry.year, entry.rate]))
  const spreadRate = Number(input.spreadRate || 0)
  const maturityDates = createAnnualMaturityDates(issueDate, dueDate)
  const firstMaturityDate = maturityDates[0]
  const firstTechnicalAccrualStartDate = new Date(
    Date.UTC(firstMaturityDate.getUTCFullYear() - 1, firstMaturityDate.getUTCMonth(), firstMaturityDate.getUTCDate())
  )

  const accrualPeriods = maturityDates.map((maturityDate, index) => {
    const effectiveAnnualRate = (yearlyInflationMap.get(maturityDate.getUTCFullYear()) || 0) + spreadRate

    if (index === 0) {
      const numerator = Math.max(daysBetween(issueDate, transactionDate), 0)
      const denominator = Math.max(daysBetween(firstTechnicalAccrualStartDate, firstMaturityDate), 1)
      return {
        maturityDate: formatIsoDate(maturityDate),
        effectiveAnnualRate,
        accrualFactor: effectiveAnnualRate * (numerator / denominator)
      }
    }

    const previousMaturityDate = maturityDates[index - 1]
    const numerator = Math.max(daysBetween(previousMaturityDate, maturityDate), 0)
    const denominator = Math.max(daysBetween(previousMaturityDate, maturityDate), 1)
    return {
      maturityDate: formatIsoDate(maturityDate),
      effectiveAnnualRate,
      accrualFactor: effectiveAnnualRate * (numerator / denominator)
    }
  })

  return {
    dateMarkers: {
      issueDate: formatIsoDate(issueDate),
      transactionDate: formatIsoDate(transactionDate),
      dueDate: formatIsoDate(dueDate),
      firstMaturityDate: formatIsoDate(firstMaturityDate),
      firstTechnicalAccrualStartDate: formatIsoDate(firstTechnicalAccrualStartDate)
    },
    annualMaturityDates: maturityDates.map((date) => formatIsoDate(date)),
    accrualPeriods
  }
}

function monthsBetween(startDateIso, endDateIso) {
  const startDate = parseIsoDate(startDateIso)
  const endDate = parseIsoDate(endDateIso)
  if (endDate.getTime() <= startDate.getTime()) {
    throw new Error('Maturity date must be after purchase date.')
  }
  const years = endDate.getUTCFullYear() - startDate.getUTCFullYear()
  const months = endDate.getUTCMonth() - startDate.getUTCMonth()
  const dayAdjust = endDate.getUTCDate() < startDate.getUTCDate() ? -1 : 0
  return Math.max(0, years * 12 + months + dayAdjust)
}

function resolveLifecycleDates(input) {
  const useContractDates =
    input.subtype === 'discount-bond' || input.subtype === 'inflation-linked-bond' || input.subtype === 'dkj'
  const purchaseDateIso = useContractDates
    ? String(input.transactionDate || '').trim()
    : String(input.purchaseDate || '').trim()
  const maturityDateIso = useContractDates
    ? String(input.dueDate || '').trim()
    : String(input.maturityDate || '').trim()

  parseIsoDate(purchaseDateIso)
  parseIsoDate(maturityDateIso)

  return {
    purchaseDateIso,
    maturityDateIso
  }
}

function createInvestmentMaturityPreview(input) {
  const principal = normalizeAmount(input.principal)
  const purchasePrice = Number(input.purchasePrice)
  const purchaseAmount = Number.isFinite(purchasePrice) && purchasePrice > 0 ? purchasePrice : principal
  const annualRate = Number(input.annualRate || 0)
  const { purchaseDateIso, maturityDateIso } = resolveLifecycleDates(input)
  let maturityAmount = principal
  let discountMetrics
  let inflationMetrics

  if (input.subtype === 'regular-bond') {
    const months = monthsBetween(purchaseDateIso, maturityDateIso)
    maturityAmount = principal * Math.pow(1 + annualRate / 12, months)
  } else if (input.subtype === 'discount-bond' || input.subtype === 'dkj') {
    discountMetrics = deriveDiscountBondMetrics(input)
    maturityAmount = principal
  } else if (input.subtype === 'inflation-linked-bond') {
    inflationMetrics = deriveInflationLinkedMetrics(input)
    maturityAmount = inflationMetrics.accrualPeriods.reduce(
      (value, period) => value * (1 + period.accrualFactor),
      principal
    )
  } else {
    maturityAmount = principal
  }

  return {
    purchaseAmount,
    maturityAmount,
    gainAmount: maturityAmount - purchaseAmount,
    subtype: input.subtype,
    discountMetrics,
    inflationMetrics
  }
}

function generateInvestmentInstrumentFlows(input) {
  const principal = normalizeAmount(input.principal)
  const purchaseAmount = Number(input.purchasePrice)
  const purchasePrice = Number.isFinite(purchaseAmount) && purchaseAmount > 0 ? purchaseAmount : principal
  const annualRate = Number(input.annualRate || 0)
  const { purchaseDateIso, maturityDateIso } = resolveLifecycleDates(input)
  const category = input.category || 'investment'
  const description = input.description
  const flows = []
  const purchaseDate = parseIsoDate(purchaseDateIso)
  const maturityDate = parseIsoDate(maturityDateIso)

  let purchaseFlowDate = formatIsoDate(purchaseDate)
  let maturityFlowDate = formatIsoDate(maturityDate)

  if (input.subtype === 'discount-bond' || input.subtype === 'inflation-linked-bond' || input.subtype === 'dkj') {
    const resolvedDates = resolveInvestmentDates(input)
    purchaseFlowDate = formatIsoDate(resolvedDates.transactionDate)
    maturityFlowDate = formatIsoDate(resolvedDates.dueDate)
  }

  flows.push({
    date: purchaseFlowDate,
    amount: purchasePrice,
    direction: 'outflow',
    category,
    description
  })

  if (input.subtype === 'regular-bond') {
    const months = monthsBetween(purchaseDateIso, maturityDateIso)
    flows.push({
      date: maturityFlowDate,
      amount: principal * Math.pow(1 + annualRate / 12, months),
      direction: 'inflow',
      category,
      description
    })
  } else if (input.subtype === 'discount-bond' || input.subtype === 'dkj') {
    assertDiscountBondContract(input)
    flows.push({
      date: maturityFlowDate,
      amount: principal,
      direction: 'inflow',
      category,
      description
    })
  } else if (input.subtype === 'inflation-linked-bond') {
    const inflationMetrics = deriveInflationLinkedMetrics(input)
    const maturityAmount = inflationMetrics.accrualPeriods.reduce(
      (value, period) => value * (1 + period.accrualFactor),
      principal
    )

    flows.push({
      date: maturityFlowDate,
      amount: maturityAmount,
      direction: 'inflow',
      category,
      description
    })
  } else {
    const couponPeriod = input.couponPeriod || '0 0 1 * *'
    const schedule = parseRecurringSchedule(couponPeriod)
    const periodsPerYear = schedule.type === 'weekly' ? 52 : schedule.type === 'annual' ? 1 : 12
    const couponAmount = principal * (annualRate / periodsPerYear)
    const couponFlows = expandRecurringFlows(
      {
        period: couponPeriod,
        startDate: purchaseDateIso,
        endDate: maturityDateIso,
        amount: couponAmount,
        direction: 'inflow',
        category,
        description
      },
      purchaseDateIso,
      maturityDateIso
    )

    flows.push(...couponFlows)
    flows.push({
      date: maturityFlowDate,
      amount: principal,
      direction: 'inflow',
      category,
      description
    })
  }

  return flows.sort((a, b) => a.date.localeCompare(b.date))
}

function generateInvestmentInstrumentBundle(input) {
  const preview = createInvestmentMaturityPreview(input)
  const generatedFlows = generateInvestmentInstrumentFlows(input)

  return normalizeInstrumentBundle({
    id: input.id || createId('investment'),
    instrumentType: 'investment',
    label: input.label || 'Investment',
    productId: input.productId,
    productSpecVersion: input.productSpecVersion,
    config: {
      productId: input.productId,
      productSpecVersion: input.productSpecVersion,
      subtype: input.subtype,
      purchaseDate: input.purchaseDate,
      maturityDate: input.maturityDate,
      issueDate: input.issueDate,
      transactionDate: input.transactionDate,
      dueDate: input.dueDate,
      principal: Number(input.principal),
      purchasePrice: input.purchasePrice,
      annualRate: input.annualRate,
      spreadRate: input.spreadRate,
      yearlyInflationRaw: input.yearlyInflationRaw,
      saleDate: input.saleDate,
      saleValue: input.saleValue,
      couponPeriod: input.couponPeriod,
      termMonths: input.termMonths,
      remainingDays: input.remainingDays,
      purchasePricePct: input.purchasePricePct,
      category: input.category || 'investment',
      description: input.description
    },
    preview,
    generatedFlows,
    createdAt: input.createdAt,
    updatedAt: new Date().toISOString()
  })
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

/** Default OTP Lakástakarék Prémium tiers (PRÉMIUM PLUSZ 10x30). Dual-surface until ADR 0017. */
const DEFAULT_HOME_SAVINGS_PREMIUM_TIERS = {
  months49to96: 10,
  months97to120: 20,
  maturityFrom120: 30
}

function addMonthsUtc(date, months) {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth() + months
  const targetYear = year + Math.floor(month / 12)
  const targetMonth = ((month % 12) + 12) % 12
  const day = Math.min(date.getUTCDate(), daysInMonthUtc(targetYear, targetMonth))
  return new Date(Date.UTC(targetYear, targetMonth, day))
}

function shiftUtcDays(date, days) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days))
}

function ensureNonNegativeHomeSavingsAmount(amount, label) {
  const parsed = Number(amount)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative finite number.`)
  }
  return parsed
}

function deriveHomeSavingsDepositDayOfMonth(startDate) {
  const day = Number(String(startDate).split('-')[2])
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new Error('Home-savings startDate must be in YYYY-MM-DD format.')
  }
  return day
}

function resolveHomeSavingsPremiumRatePct(input) {
  if (!input.housingPurpose) {
    return 0
  }

  const tiers = input.tiers || DEFAULT_HOME_SAVINGS_PREMIUM_TIERS
  const holdingMonths =
    input.earlyExitMonth !== undefined && input.earlyExitMonth !== null
      ? Number(input.earlyExitMonth)
      : Number(input.termMonths)

  if (!Number.isInteger(holdingMonths) || holdingMonths <= 0) {
    throw new Error('Holding months for Premium resolution must be a positive integer.')
  }

  if (holdingMonths >= 120) return tiers.maturityFrom120
  if (holdingMonths >= 97) return tiers.months97to120
  if (holdingMonths >= 49) return tiers.months49to96
  return 0
}

/**
 * ÁSZF/USZ deposit interest: ACT/360 daily with yearly capitalization.
 * Dual-surface mirror of src/finance_engine/instruments/home_savings.ts (ADR 0017).
 */
function calculateHomeSavingsDepositInterest(input) {
  const monthlyDeposit = ensureNonNegativeHomeSavingsAmount(input.monthlyDeposit, 'monthlyDeposit')
  if (monthlyDeposit <= 0) {
    throw new Error('monthlyDeposit must be a positive finite number.')
  }
  const termMonths = Number(input.termMonths)
  if (!Number.isInteger(termMonths) || termMonths <= 0) {
    throw new Error('termMonths must be a positive integer.')
  }

  if (input.annualRatePct === undefined || input.annualRatePct === null) {
    return 0
  }

  const annualRatePct = Number(input.annualRatePct)
  if (!Number.isFinite(annualRatePct) || annualRatePct < 0) {
    throw new Error('depositInterestAnnualRatePct must be a non-negative finite number.')
  }
  if (annualRatePct === 0) {
    return 0
  }

  const start = parseIsoDate(input.startDate)
  const depositDates = new Map()
  for (let i = 0; i < termMonths; i += 1) {
    const depositDate = addMonthsUtc(start, i)
    const key = formatIsoDate(depositDate)
    depositDates.set(key, (depositDates.get(key) || 0) + monthlyDeposit)
  }

  const yearStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))
  const capDates = new Set()
  for (let yearIndex = 1; yearIndex <= Math.ceil(termMonths / 12) + 1; yearIndex += 1) {
    capDates.add(formatIsoDate(addMonthsUtc(yearStart, yearIndex * 12)))
  }

  const payoutDate = addMonthsUtc(start, termMonths - 1)
  let balance = 0
  let pendingInterest = 0
  let totalInterest = 0
  let cursor = new Date(start.getTime())

  while (cursor.getTime() <= payoutDate.getTime()) {
    const key = formatIsoDate(cursor)

    if (capDates.has(key) && pendingInterest > 0) {
      const capitalized = Math.round(pendingInterest)
      balance += capitalized
      totalInterest += capitalized
      pendingInterest = 0
    }

    const deposit = depositDates.get(key)
    if (deposit) {
      balance += deposit
    }

    if (cursor.getTime() < payoutDate.getTime()) {
      pendingInterest += (balance * annualRatePct) / (360 * 100)
    }

    cursor = shiftUtcDays(cursor, 1)
  }

  if (pendingInterest > 0) {
    totalInterest += Math.round(pendingInterest)
  }

  return totalInterest
}

function resolveHomeSavingsSchedule(input) {
  const monthlyDeposit = ensureNonNegativeHomeSavingsAmount(input.monthlyDeposit, 'monthlyDeposit')
  if (monthlyDeposit <= 0) {
    throw new Error('monthlyDeposit must be a positive finite number.')
  }
  const accountFeeMonthly = ensureNonNegativeHomeSavingsAmount(
    input.accountFeeMonthly,
    'accountFeeMonthly'
  )
  const accountOpeningFee = ensureNonNegativeHomeSavingsAmount(
    input.accountOpeningFee,
    'accountOpeningFee'
  )
  const termMonths = Number(input.termMonths)
  if (!Number.isInteger(termMonths) || termMonths <= 0) {
    throw new Error('termMonths must be a positive integer.')
  }

  const totalDeposits = monthlyDeposit * termMonths
  const totalAccountFees = accountFeeMonthly * termMonths
  const depositInterest = calculateHomeSavingsDepositInterest({
    monthlyDeposit,
    termMonths,
    startDate: input.startDate,
    annualRatePct: input.depositInterestAnnualRatePct
  })
  const premiumBase = totalDeposits
  const premiumRatePct =
    input.premiumRatePct !== undefined && input.premiumRatePct !== null
      ? Number(input.premiumRatePct)
      : resolveHomeSavingsPremiumRatePct({
          termMonths,
          housingPurpose: input.housingPurpose,
          earlyExitMonth: input.earlyExitMonth,
          tiers: input.premiumTiers
        })

  if (!Number.isFinite(premiumRatePct) || premiumRatePct < 0) {
    throw new Error('premiumRatePct must be a non-negative finite number.')
  }

  const premiumAmount = (premiumBase * premiumRatePct) / 100
  const terminalPayout = totalDeposits + depositInterest + premiumAmount

  return {
    totalDeposits,
    totalAccountFees,
    accountOpeningFee,
    accountFeeMonthly,
    premiumRatePct,
    premiumBase,
    premiumAmount,
    terminalPayout,
    depositInterest,
    paymentCount: termMonths,
    termMonths,
    housingPurpose: Boolean(input.housingPurpose)
  }
}

function generateHomeSavingsInstrumentFlows(input) {
  const monthlyDeposit = ensureNonNegativeHomeSavingsAmount(input.monthlyDeposit, 'monthlyDeposit')
  if (monthlyDeposit <= 0) {
    throw new Error('monthlyDeposit must be a positive finite number.')
  }
  const accountFeeMonthly = ensureNonNegativeHomeSavingsAmount(
    input.accountFeeMonthly,
    'accountFeeMonthly'
  )
  const accountOpeningFee = ensureNonNegativeHomeSavingsAmount(
    input.accountOpeningFee,
    'accountOpeningFee'
  )
  const termMonths = Number(input.termMonths)
  assertBoundedHorizon(undefined, termMonths)

  const dayOfMonth = input.depositDayOfMonth ?? deriveHomeSavingsDepositDayOfMonth(input.startDate)
  const period = `0 0 ${dayOfMonth} * *`
  const category = input.category || 'home-savings'
  // Fixed flow label — `input.description` is free-text notes on the bundle/config only.
  const depositDescription = 'Monthly deposit'
  const schedule = resolveHomeSavingsSchedule(input)
  const flows = []

  if (accountOpeningFee > 0) {
    flows.push({
      date: input.startDate,
      amount: accountOpeningFee,
      direction: 'outflow',
      category,
      description: 'Account opening fee'
    })
  }

  const depositDefinition = normalizeRecurringDefinition({
    period,
    startDate: input.startDate,
    occurrences: termMonths,
    amount: monthlyDeposit,
    direction: 'outflow',
    category
  })
  if (!depositDefinition) {
    throw new Error('Invalid home-savings deposit schedule.')
  }
  flows.push(
    ...expandRecurringFlows(depositDefinition, input.startDate, '9999-12-31').map((flow) => ({
      ...flow,
      description: depositDescription
    }))
  )

  if (accountFeeMonthly > 0) {
    const feeDefinition = normalizeRecurringDefinition({
      period,
      startDate: input.startDate,
      occurrences: termMonths,
      amount: accountFeeMonthly,
      direction: 'outflow',
      category
    })
    if (!feeDefinition) {
      throw new Error('Invalid home-savings account-fee schedule.')
    }
    flows.push(
      ...expandRecurringFlows(feeDefinition, input.startDate, '9999-12-31').map((flow) => ({
        ...flow,
        description: 'Account management fee'
      }))
    )
  }

  const depositFlows = flows.filter((flow) => flow.description === depositDescription)
  const lastDepositDate =
    depositFlows.length > 0 ? depositFlows[depositFlows.length - 1].date : input.startDate

  if (schedule.terminalPayout > 0) {
    flows.push({
      date: lastDepositDate,
      amount: schedule.terminalPayout,
      direction: 'inflow',
      category,
      description: 'Home-savings terminal payout'
    })
  }

  return flows.sort((a, b) => a.date.localeCompare(b.date))
}

function createHomeSavingsInstrumentBundle(input) {
  const schedule = resolveHomeSavingsSchedule(input)
  const generatedFlows = generateHomeSavingsInstrumentFlows(input)
  const depositDayOfMonth =
    input.depositDayOfMonth ?? deriveHomeSavingsDepositDayOfMonth(input.startDate)

  return normalizeInstrumentBundle({
    id: input.id || createId('home-savings'),
    instrumentType: 'home-savings',
    label: input.label || 'Home savings',
    productId: input.productId,
    productSpecVersion: input.productSpecVersion,
    config: {
      productId: input.productId,
      productCode: input.productCode,
      productSpecVersion: input.productSpecVersion,
      monthlyDeposit: Number(input.monthlyDeposit),
      termMonths: Number(input.termMonths),
      startDate: input.startDate,
      depositDayOfMonth,
      accountFeeMonthly: Number(input.accountFeeMonthly),
      accountOpeningFee: Number(input.accountOpeningFee),
      housingPurpose: Boolean(input.housingPurpose),
      depositInterestAnnualRatePct: input.depositInterestAnnualRatePct,
      premiumRatePct: schedule.premiumRatePct,
      earlyExitMonth: input.earlyExitMonth,
      openingFeeMode: input.openingFeeMode,
      contractAmount: input.contractAmount,
      category: input.category || 'home-savings',
      description: input.description
    },
    preview: schedule,
    generatedFlows,
    createdAt: input.createdAt,
    updatedAt: new Date().toISOString()
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
  resolveHomeSavingsPremiumRatePct,
  calculateHomeSavingsDepositInterest,
  resolveHomeSavingsSchedule,
  createHomeSavingsInstrumentBundle,
  flattenInstrumentFlows
}
