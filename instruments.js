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
  const fallbackCategory = instrumentType === 'salary' ? 'salary' : 'subscription'
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
  flattenInstrumentFlows
}
