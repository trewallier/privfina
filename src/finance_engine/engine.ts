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

  const dayOfMonth = parseMonthlyCronDay(input.period)
  const startDate = parseIsoDate(input.startDate)
  const endDate = hasEndDate ? parseIsoDate(input.endDate as string) : undefined

  if (endDate && endDate.getTime() < startDate.getTime()) {
    throw new Error('endDate must be on or after startDate.')
  }

  const generated: CashFlow[] = []
  const category = input.category ?? 'general'
  const description = input.description
  const maxOccurrences = hasOccurrences ? (input.occurrences as number) : Number.MAX_SAFE_INTEGER

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
