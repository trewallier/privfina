/**
 * Recurring-definition helpers for the SPA (ADR 0032).
 * Date parsing and schedule recognition delegate to `@finance_engine`.
 */
import {
  parseIsoDate,
  formatIsoDate,
  daysInMonthUtc
} from '@finance_engine/date_utils'
import { generateRecurringCashFlows } from '@finance_engine/recurring'
import { recognizeSchedule } from '@finance_engine/schedule'

function parseOccurrences(value) {
  if (Number.isInteger(value) && value > 0) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number(value.trim())
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed
    }
  }

  return undefined
}

function normalizeRecurringDefinition(definition) {
  if (!definition || typeof definition !== 'object') {
    return null
  }

  const period = String(definition.period || '').trim()
  const startDate = String(definition.startDate || '').trim()
  const amount = Number(definition.amount)
  const direction = definition.direction === 'outflow' ? 'outflow' : 'inflow'
  const category = String(definition.category || '').trim() || 'general'
  const endDate = definition.endDate ? String(definition.endDate).trim() : undefined
  const occurrences = parseOccurrences(definition.occurrences)

  if (!period || !startDate || !Number.isFinite(amount) || amount < 0) {
    return null
  }

  const normalized = {
    ...definition,
    period,
    startDate,
    amount,
    direction,
    category
  }

  if (endDate) {
    normalized.endDate = endDate
  } else {
    delete normalized.endDate
  }

  if (occurrences !== undefined) {
    normalized.occurrences = occurrences
  } else {
    delete normalized.occurrences
  }

  return normalized
}

function normalizeRecurringDefinitions(definitions) {
  if (!Array.isArray(definitions)) {
    return []
  }

  return definitions
    .map(normalizeRecurringDefinition)
    .filter((definition) => definition !== null)
}

function parseMonthlyCronDay(period) {
  const cronMatch = /^([*]|[0-5]?\d)\s+([*]|[01]?\d|2[0-3])\s+([1-9]|[12]\d|3[01])\s+\*\s+\*$/.exec(
    String(period || '').trim()
  )
  if (!cronMatch) {
    throw new Error('Use monthly cron-like format: "m h day * *".')
  }
  return Number(cronMatch[3])
}

function parseRecurringSchedule(period) {
  const schedule = recognizeSchedule(String(period || '').trim())
  if (schedule.type === 'unsupported') {
    const tokens = String(period || '')
      .trim()
      .split(/\s+/)
    if (tokens.length !== 5) {
      throw new Error('Use cron-like format: "m h day month weekday".')
    }
    throw new Error('Unsupported recurring period. Use monthly, weekly, or annual cron-like schedules.')
  }
  return schedule
}

function expandRecurringFlows(definition, rangeStart, rangeEnd) {
  const occurrences = parseOccurrences(definition.occurrences)
  const hasValidOccurrences = typeof occurrences === 'number'
  const endDate =
    typeof definition.endDate === 'string' && definition.endDate.trim()
      ? definition.endDate.trim()
      : undefined

  if (!hasValidOccurrences && !endDate) {
    return []
  }

  parseRecurringSchedule(definition.period)

  const flows = generateRecurringCashFlows({
    period: definition.period,
    startDate: definition.startDate,
    endDate: endDate || rangeEnd,
    occurrences,
    amount: definition.amount,
    direction: definition.direction === 'outflow' ? 'outflow' : 'inflow',
    category: definition.category || 'general',
    description: definition.description
  })

  return flows
    .filter((flow) => flow.date >= rangeStart && flow.date <= rangeEnd)
    .map((flow) => ({
      date: flow.date,
      amount: flow.amount,
      direction: flow.direction === 'outflow' ? 'outflow' : 'inflow',
      category: flow.category || 'general'
    }))
}

export {
  parseOccurrences,
  normalizeRecurringDefinition,
  normalizeRecurringDefinitions,
  parseIsoDate,
  formatIsoDate,
  daysInMonthUtc,
  parseMonthlyCronDay,
  parseRecurringSchedule,
  expandRecurringFlows
}
