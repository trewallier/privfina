import { formatIsoDate, parseIsoDate } from '../date_utils'
import type {
  DiscountBondDerivedMetrics,
  InflationLinkedAccrualPeriod,
  InflationLinkedDateMarkers,
  InvestmentInstrumentInput,
  LoanInstrumentInput
} from '../interfaces'
import type { CashFlow } from '../models'
import { CashFlowDirection } from '../models'

export const MONTHS_PER_YEAR = 12
export const DEFAULT_COUPON_PERIOD = '0 0 1 * *'
const FIRST_MONTH_INDEX = 0
const LAST_MONTH_INDEX = MONTHS_PER_YEAR - 1
const MIN_DAY_OF_MONTH = 1
const MAX_DAY_OF_MONTH = 31
const MILLIS_PER_DAY = 24 * 60 * 60 * 1000

export function incrementYearMonth(year: number, month: number): { year: number; month: number } {
  const nextMonth = month + 1
  if (nextMonth > LAST_MONTH_INDEX) {
    return { year: year + 1, month: FIRST_MONTH_INDEX }
  }

  return { year, month: nextMonth }
}

export function validateDayOfMonth(value: number, label: string): void {
  if (!Number.isInteger(value) || value < MIN_DAY_OF_MONTH || value > MAX_DAY_OF_MONTH) {
    throw new Error(`${label} must be an integer between 1 and 31.`)
  }
}

export function createCashFlow(
  date: string,
  amount: number,
  direction: CashFlowDirection,
  category: string,
  description?: string
): CashFlow {
  return {
    date,
    amount,
    direction,
    category,
    description
  }
}

export function sortCashFlowsByDate(flows: CashFlow[]): CashFlow[] {
  return flows.sort((a, b) => a.date.localeCompare(b.date))
}

export function ensurePositiveAmount(amount: number): number {
  const normalized = Number(amount)
  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new Error('Amount must be a non-negative finite number.')
  }
  return normalized
}

export function assertBoundedHorizon(endDate?: string, occurrences?: number): void {
  const hasEndDate = typeof endDate === 'string' && endDate.length > 0
  const hasOccurrences = typeof occurrences === 'number'

  if (!hasEndDate && !hasOccurrences) {
    throw new Error('Instrument generation requires endDate or occurrences to stay finite.')
  }

  if (hasOccurrences && (!Number.isInteger(occurrences) || occurrences <= 0)) {
    throw new Error('Occurrences must be a positive integer.')
  }
}

export function calculateMonthlyCompoundedAmount(principal: number, annualRate: number, months: number): number {
  return principal * Math.pow(1 + annualRate / MONTHS_PER_YEAR, months)
}

function monthsBetween(startDate: Date, endDate: Date): number {
  const years = endDate.getUTCFullYear() - startDate.getUTCFullYear()
  const months = endDate.getUTCMonth() - startDate.getUTCMonth()
  const dayAdjust = endDate.getUTCDate() < startDate.getUTCDate() ? -1 : 0
  return years * MONTHS_PER_YEAR + months + dayAdjust
}

export function maturityDateFromInput(
  purchaseDate: string,
  maturityDate: string
): { purchase: Date; maturity: Date; months: number } {
  const purchase = parseIsoDate(purchaseDate)
  const maturity = parseIsoDate(maturityDate)
  if (maturity.getTime() <= purchase.getTime()) {
    throw new Error('maturityDate must be after purchaseDate.')
  }

  const months = monthsBetween(purchase, maturity)
  if (months < 0) {
    throw new Error('maturityDate must be after purchaseDate.')
  }

  return { purchase, maturity, months }
}

export function resolveInvestmentFinancialDates(input: InvestmentInstrumentInput): {
  issue: Date
  transaction: Date
  due: Date
} {
  const transactionIso = input.transactionDate || input.purchaseDate
  const dueIso = input.dueDate || input.maturityDate
  const issueIso = input.issueDate || input.purchaseDate

  const issue = parseIsoDate(issueIso)
  const transaction = parseIsoDate(transactionIso)
  const due = parseIsoDate(dueIso)

  if (transaction.getTime() > due.getTime()) {
    throw new Error('transactionDate must be on or before dueDate.')
  }

  if (issue.getTime() > due.getTime()) {
    throw new Error('issueDate must be on or before dueDate.')
  }

  return { issue, transaction, due }
}

function daysBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / MILLIS_PER_DAY)
}

export function assertRefinedDiscountBondContract(input: InvestmentInstrumentInput): void {
  if (input.subtype !== 'discount-bond') {
    return
  }

  if (!input.issueDate || !input.transactionDate || !input.dueDate) {
    throw new Error('Discount bond requires issueDate, transactionDate, and dueDate.')
  }

  const { transaction, due } = resolveInvestmentFinancialDates(input)
  const remainingDays = daysBetween(transaction, due)
  if (remainingDays <= 0) {
    throw new Error('Discount bond dueDate must be after transactionDate.')
  }

  const purchaseAmount = getInvestmentPurchaseAmount(input)
  const faceValue = ensurePositiveAmount(input.principal)
  if (purchaseAmount <= 0 || faceValue <= 0) {
    throw new Error('Discount bond requires positive purchasePrice and principal(face value).')
  }
}

export function deriveDiscountBondMetrics(input: InvestmentInstrumentInput): DiscountBondDerivedMetrics {
  assertRefinedDiscountBondContract(input)
  const { transaction, due } = resolveInvestmentFinancialDates(input)
  const daysRemaining = daysBetween(transaction, due)

  const faceValue = ensurePositiveAmount(input.principal)
  const purchaseAmount = getInvestmentPurchaseAmount(input)
  const currentValuePercent = (purchaseAmount / faceValue) * 100
  if (currentValuePercent <= 0 || currentValuePercent >= 100) {
    throw new Error('Discount bond purchasePrice must be positive and below face value.')
  }

  const yieldPercent = ((100 - currentValuePercent) / currentValuePercent) * (360 / daysRemaining) * 100

  return {
    daysRemaining,
    currentValuePercent,
    yieldPercent
  }
}

function createAnnualMaturityDates(issue: Date, due: Date): Date[] {
  const dueMonth = due.getUTCMonth()
  const dueDay = due.getUTCDate()
  const results: Date[] = []

  for (let year = issue.getUTCFullYear() + 1; year <= due.getUTCFullYear(); year += 1) {
    const candidate = new Date(Date.UTC(year, dueMonth, dueDay))
    if (candidate.getTime() > issue.getTime() && candidate.getTime() <= due.getTime()) {
      results.push(candidate)
    }
  }

  if (results.length === 0 || results[results.length - 1].getTime() !== due.getTime()) {
    results.push(due)
  }

  return results
}

function rateForPeriod(maturityDate: Date, yearlyInflation: Map<number, number>, spreadRate: number): number {
  return (yearlyInflation.get(maturityDate.getUTCFullYear()) ?? 0) + spreadRate
}

export function assertRefinedInflationLinkedContract(input: InvestmentInstrumentInput): void {
  if (input.subtype !== 'inflation-linked-bond') {
    return
  }

  if (!input.issueDate || !input.transactionDate || !input.dueDate) {
    throw new Error('Inflation-linked bond requires issueDate, transactionDate, and dueDate.')
  }

  const spreadRate = Number(input.spreadRate)
  if (!Number.isFinite(spreadRate)) {
    throw new Error('Inflation-linked bond requires a valid spreadRate.')
  }

  const inflationEntries = input.yearlyInflation || []
  if (!Array.isArray(inflationEntries) || inflationEntries.length === 0) {
    throw new Error('Inflation-linked bond requires yearly inflation inputs.')
  }

  const { issue, due } = resolveInvestmentFinancialDates(input)
  if (due.getTime() <= issue.getTime()) {
    throw new Error('Inflation-linked bond dueDate must be after issueDate.')
  }
}

export function deriveInflationLinkedAccrualSchedule(input: InvestmentInstrumentInput): {
  dateMarkers: InflationLinkedDateMarkers
  annualMaturityDates: string[]
  accrualPeriods: InflationLinkedAccrualPeriod[]
} {
  assertRefinedInflationLinkedContract(input)

  const { issue, transaction, due } = resolveInvestmentFinancialDates(input)
  const spreadRate = Number(input.spreadRate ?? 0)
  const yearlyInflation = parseYearlyInflation(input.yearlyInflation)
  const maturityDates = createAnnualMaturityDates(issue, due)
  const firstMaturityDate = maturityDates[0]
  const firstTechnicalAccrualStartDate = new Date(
    Date.UTC(firstMaturityDate.getUTCFullYear() - 1, firstMaturityDate.getUTCMonth(), firstMaturityDate.getUTCDate())
  )

  const accrualPeriods: InflationLinkedAccrualPeriod[] = []

  for (let index = 0; index < maturityDates.length; index += 1) {
    const maturityDate = maturityDates[index]
    const effectiveAnnualRate = rateForPeriod(maturityDate, yearlyInflation, spreadRate)

    if (index === 0) {
      const numerator = Math.max(daysBetween(issue, transaction), 0)
      const denominator = Math.max(daysBetween(firstTechnicalAccrualStartDate, firstMaturityDate), 1)
      accrualPeriods.push({
        maturityDate: toIsoDate(maturityDate),
        effectiveAnnualRate,
        accrualFactor: effectiveAnnualRate * (numerator / denominator)
      })
      continue
    }

    const previousMaturityDate = maturityDates[index - 1]
    const numerator = Math.max(daysBetween(previousMaturityDate, maturityDate), 0)
    const denominator = Math.max(daysBetween(previousMaturityDate, maturityDate), 1)

    accrualPeriods.push({
      maturityDate: toIsoDate(maturityDate),
      effectiveAnnualRate,
      accrualFactor: effectiveAnnualRate * (numerator / denominator)
    })
  }

  return {
    dateMarkers: {
      issueDate: toIsoDate(issue),
      transactionDate: toIsoDate(transaction),
      dueDate: toIsoDate(due),
      firstMaturityDate: toIsoDate(firstMaturityDate),
      firstTechnicalAccrualStartDate: toIsoDate(firstTechnicalAccrualStartDate)
    },
    annualMaturityDates: maturityDates.map((date) => toIsoDate(date)),
    accrualPeriods
  }
}

export function parseYearlyInflation(input: InvestmentInstrumentInput['yearlyInflation']): Map<number, number> {
  const mapping = new Map<number, number>()
  for (const entry of input || []) {
    if (!entry) {
      continue
    }
    if (Number.isInteger(entry.year) && Number.isFinite(entry.rate)) {
      mapping.set(entry.year, entry.rate)
    }
  }
  return mapping
}

export function getInvestmentPurchaseAmount(input: InvestmentInstrumentInput): number {
  const purchasePrice = Number(input.purchasePrice)
  if (Number.isFinite(purchasePrice) && purchasePrice > 0) {
    return purchasePrice
  }
  return ensurePositiveAmount(input.principal)
}

export function calculateInflationLinkedMaturityAmount(
  principal: number,
  schedule: { accrualPeriods: InflationLinkedAccrualPeriod[] },
  yearlyInflation: Map<number, number>,
  spreadRate: number
): number {
  let maturityAmount = principal

  for (const period of schedule.accrualPeriods) {
    const periodYear = Number(period.maturityDate.slice(0, 4))
    const canonicalRate = (yearlyInflation.get(periodYear) ?? 0) + spreadRate
    const effectiveRate = Number.isFinite(period.effectiveAnnualRate) ? period.effectiveAnnualRate : canonicalRate
    const canonicalFactor = Number.isFinite(period.accrualFactor) ? period.accrualFactor : effectiveRate
    maturityAmount *= 1 + canonicalFactor
  }

  return maturityAmount
}

export interface BundleIdentityInput {
  label?: string
  id?: string
  createdAt?: string
}

export type LoanBundleInput = LoanInstrumentInput & BundleIdentityInput

export interface InvestmentBundleInput extends InvestmentInstrumentInput, BundleIdentityInput {
  couponPeriod?: string
}

export function toIsoDate(date: Date): string {
  return formatIsoDate(date)
}
