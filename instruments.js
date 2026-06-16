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

function normalizeGeneratedFlow(flow, fallbackCategory) {
  if (!flow || typeof flow !== 'object') {
    return null
  }

  const date = String(flow.date || '').trim()
  const amount = Number(flow.amount)
  const direction = normalizeDirection(flow.direction)
  const category = String(flow.category || '').trim() || fallbackCategory
  const description = typeof flow.description === 'string' ? flow.description : undefined

  if (!date || !Number.isFinite(amount) || amount < 0) {
    return null
  }

  return {
    date,
    amount,
    direction,
    category,
    description
  }
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
            : null

  if (!instrumentType) {
    return null
  }

  const id = typeof bundle.id === 'string' && bundle.id.trim() ? bundle.id.trim() : createId('instrument')
  const label =
    typeof bundle.label === 'string' && bundle.label.trim()
      ? bundle.label.trim()
      : `${instrumentType} instrument`
  const config = bundle.config && typeof bundle.config === 'object' ? bundle.config : {}
  const fallbackCategory =
    instrumentType === 'salary'
      ? 'salary'
      : instrumentType === 'loan'
        ? 'loan'
        : instrumentType === 'investment'
          ? 'investment'
          : 'subscription'
  const generatedFlows = Array.isArray(bundle.generatedFlows)
    ? bundle.generatedFlows
        .map((entry) => normalizeGeneratedFlow(entry, fallbackCategory))
        .filter((entry) => entry !== null)
    : []

  return {
    id,
    instrumentType,
    label,
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

function calculateLoanMonthlyInstallment(principal, annualRate, termMonths) {
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

  const monthlyRate = normalizedAnnualRate / 12
  if (monthlyRate === 0) {
    return normalizedPrincipal / normalizedTermMonths
  }

  const factor = Math.pow(1 + monthlyRate, normalizedTermMonths)
  return (normalizedPrincipal * monthlyRate * factor) / (factor - 1)
}

function createLoanRepaymentPreview(input) {
  const principal = Number(input.principal)
  const annualRate = Number(input.annualRate)
  const termMonths = Number(input.termMonths)
  const monthlyInstallment = calculateLoanMonthlyInstallment(principal, annualRate, termMonths)
  return {
    monthlyInstallment,
    totalRepayment: monthlyInstallment * termMonths,
    totalInterest: monthlyInstallment * termMonths - principal,
    termMonths
  }
}

function normalizeLoanTermMonths(termValue, termUnit) {
  const parsed = Number(termValue)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('Loan term must be a positive integer.')
  }

  return termUnit === 'years' ? parsed * 12 : parsed
}

function generateLoanInstrumentFlows(input) {
  const principal = normalizeAmount(input.principal)
  const annualRate = Number(input.annualRate)
  const termMonths = normalizeLoanTermMonths(input.termValue, input.termUnit)
  const repaymentDayOfMonth = Number(input.repaymentDayOfMonth)
  const monthlyInstallment = calculateLoanMonthlyInstallment(principal, annualRate, termMonths)
  const monthlyRate = annualRate / 12
  const startDate = parseIsoDate(String(input.startDate || '').trim())
  const category = input.category || 'loan'
  const description = input.description
  const flows = []

  if (input.includeDisbursement !== false) {
    flows.push({
      date: formatIsoDate(startDate),
      amount: principal,
      direction: 'inflow',
      category,
      description
    })
  }

  let remainingPrincipal = principal
  let year = startDate.getUTCFullYear()
  let month = startDate.getUTCMonth()
  if (repaymentDayOfMonth < startDate.getUTCDate()) {
    month += 1
    if (month > 11) {
      month = 0
      year += 1
    }
  }

  for (let index = 0; index < termMonths; index += 1) {
    const monthDays = daysInMonthUtc(year, month)
    const day = Math.min(repaymentDayOfMonth, monthDays)
    const paymentDate = new Date(Date.UTC(year, month, day))
    const interestPortion = remainingPrincipal * monthlyRate
    const principalPortion = Math.min(monthlyInstallment - interestPortion, remainingPrincipal)
    remainingPrincipal = Math.max(0, remainingPrincipal - principalPortion)

    flows.push({
      date: formatIsoDate(paymentDate),
      amount: monthlyInstallment,
      direction: 'outflow',
      category,
      description
    })

    month += 1
    if (month > 11) {
      month = 0
      year += 1
    }
  }

  return flows.sort((a, b) => a.date.localeCompare(b.date))
}

function generateLoanInstrumentBundle(input) {
  const termMonths = normalizeLoanTermMonths(input.termValue, input.termUnit)
  const preview = createLoanRepaymentPreview({
    principal: input.principal,
    annualRate: input.annualRate,
    termMonths
  })
  const generatedFlows = generateLoanInstrumentFlows({ ...input, termValue: termMonths, termUnit: 'months' })

  return normalizeInstrumentBundle({
    id: input.id || createId('loan'),
    instrumentType: 'loan',
    label: input.label || 'Loan',
    config: {
      principal: Number(input.principal),
      annualRate: Number(input.annualRate),
      termMonths,
      termValue: Number(input.termValue),
      termUnit: input.termUnit || 'months',
      startDate: input.startDate,
      repaymentDayOfMonth: Number(input.repaymentDayOfMonth),
      includeDisbursement: input.includeDisbursement !== false,
      category: input.category || 'loan',
      description: input.description
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

function createInvestmentMaturityPreview(input) {
  const principal = normalizeAmount(input.principal)
  const purchasePrice = Number(input.purchasePrice)
  const purchaseAmount = Number.isFinite(purchasePrice) && purchasePrice > 0 ? purchasePrice : principal
  const annualRate = Number(input.annualRate || 0)
  const spreadRate = Number(input.spreadRate || 0)
  const months = monthsBetween(input.purchaseDate, input.maturityDate)
  let maturityAmount = principal
  const yearlyInflation = parseYearlyInflation(input.yearlyInflationRaw)

  if (input.subtype === 'regular-bond') {
    maturityAmount = principal * Math.pow(1 + annualRate / 12, months)
  } else if (input.subtype === 'discount-bond') {
    maturityAmount = principal
  } else if (input.subtype === 'inflation-linked-bond') {
    const startYear = parseIsoDate(input.purchaseDate).getUTCFullYear()
    const maturityYear = parseIsoDate(input.maturityDate).getUTCFullYear()
    let factor = 1
    for (let year = startYear; year <= maturityYear; year += 1) {
      const inflationEntry = yearlyInflation.find((entry) => entry.year === year)
      const inflationRate = inflationEntry ? inflationEntry.rate : 0
      factor *= 1 + inflationRate + spreadRate
    }
    maturityAmount = principal * factor
  } else {
    maturityAmount = principal
  }

  return {
    purchaseAmount,
    maturityAmount,
    gainAmount: maturityAmount - purchaseAmount,
    subtype: input.subtype
  }
}

function generateInvestmentInstrumentFlows(input) {
  const principal = normalizeAmount(input.principal)
  const purchaseAmount = Number(input.purchasePrice)
  const purchasePrice = Number.isFinite(purchaseAmount) && purchaseAmount > 0 ? purchaseAmount : principal
  const purchaseDate = parseIsoDate(input.purchaseDate)
  const maturityDate = parseIsoDate(input.maturityDate)
  const annualRate = Number(input.annualRate || 0)
  const spreadRate = Number(input.spreadRate || 0)
  const months = monthsBetween(input.purchaseDate, input.maturityDate)
  const category = input.category || 'investment'
  const description = input.description
  const flows = []
  const yearlyInflation = parseYearlyInflation(input.yearlyInflationRaw)

  flows.push({
    date: formatIsoDate(purchaseDate),
    amount: purchasePrice,
    direction: 'outflow',
    category,
    description
  })

  if (input.subtype === 'regular-bond') {
    flows.push({
      date: formatIsoDate(maturityDate),
      amount: principal * Math.pow(1 + annualRate / 12, months),
      direction: 'inflow',
      category,
      description
    })
  } else if (input.subtype === 'discount-bond') {
    flows.push({
      date: formatIsoDate(maturityDate),
      amount: principal,
      direction: 'inflow',
      category,
      description
    })
  } else if (input.subtype === 'inflation-linked-bond') {
    const startYear = purchaseDate.getUTCFullYear()
    const maturityYear = maturityDate.getUTCFullYear()
    let factor = 1
    for (let year = startYear; year <= maturityYear; year += 1) {
      const inflationEntry = yearlyInflation.find((entry) => entry.year === year)
      const inflationRate = inflationEntry ? inflationEntry.rate : 0
      factor *= 1 + inflationRate + spreadRate
    }

    flows.push({
      date: formatIsoDate(maturityDate),
      amount: principal * factor,
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
        startDate: input.purchaseDate,
        endDate: input.maturityDate,
        amount: couponAmount,
        direction: 'inflow',
        category,
        description
      },
      input.purchaseDate,
      input.maturityDate
    )

    flows.push(...couponFlows)
    flows.push({
      date: formatIsoDate(maturityDate),
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
    config: {
      subtype: input.subtype,
      purchaseDate: input.purchaseDate,
      maturityDate: input.maturityDate,
      principal: Number(input.principal),
      purchasePrice: input.purchasePrice,
      annualRate: input.annualRate,
      spreadRate: input.spreadRate,
      yearlyInflationRaw: input.yearlyInflationRaw,
      couponPeriod: input.couponPeriod,
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
  return instrumentBundles.flatMap((bundle) => {
    return (bundle.generatedFlows || []).map((flow) => ({
      ...flow,
      sourceInstrumentId: bundle.id,
      sourceInstrumentType: bundle.instrumentType
    }))
  })
}

export {
  normalizeInstrumentBundle,
  normalizeInstrumentBundles,
  parseHolidayList,
  rollBusinessDay,
  generateSalaryInstrumentBundle,
  generateSubscriptionInstrumentBundle,
  calculateLoanMonthlyInstallment,
  createLoanRepaymentPreview,
  generateLoanInstrumentBundle,
  createInvestmentMaturityPreview,
  generateInvestmentInstrumentBundle,
  flattenInstrumentFlows
}
