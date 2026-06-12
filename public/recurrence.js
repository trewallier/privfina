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

function parseIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) {
    throw new Error(`Invalid date: ${value}`)
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const utc = new Date(Date.UTC(year, month - 1, day))
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    throw new Error(`Invalid date: ${value}`)
  }
  return utc
}

function formatIsoDate(date) {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function daysInMonthUtc(year, monthZeroBased) {
  return new Date(Date.UTC(year, monthZeroBased + 1, 0)).getUTCDate()
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
  const tokens = String(period || '')
    .trim()
    .split(/\s+/)

  if (tokens.length !== 5) {
    throw new Error('Use cron-like format: "m h day month weekday".')
  }

  const [, , day, month, weekday] = tokens

  if (/^([1-9]|[12]\d|3[01])$/.test(day) && month === '*' && weekday === '*') {
    return { type: 'monthly', day: Number(day) }
  }

  if (day === '*' && month === '*' && /^([0-6])$/.test(weekday)) {
    return { type: 'weekly', weekday: Number(weekday) }
  }

  if (/^([1-9]|[12]\d|3[01])$/.test(day) && /^([1-9]|1[0-2])$/.test(month) && weekday === '*') {
    return { type: 'annual', day: Number(day), month: Number(month) }
  }

  throw new Error('Unsupported recurring period. Use monthly, weekly, or annual cron-like schedules.')
}

function expandRecurringFlows(definition, rangeStart, rangeEnd) {
  const schedule = parseRecurringSchedule(definition.period)
  const startDate = parseIsoDate(definition.startDate)
  const rangeStartDate = parseIsoDate(rangeStart)
  const rangeEndDate = parseIsoDate(rangeEnd)
  const endDate = definition.endDate ? parseIsoDate(definition.endDate) : null
  const occurrences = parseOccurrences(definition.occurrences)
  const hasValidOccurrences = typeof occurrences === 'number'
  const maxOccurrences = hasValidOccurrences
    ? occurrences
    : Number.MAX_SAFE_INTEGER

  if (!hasValidOccurrences && !endDate) {
    return []
  }

  const effectiveEnd = endDate && endDate.getTime() < rangeEndDate.getTime() ? endDate : rangeEndDate

  if (effectiveEnd.getTime() < startDate.getTime()) {
    return []
  }

  if (schedule.type === 'weekly') {
    let current = new Date(startDate)
    const firstOffset = (schedule.weekday - current.getUTCDay() + 7) % 7
    current = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate() + firstOffset))

    const generated = []
    let occurrenceCount = 0
    while (occurrenceCount < maxOccurrences && current.getTime() <= effectiveEnd.getTime()) {
      occurrenceCount += 1

      const iso = formatIsoDate(current)
      if (current.getTime() >= rangeStartDate.getTime()) {
        generated.push({
          date: iso,
          amount: definition.amount,
          direction: definition.direction,
          category: definition.category || 'general'
        })
      }

      current = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate() + 7))
    }

    return generated
  }

  if (schedule.type === 'annual') {
    let year = startDate.getUTCFullYear()
    const generated = []
    let occurrenceCount = 0
    let iterationCount = 0
    const MAX_ITERATIONS = 10000

    while (
      occurrenceCount < maxOccurrences &&
      iterationCount < MAX_ITERATIONS &&
      year <= effectiveEnd.getUTCFullYear() + 1
    ) {
      iterationCount += 1
      const monthIndex = schedule.month - 1
      const maxDay = daysInMonthUtc(year, monthIndex)

      if (schedule.day <= maxDay) {
        const candidate = new Date(Date.UTC(year, monthIndex, schedule.day))

        if (candidate.getTime() >= startDate.getTime()) {
          if (candidate.getTime() > effectiveEnd.getTime()) {
            break
          }

          occurrenceCount += 1
          if (candidate.getTime() >= rangeStartDate.getTime()) {
            generated.push({
              date: formatIsoDate(candidate),
              amount: definition.amount,
              direction: definition.direction,
              category: definition.category || 'general'
            })
          }
        }
      }

      year += 1
    }

    return generated
  }

  let year = startDate.getUTCFullYear()
  let month = startDate.getUTCMonth()
  const dayOfMonth = schedule.day
  const generated = []
  let iterationCount = 0
  const MAX_ITERATIONS = 10000

  while (generated.length < maxOccurrences && iterationCount < MAX_ITERATIONS) {
    iterationCount += 1
    const monthDays = daysInMonthUtc(year, month)
    if (dayOfMonth <= monthDays) {
      const candidate = new Date(Date.UTC(year, month, dayOfMonth))
      const inWindow = candidate.getTime() >= startDate.getTime()
      const beforeEnd = !endDate || candidate.getTime() <= endDate.getTime()
      if (inWindow && beforeEnd) {
        const iso = formatIsoDate(candidate)
        if (iso >= rangeStart && iso <= rangeEnd) {
          generated.push({
            date: iso,
            amount: definition.amount,
            direction: definition.direction,
            category: definition.category || 'general'
          })
        }
      }

      if (endDate && candidate.getTime() > endDate.getTime()) {
        break
      }
    }

    month += 1
    if (month > 11) {
      month = 0
      year += 1
    }

    const nextCandidate = new Date(Date.UTC(year, month, dayOfMonth))
    if (nextCandidate.getTime() > rangeEndDate.getTime()) {
      break
    }
  }

  return generated
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