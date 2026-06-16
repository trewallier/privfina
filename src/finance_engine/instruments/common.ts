import { formatIsoDate, parseIsoDate } from '../date_utils'
import type { InvestmentInstrumentInput, LoanInstrumentInput } from '../interfaces'
import type { CashFlow } from '../models'
import { CashFlowDirection } from '../models'

export const MONTHS_PER_YEAR = 12
export const DEFAULT_COUPON_PERIOD = '0 0 1 * *'
const FIRST_MONTH_INDEX = 0
const LAST_MONTH_INDEX = MONTHS_PER_YEAR - 1
const MIN_DAY_OF_MONTH = 1
const MAX_DAY_OF_MONTH = 31

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
  purchaseDate: Date,
  months: number,
  yearlyInflation: Map<number, number>,
  spreadRate: number
): number {
  let maturityAmount = principal
  let cursor = new Date(Date.UTC(purchaseDate.getUTCFullYear(), purchaseDate.getUTCMonth(), purchaseDate.getUTCDate()))
  const periodCount = Math.max(months, 0)

  for (let index = 0; index < periodCount; index += MONTHS_PER_YEAR) {
    const year = cursor.getUTCFullYear()
    const inflationRate = yearlyInflation.get(year) ?? 0
    maturityAmount *= 1 + inflationRate + spreadRate
    cursor = new Date(Date.UTC(year + 1, cursor.getUTCMonth(), cursor.getUTCDate()))
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
