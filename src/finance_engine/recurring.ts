import type { CashFlow } from './models'
import { CashFlowDirection } from './models'
import { daysInMonthUtc, formatIsoDate, parseIsoDate } from './date_utils'
import type { DateRange, RecurringCashFlowInput } from './interfaces'
import { recognizeSchedule } from './schedule'

function inRange(dateIso: string, range: DateRange): boolean {
  return dateIso >= range.startDate && dateIso <= range.endDate
}

export function generateRecurringCashFlows(input: RecurringCashFlowInput): CashFlow[] {
  const amount = Number(input.amount)
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('Amount must be a non-negative finite number.')
  }

  const hasEndDate = typeof input.endDate === 'string' && input.endDate.length > 0
  const hasOccurrences = typeof input.occurrences === 'number'
  if (!hasEndDate && !hasOccurrences) {
    throw new Error('Recurring cash flow requires endDate or occurrences.')
  }

  if (hasOccurrences) {
    if (!Number.isInteger(input.occurrences) || (input.occurrences as number) <= 0) {
      throw new Error('Occurrences must be a positive integer.')
    }
  }

  const schedule = recognizeSchedule(input.period)
  const startDate = parseIsoDate(input.startDate)
  const endDate = hasEndDate ? parseIsoDate(input.endDate as string) : undefined

  if (endDate && endDate.getTime() < startDate.getTime()) {
    throw new Error('endDate must be on or after startDate.')
  }

  const generated: CashFlow[] = []
  const category = input.category ?? 'general'
  const description = input.description
  const maxOccurrences = hasOccurrences ? (input.occurrences as number) : Number.MAX_SAFE_INTEGER

  if (schedule.type === 'monthly') {
    const dayOfMonth = schedule.day as number
    let year = startDate.getUTCFullYear()
    let month = startDate.getUTCMonth()

    while (generated.length < maxOccurrences) {
      const monthDays = daysInMonthUtc(year, month)
      if (dayOfMonth <= monthDays) {
        const candidate = new Date(Date.UTC(year, month, dayOfMonth))
        const inWindow = candidate.getTime() >= startDate.getTime()
        const beforeEnd = !endDate || candidate.getTime() <= endDate.getTime()

        if (inWindow && beforeEnd) {
          generated.push({
            date: formatIsoDate(candidate),
            amount,
            direction: input.direction,
            category,
            description
          })
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

      if (endDate) {
        const firstOfNext = new Date(Date.UTC(year, month, 1))
        if (firstOfNext.getTime() > endDate.getTime()) {
          break
        }
      }
    }
  } else if (schedule.type === 'weekly') {
    const weekday = schedule.weekday as number
    let candidate = new Date(
      Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate())
    )
    const diff = (weekday - candidate.getUTCDay() + 7) % 7
    if (diff !== 0) {
      candidate = new Date(candidate.getTime() + diff * 24 * 60 * 60 * 1000)
    }

    while (generated.length < maxOccurrences) {
      if (endDate && candidate.getTime() > endDate.getTime()) {
        break
      }

      if (candidate.getTime() >= startDate.getTime()) {
        generated.push({
          date: formatIsoDate(candidate),
          amount,
          direction: input.direction,
          category,
          description
        })
      }

      candidate = new Date(candidate.getTime() + 7 * 24 * 60 * 60 * 1000)
    }
  } else if (schedule.type === 'annual') {
    const dayOfMonth = schedule.day as number
    const monthOfYear = (schedule.month as number) - 1
    let year = startDate.getUTCFullYear()
    let candidate = new Date(Date.UTC(year, monthOfYear, dayOfMonth))
    if (candidate.getTime() < startDate.getTime()) {
      candidate = new Date(Date.UTC(year + 1, monthOfYear, dayOfMonth))
    }

    while (generated.length < maxOccurrences) {
      if (endDate && candidate.getTime() > endDate.getTime()) {
        break
      }

      if (candidate.getTime() >= startDate.getTime()) {
        generated.push({
          date: formatIsoDate(candidate),
          amount,
          direction: input.direction,
          category,
          description
        })
      }

      year = candidate.getUTCFullYear() + 1
      candidate = new Date(Date.UTC(year, monthOfYear, dayOfMonth))
    }
  } else {
    throw new Error(
      'Unsupported recurring period. Use cron-like period strings for monthly, weekly or annual schedules.'
    )
  }

  return generated
}

export function evaluateRecurring(
  input: RecurringCashFlowInput,
  range: DateRange,
  mode: 'expand' | 'aggregate' | 'npv',
  opts?: { discountRate?: number; baseDate?: string }
): number | CashFlow[] {
  if (mode === 'npv' || mode === 'aggregate') {
    try {
      const schedule = recognizeSchedule(input.period)

      if (schedule.type === 'monthly' && (schedule.day ?? 0) <= 28) {
        const dayOfMonth = schedule.day as number
        const anchorStart = parseIsoDate(input.startDate)
        const windowStart = parseIsoDate(range.startDate)
        const windowEnd = parseIsoDate(range.endDate)
        const candidateStart = windowStart.getTime() > anchorStart.getTime() ? windowStart : anchorStart
        let year = candidateStart.getUTCFullYear()
        let month = candidateStart.getUTCMonth()

        function makeCandidate(nextYear: number, nextMonth: number): Date {
          return new Date(Date.UTC(nextYear, nextMonth, dayOfMonth))
        }

        let first = makeCandidate(year, month)
        if (first.getTime() < candidateStart.getTime()) {
          month += 1
          if (month > 11) {
            month = 0
            year += 1
          }
          first = makeCandidate(year, month)
        }

        const inputEnd = input.endDate ? parseIsoDate(input.endDate) : undefined
        let lastLimit = windowEnd
        if (inputEnd && inputEnd.getTime() < lastLimit.getTime()) {
          lastLimit = inputEnd
        }

        let maxByOcc: Date | undefined
        if (typeof input.occurrences === 'number') {
          const start = parseIsoDate(input.startDate)
          const startYear = start.getUTCFullYear()
          const startMonth = start.getUTCMonth()
          const occIndex = input.occurrences - 1
          const occYear = startYear + Math.floor((startMonth + occIndex) / 12)
          const occMonth = (startMonth + occIndex) % 12
          maxByOcc = makeCandidate(occYear, occMonth)
        }

        if (maxByOcc && maxByOcc.getTime() < lastLimit.getTime()) {
          lastLimit = maxByOcc
        }

        if (first.getTime() > lastLimit.getTime()) {
          return 0
        }

        const lastYear = lastLimit.getUTCFullYear()
        const lastMonth = lastLimit.getUTCMonth()
        const months = (lastYear - first.getUTCFullYear()) * 12 + (lastMonth - first.getUTCMonth())
        const n = months + 1

        if (mode === 'aggregate') {
          const signedAmount = input.direction === CashFlowDirection.Inflow ? input.amount : -input.amount
          return signedAmount * n
        }

        const rate = opts?.discountRate ?? 0
        const baseDateIso = opts?.baseDate ?? range.startDate
        const base = parseIsoDate(baseDateIso)
        const monthOffset =
          (first.getUTCFullYear() - base.getUTCFullYear()) * 12 +
          (first.getUTCMonth() - base.getUTCMonth()) +
          (first.getUTCDate() < base.getUTCDate() ? -1 : 0)
        const monthlyRate = Math.pow(1 + rate, 1 / 12) - 1
        const signedAmount = input.direction === CashFlowDirection.Inflow ? input.amount : -input.amount

        if (monthlyRate === 0) {
          return signedAmount * n
        }

        const firstDiscount = Math.pow(1 + monthlyRate, -monthOffset)
        const annuityFactor = (1 - Math.pow(1 + monthlyRate, -n)) / (1 - Math.pow(1 + monthlyRate, -1))
        return signedAmount * firstDiscount * annuityFactor
      }

      if (schedule.type === 'weekly' && typeof schedule.weekday === 'number') {
        const weekday = schedule.weekday
        const anchorStart = parseIsoDate(input.startDate)
        const windowStart = parseIsoDate(range.startDate)
        const windowEnd = parseIsoDate(range.endDate)
        const candidateStart = windowStart.getTime() > anchorStart.getTime() ? windowStart : anchorStart

        let first = new Date(
          Date.UTC(candidateStart.getUTCFullYear(), candidateStart.getUTCMonth(), candidateStart.getUTCDate())
        )
        const diff = (weekday - first.getUTCDay() + 7) % 7
        if (diff !== 0) {
          first = new Date(first.getTime() + diff * 24 * 60 * 60 * 1000)
        }

        const inputEnd = input.endDate ? parseIsoDate(input.endDate) : undefined
        let lastLimit = windowEnd
        if (inputEnd && inputEnd.getTime() < lastLimit.getTime()) {
          lastLimit = inputEnd
        }

        let maxByOcc: Date | undefined
        if (typeof input.occurrences === 'number') {
          const start = parseIsoDate(input.startDate)
          const occIndex = input.occurrences - 1
          maxByOcc = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + occIndex * 7))
        }

        if (maxByOcc && maxByOcc.getTime() < lastLimit.getTime()) {
          lastLimit = maxByOcc
        }

        if (first.getTime() > lastLimit.getTime()) {
          return 0
        }

        const daysDiff = Math.floor((lastLimit.getTime() - first.getTime()) / (24 * 60 * 60 * 1000))
        const weeks = Math.floor(daysDiff / 7)
        const n = weeks + 1

        if (mode === 'aggregate') {
          const signedAmount = input.direction === CashFlowDirection.Inflow ? input.amount : -input.amount
          return signedAmount * n
        }

        const weeklyRate = Math.pow(1 + (opts?.discountRate ?? 0), 1 / 52) - 1
        const baseDateIso = opts?.baseDate ?? range.startDate
        const base = parseIsoDate(baseDateIso)
        const weeksToFirst = Math.floor((first.getTime() - base.getTime()) / (7 * 24 * 60 * 60 * 1000))
        const signedAmount = input.direction === CashFlowDirection.Inflow ? input.amount : -input.amount

        if (weeklyRate === 0) {
          return signedAmount * n
        }

        const firstDiscount = Math.pow(1 + weeklyRate, -weeksToFirst)
        const annuityFactor = (1 - Math.pow(1 + weeklyRate, -n)) / (1 - Math.pow(1 + weeklyRate, -1))
        return signedAmount * firstDiscount * annuityFactor
      }

      if (
        schedule.type === 'annual' &&
        typeof schedule.day === 'number' &&
        typeof schedule.month === 'number'
      ) {
        const dayOfMonth = schedule.day
        const monthOfYear = schedule.month - 1
        const anchorStart = parseIsoDate(input.startDate)
        const windowStart = parseIsoDate(range.startDate)
        const windowEnd = parseIsoDate(range.endDate)
        const candidateStart = windowStart.getTime() > anchorStart.getTime() ? windowStart : anchorStart
        const year = candidateStart.getUTCFullYear()
        let first = new Date(Date.UTC(year, monthOfYear, dayOfMonth))
        if (first.getTime() < candidateStart.getTime()) {
          first = new Date(Date.UTC(year + 1, monthOfYear, dayOfMonth))
        }

        const inputEnd = input.endDate ? parseIsoDate(input.endDate) : undefined
        let lastLimit = windowEnd
        if (inputEnd && inputEnd.getTime() < lastLimit.getTime()) {
          lastLimit = inputEnd
        }

        let maxByOcc: Date | undefined
        if (typeof input.occurrences === 'number') {
          const start = parseIsoDate(input.startDate)
          const occIndex = input.occurrences - 1
          maxByOcc = new Date(Date.UTC(start.getUTCFullYear() + occIndex, monthOfYear, dayOfMonth))
        }

        if (maxByOcc && maxByOcc.getTime() < lastLimit.getTime()) {
          lastLimit = maxByOcc
        }

        if (first.getTime() > lastLimit.getTime()) {
          return 0
        }

        const n = lastLimit.getUTCFullYear() - first.getUTCFullYear() + 1

        if (mode === 'aggregate') {
          const signedAmount = input.direction === CashFlowDirection.Inflow ? input.amount : -input.amount
          return signedAmount * n
        }

        const rate = opts?.discountRate ?? 0
        const baseDateIso = opts?.baseDate ?? range.startDate
        const base = parseIsoDate(baseDateIso)
        const signedAmount = input.direction === CashFlowDirection.Inflow ? input.amount : -input.amount
        const yearsToFirst =
          first.getUTCFullYear() -
          base.getUTCFullYear() -
          (first.getUTCMonth() < base.getUTCMonth() ||
          (first.getUTCMonth() === base.getUTCMonth() && first.getUTCDate() < base.getUTCDate())
            ? 1
            : 0)

        if (rate === 0) {
          return signedAmount * n
        }

        const firstDiscount = Math.pow(1 + rate, -yearsToFirst)
        const annuityFactor = (1 - Math.pow(1 + rate, -n)) / (1 - Math.pow(1 + rate, -1))
        return signedAmount * firstDiscount * annuityFactor
      }
    } catch {
      // fall back to explicit expansion below
    }
  }

  const expanded = generateRecurringCashFlows({
    ...input,
    startDate: input.startDate,
    endDate: input.endDate,
    occurrences: input.occurrences
  })
  const inWindow = expanded.filter((cashFlow) => inRange(cashFlow.date, range))

  if (mode === 'expand') {
    return inWindow
  }

  if (mode === 'aggregate') {
    return inWindow.reduce(
      (sum, cashFlow) =>
        sum + (cashFlow.direction === CashFlowDirection.Inflow ? cashFlow.amount : -cashFlow.amount),
      0
    )
  }

  if (mode === 'npv') {
    const rate = opts?.discountRate ?? 0
    const baseDateIso = opts?.baseDate ?? range.startDate
    const base = parseIsoDate(baseDateIso)
    let presentValue = 0

    for (const cashFlow of inWindow) {
      const cashDate = parseIsoDate(cashFlow.date)
      const days = Math.round((cashDate.getTime() - base.getTime()) / (1000 * 60 * 60 * 24))
      const years = days / 365.0
      const discountFactor = Math.pow(1 + rate, years)
      const signedAmount =
        cashFlow.direction === CashFlowDirection.Inflow ? cashFlow.amount : -cashFlow.amount
      presentValue += signedAmount / discountFactor
    }

    return presentValue
  }

  throw new Error('Unsupported evaluation mode')
}