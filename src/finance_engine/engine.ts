import type { CashFlow } from './models'
import { CashFlowDirection } from './models'

export interface DateRange {
  startDate: string
  endDate: string
}

export interface CashFlowDefinition {
  expand(range: DateRange): CashFlow[]
  evaluate(range: DateRange, mode: 'expand' | 'aggregate' | 'npv', opts?: { discountRate?: number; baseDate?: string }): number | CashFlow[]
}

export interface CalculationEngine {
  summarizeCashFlows(cashFlows: ReadonlyArray<CashFlow>): Array<{ period: string; total: number }>
}

export interface OneTimeCashFlowInput {
  date: string
  amount: number
  direction: CashFlowDirection
  category?: string
  description?: string
}

export interface RecurringCashFlowInput {
  period: string
  startDate: string
  endDate?: string
  occurrences?: number
  amount: number
  direction: CashFlowDirection
  category?: string
  description?: string
}

export interface CumulativePoint {
  date: string
  cumulativeTotal: number
}

function signedAmount(cashFlow: CashFlow): number {
  return cashFlow.direction === CashFlowDirection.Inflow ? cashFlow.amount : -cashFlow.amount
}

function parseIsoDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) {
    throw new Error(`Invalid ISO date: ${value}`)
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Invalid calendar date: ${value}`)
  }

  return date
}

function formatIsoDate(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function daysInMonthUtc(year: number, monthZeroBased: number): number {
  return new Date(Date.UTC(year, monthZeroBased + 1, 0)).getUTCDate()
}

function parseMonthlyCronDay(period: string): number {
  const cronMatch = /^([*]|[0-5]?\d)\s+([*]|[01]?\d|2[0-3])\s+([1-9]|[12]\d|3[01])\s+\*\s+\*$/.exec(
    period.trim()
  )
  if (!cronMatch) {
    throw new Error('Unsupported recurring period. Use a monthly cron-like format: "m h day * *".')
  }

  return Number(cronMatch[3])
}

function recognizeSchedule(period: string): { type: 'monthly' | 'weekly' | 'annual' | 'unsupported'; day?: number; month?: number; weekday?: number } {
  const toks = period.trim().split(/\s+/)
  if (toks.length !== 5) return { type: 'unsupported' }

  const [m, h, day, month, dow] = toks

  // monthly: m h day * *
  if (/^([1-9]|[12]\d|3[01])$/.test(day) && month === '*' && dow === '*') {
    return { type: 'monthly', day: Number(day) }
  }

  // weekly: m h * * weekday (0-6)
  if (day === '*' && month === '*' && /^([0-6])$/.test(dow)) {
    return { type: 'weekly', weekday: Number(dow) }
  }

  // annual: m h day month *  (month 1-12)
  if (/^([1-9]|[12]\d|3[01])$/.test(day) && /^([1-9]|1[0-2])$/.test(month) && dow === '*') {
    return { type: 'annual', day: Number(day), month: Number(month) }
  }

  return { type: 'unsupported' }
}

export function createOneTimeCashFlow(input: OneTimeCashFlowInput): CashFlow {
  const amount = Number(input.amount)
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('Amount must be a non-negative finite number.')
  }

  return {
    date: input.date,
    amount,
    direction: input.direction,
    category: input.category ?? 'general',
    description: input.description
  }
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
    // start from startDate, find first matching weekday on or after startDate
    let candidate = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()))
    const diff = (weekday - candidate.getUTCDay() + 7) % 7
    if (diff !== 0) candidate = new Date(candidate.getTime() + diff * 24 * 60 * 60 * 1000)

    while (generated.length < maxOccurrences) {
      if (endDate && candidate.getTime() > endDate.getTime()) break
      if (candidate.getTime() >= startDate.getTime()) {
        generated.push({ date: formatIsoDate(candidate), amount, direction: input.direction, category, description })
      }
      candidate = new Date(candidate.getTime() + 7 * 24 * 60 * 60 * 1000)
    }
  } else if (schedule.type === 'annual') {
    const dayOfMonth = schedule.day as number
    const monthOfYear = (schedule.month as number) - 1
    let year = startDate.getUTCFullYear()
    let candidate = new Date(Date.UTC(year, monthOfYear, dayOfMonth))
    if (candidate.getTime() < startDate.getTime()) candidate = new Date(Date.UTC(year + 1, monthOfYear, dayOfMonth))

    while (generated.length < maxOccurrences) {
      if (endDate && candidate.getTime() > endDate.getTime()) break
      if (candidate.getTime() >= startDate.getTime()) {
        generated.push({ date: formatIsoDate(candidate), amount, direction: input.direction, category, description })
      }
      year = candidate.getUTCFullYear() + 1
      candidate = new Date(Date.UTC(year, monthOfYear, dayOfMonth))
    }
  } else {
    throw new Error('Unsupported recurring period. Use cron-like period strings for monthly, weekly or annual schedules.')
  }

  return generated
}

function inRange(dateIso: string, range: DateRange): boolean {
  return dateIso >= range.startDate && dateIso <= range.endDate
}

export function evaluateRecurring(
  input: RecurringCashFlowInput,
  range: DateRange,
  mode: 'expand' | 'aggregate' | 'npv',
  opts?: { discountRate?: number; baseDate?: string }
): number | CashFlow[] {
  // For aggregate/npv modes prefer closed-form when possible for monthly fixed schedules
  if (mode === 'npv' || mode === 'aggregate') {
    try {
      const schedule = recognizeSchedule(input.period)
      // Monthly closed-form (day <= 28)
      if (schedule.type === 'monthly' && (schedule.day ?? 0) <= 28) {
        const dayOfMonth = schedule.day as number
        const anchorStart = parseIsoDate(input.startDate)
        const windowStart = parseIsoDate(range.startDate)
        const windowEnd = parseIsoDate(range.endDate)

        const candidateStart = windowStart.getTime() > anchorStart.getTime() ? windowStart : anchorStart
        let year = candidateStart.getUTCFullYear()
        let month = candidateStart.getUTCMonth()

        function makeCandidate(y: number, m: number): Date {
          return new Date(Date.UTC(y, m, dayOfMonth))
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
        if (inputEnd && inputEnd.getTime() < lastLimit.getTime()) lastLimit = inputEnd

        let maxByOcc: Date | undefined = undefined
        if (typeof input.occurrences === 'number') {
          const occCount = input.occurrences
          const start = parseIsoDate(input.startDate)
          const startYear = start.getUTCFullYear()
          const startMonth = start.getUTCMonth()
          const occIndex = occCount - 1
          const occYear = startYear + Math.floor((startMonth + occIndex) / 12)
          const occMonth = (startMonth + occIndex) % 12
          maxByOcc = makeCandidate(occYear, occMonth)
        }

        if (maxByOcc && maxByOcc.getTime() < lastLimit.getTime()) lastLimit = maxByOcc

        if (first.getTime() > lastLimit.getTime()) {
          return 0
        }

        const lastYear = lastLimit.getUTCFullYear()
        const lastMonth = lastLimit.getUTCMonth()
        const months = (lastYear - first.getUTCFullYear()) * 12 + (lastMonth - first.getUTCMonth())
        const n = months + 1

        if (mode === 'aggregate') {
          const amtSigned = input.direction === CashFlowDirection.Inflow ? input.amount : -input.amount
          return amtSigned * n
        }

        if (mode === 'npv') {
          const rate = opts?.discountRate ?? 0
          const baseDateIso = opts?.baseDate ?? range.startDate
          const base = parseIsoDate(baseDateIso)

          const m = (first.getUTCFullYear() - base.getUTCFullYear()) * 12 + (first.getUTCMonth() - base.getUTCMonth()) + (first.getUTCDate() < base.getUTCDate() ? -1 : 0)

          const monthlyR = Math.pow(1 + rate, 1 / 12) - 1
          const A = input.direction === CashFlowDirection.Inflow ? input.amount : -input.amount

          if (monthlyR === 0) {
            return A * Math.pow(1, -m) * n
          }

          const dfm = Math.pow(1 + monthlyR, -m)
          const factor = (1 - Math.pow(1 + monthlyR, -n)) / (1 - Math.pow(1 + monthlyR, -1))
          return A * dfm * factor
        }
      }

      // Weekly closed-form (fixed weekday)
      if (schedule.type === 'weekly' && typeof schedule.weekday === 'number') {
        const weekday = schedule.weekday
        const anchorStart = parseIsoDate(input.startDate)
        const windowStart = parseIsoDate(range.startDate)
        const windowEnd = parseIsoDate(range.endDate)

        const candidateStart = windowStart.getTime() > anchorStart.getTime() ? windowStart : anchorStart

        // find first weekday on or after candidateStart
        let first = new Date(Date.UTC(candidateStart.getUTCFullYear(), candidateStart.getUTCMonth(), candidateStart.getUTCDate()))
        const diff = (weekday - first.getUTCDay() + 7) % 7
        if (diff !== 0) first = new Date(first.getTime() + diff * 24 * 60 * 60 * 1000)

        const inputEnd = input.endDate ? parseIsoDate(input.endDate) : undefined
        let lastLimit = windowEnd
        if (inputEnd && inputEnd.getTime() < lastLimit.getTime()) lastLimit = inputEnd

        let maxByOcc: Date | undefined = undefined
        if (typeof input.occurrences === 'number') {
          const start = parseIsoDate(input.startDate)
          const occIndex = input.occurrences - 1
          maxByOcc = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + occIndex * 7))
        }
        if (maxByOcc && maxByOcc.getTime() < lastLimit.getTime()) lastLimit = maxByOcc

        if (first.getTime() > lastLimit.getTime()) {
          return 0
        }

        const daysDiff = Math.floor((lastLimit.getTime() - first.getTime()) / (24 * 60 * 60 * 1000))
        const weeks = Math.floor(daysDiff / 7)
        const n = weeks + 1

        if (mode === 'aggregate') {
          const amtSigned = input.direction === CashFlowDirection.Inflow ? input.amount : -input.amount
          return amtSigned * n
        }

        if (mode === 'npv') {
          const rate = opts?.discountRate ?? 0
          const baseDateIso = opts?.baseDate ?? range.startDate
          const base = parseIsoDate(baseDateIso)

          const weeklyR = Math.pow(1 + (opts?.discountRate ?? 0), 1 / 52) - 1
          const A = input.direction === CashFlowDirection.Inflow ? input.amount : -input.amount

          // months from base approximated as weeks difference
          const weeksToFirst = Math.floor((first.getTime() - base.getTime()) / (7 * 24 * 60 * 60 * 1000))
          if (weeklyR === 0) return A * n
          const dfm = Math.pow(1 + weeklyR, -weeksToFirst)
          const factor = (1 - Math.pow(1 + weeklyR, -n)) / (1 - Math.pow(1 + weeklyR, -1))
          return A * dfm * factor
        }
      }

      // Annual closed-form
      if (schedule.type === 'annual' && typeof schedule.day === 'number' && typeof schedule.month === 'number') {
        const dayOfMonth = schedule.day
        const monthOfYear = schedule.month - 1
        const anchorStart = parseIsoDate(input.startDate)
        const windowStart = parseIsoDate(range.startDate)
        const windowEnd = parseIsoDate(range.endDate)

        const candidateStart = windowStart.getTime() > anchorStart.getTime() ? windowStart : anchorStart
        let year = candidateStart.getUTCFullYear()
        let first = new Date(Date.UTC(year, monthOfYear, dayOfMonth))
        if (first.getTime() < candidateStart.getTime()) {
          first = new Date(Date.UTC(year + 1, monthOfYear, dayOfMonth))
        }

        const inputEnd = input.endDate ? parseIsoDate(input.endDate) : undefined
        let lastLimit = windowEnd
        if (inputEnd && inputEnd.getTime() < lastLimit.getTime()) lastLimit = inputEnd

        let maxByOcc: Date | undefined = undefined
        if (typeof input.occurrences === 'number') {
          const start = parseIsoDate(input.startDate)
          const occIndex = input.occurrences - 1
          maxByOcc = new Date(Date.UTC(start.getUTCFullYear() + occIndex, monthOfYear, dayOfMonth))
        }
        if (maxByOcc && maxByOcc.getTime() < lastLimit.getTime()) lastLimit = maxByOcc

        if (first.getTime() > lastLimit.getTime()) {
          return 0
        }

        const n = lastLimit.getUTCFullYear() - first.getUTCFullYear() + 1

        if (mode === 'aggregate') {
          const amtSigned = input.direction === CashFlowDirection.Inflow ? input.amount : -input.amount
          return amtSigned * n
        }

        if (mode === 'npv') {
          const rate = opts?.discountRate ?? 0
          const baseDateIso = opts?.baseDate ?? range.startDate
          const base = parseIsoDate(baseDateIso)

          const A = input.direction === CashFlowDirection.Inflow ? input.amount : -input.amount
          const yearsToFirst = first.getUTCFullYear() - base.getUTCFullYear() - (first.getUTCMonth() < base.getUTCMonth() || (first.getUTCMonth() === base.getUTCMonth() && first.getUTCDate() < base.getUTCDate()) ? 1 : 0)

          if (rate === 0) return A * n
          const dfm = Math.pow(1 + rate, -yearsToFirst)
          const factor = (1 - Math.pow(1 + rate, -n)) / (1 - Math.pow(1 + rate, -1))
          return A * dfm * factor
        }
      }
    } catch (e) {
      // fall back
    }
  }

  // Reuse generator which is already range-aware by startDate/endDate/occurrences
  const expanded = generateRecurringCashFlows({ ...input, startDate: input.startDate, endDate: input.endDate, occurrences: input.occurrences })
  const inWindow = expanded.filter((cf) => inRange(cf.date, range))

  if (mode === 'expand') {
    return inWindow
  }

  if (mode === 'aggregate') {
    return inWindow.reduce((s, cf) => s + (cf.direction === CashFlowDirection.Inflow ? cf.amount : -cf.amount), 0)
  }

  if (mode === 'npv') {
    const rate = opts?.discountRate ?? 0
    const baseDateIso = opts?.baseDate ?? range.startDate
    const base = parseIsoDate(baseDateIso)
    let pv = 0
    for (const cf of inWindow) {
      const cashDate = parseIsoDate(cf.date)
      const days = Math.round((cashDate.getTime() - base.getTime()) / (1000 * 60 * 60 * 24))
      const years = days / 365.0
      const df = Math.pow(1 + rate, years)
      const amt = cf.direction === CashFlowDirection.Inflow ? cf.amount : -cf.amount
      pv += amt / df
    }
    return pv
  }

  throw new Error('Unsupported evaluation mode')
}

export function calculateCumulativeSeries(
  cashFlows: ReadonlyArray<CashFlow>,
  startDate: string,
  endDate: string
): CumulativePoint[] {
  const filteredAndSorted = [...cashFlows]
    .filter((cashFlow) => cashFlow.date >= startDate && cashFlow.date <= endDate)
    .sort((a, b) => a.date.localeCompare(b.date))

  const series: CumulativePoint[] = []
  let runningTotal = 0

  for (const cashFlow of filteredAndSorted) {
    runningTotal += signedAmount(cashFlow)
    series.push({
      date: cashFlow.date,
      cumulativeTotal: runningTotal
    })
  }

  return series
}

export function createCalculationEngine(): CalculationEngine {
  return {
    summarizeCashFlows: () => []
  }
}
