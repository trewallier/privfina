/**
 * Shared day-count and accrued-interest helpers for government securities (ADR 0038).
 */

import { parseIsoDate } from '../date_utils'

export type DayCountConvention = 'ACT/360' | 'ACT/365F' | '30E/360'

const MILLIS_PER_DAY = 24 * 60 * 60 * 1000

export const DEFAULT_GOVERNMENT_SECURITY_DAY_COUNT: DayCountConvention = 'ACT/360'

export function normalizeDayCountConvention(
  value: string | null | undefined
): DayCountConvention {
  const raw = String(value || '').trim().toUpperCase().replace(/\s+/g, '')
  if (!raw || raw === 'ACT/360' || raw === 'ACT360') return 'ACT/360'
  if (raw === 'ACT/365F' || raw === 'ACT/365' || raw === 'ACT365F' || raw === 'ACT365') {
    return 'ACT/365F'
  }
  if (raw === '30E/360' || raw === '30/360' || raw === '30E360') return '30E/360'
  throw new Error(`Unsupported day-count convention: ${value}`)
}

export function dayCountDenominator(convention: DayCountConvention): number {
  switch (convention) {
    case 'ACT/360':
    case '30E/360':
      return 360
    case 'ACT/365F':
      return 365
    default:
      return 360
  }
}

/** Calendar days between ISO dates (UTC), floored; negative if end < start. */
export function calendarDaysBetweenIso(startIso: string, endIso: string): number {
  const start = parseIsoDate(startIso)
  const end = parseIsoDate(endIso)
  return Math.floor((end.getTime() - start.getTime()) / MILLIS_PER_DAY)
}

/**
 * Accrued interest amount: principal × annualRatePct/100 × days / denominator.
 * Uses ACT calendar days for ACT/*; 30E/360 uses 30/360-style day count between dates.
 */
export function accrueInterestAmount(args: {
  principal: number
  annualRatePct: number
  fromIso: string
  toIso: string
  dayCount?: DayCountConvention | string | null
}): number {
  const principal = Number(args.principal)
  const annualRatePct = Number(args.annualRatePct)
  if (!Number.isFinite(principal) || principal < 0) {
    throw new Error('principal must be a non-negative finite number.')
  }
  if (!Number.isFinite(annualRatePct)) {
    throw new Error('annualRatePct must be a finite number.')
  }
  const convention = normalizeDayCountConvention(args.dayCount)
  const days =
    convention === '30E/360'
      ? thirtyE360Days(args.fromIso, args.toIso)
      : calendarDaysBetweenIso(args.fromIso, args.toIso)
  if (days < 0) {
    throw new Error('accrual end date must be on or after start date.')
  }
  if (days === 0) return 0
  return (principal * annualRatePct * days) / (100 * dayCountDenominator(convention))
}

function thirtyE360Days(fromIso: string, toIso: string): number {
  const start = parseIsoDate(fromIso)
  const end = parseIsoDate(toIso)
  let d1 = start.getUTCDate()
  let d2 = end.getUTCDate()
  const m1 = start.getUTCMonth() + 1
  const m2 = end.getUTCMonth() + 1
  const y1 = start.getUTCFullYear()
  const y2 = end.getUTCFullYear()
  if (d1 === 31) d1 = 30
  if (d2 === 31 && d1 === 30) d2 = 30
  return 360 * (y2 - y1) + 30 * (m2 - m1) + (d2 - d1)
}

export type CouponSchedulePeriod = {
  from: string
  to?: string | null
  rate?: number | null
}

function isValidIsoDate(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

/**
 * Accrual window start for secondary / mid-period purchase:
 * last coupon schedule `from` on or before purchase, else explicit startDate, else issueDate.
 */
export function resolveAccrualStartIso(args: {
  purchaseDate: string
  issueDate: string
  startDate?: string | null
  couponSchedule?: CouponSchedulePeriod[] | null
  /** Explicit prior coupon / accrual-start override (ISO). */
  accrualStartDate?: string | null
}): string {
  const purchaseDate = String(args.purchaseDate || '').trim()
  const issueDate = String(args.issueDate || '').trim()
  if (!isValidIsoDate(issueDate)) {
    throw new Error('issueDate must be an ISO date.')
  }
  if (!isValidIsoDate(purchaseDate)) {
    throw new Error('purchaseDate must be an ISO date.')
  }

  const explicit = String(args.accrualStartDate || '').trim()
  if (isValidIsoDate(explicit) && explicit <= purchaseDate) {
    return explicit
  }

  const rows = Array.isArray(args.couponSchedule) ? args.couponSchedule : []
  const priorCouponFrom = rows
    .map((row) => String(row?.from || '').trim())
    .filter((from) => isValidIsoDate(from) && from <= purchaseDate)
    .sort((a, b) => b.localeCompare(a))[0]
  if (priorCouponFrom) return priorCouponFrom

  const startDate = String(args.startDate || '').trim()
  if (isValidIsoDate(startDate) && startDate <= purchaseDate) {
    return startDate
  }
  return issueDate
}

/**
 * Pick the schedule period covering `onIso` with a defined rate, else the latest
 * prior period with a defined rate, else `fallbackAnnualRatePct`.
 * Callers that must not invent rates for schedule gaps should use
 * `resolveCoveringCouponPeriod` instead of relying on the fallback.
 */
export function resolveCouponRatePct(
  schedule: CouponSchedulePeriod[] | null | undefined,
  onIso: string,
  fallbackAnnualRatePct: number
): number {
  const covering = resolveCoveringCouponPeriod(schedule, onIso)
  if (covering && covering.rate != null && Number.isFinite(Number(covering.rate))) {
    return Number(covering.rate)
  }

  const rows = Array.isArray(schedule) ? schedule : []
  const prior = rows
    .filter(
      (row) =>
        row?.from &&
        row.from <= onIso &&
        row.rate != null &&
        Number.isFinite(Number(row.rate))
    )
    .sort((a, b) => String(b.from).localeCompare(String(a.from)))[0]
  if (prior && prior.rate != null) return Number(prior.rate)
  return fallbackAnnualRatePct
}

/** Period whose [from, to] window covers `onIso`, or undefined when none. */
export function resolveCoveringCouponPeriod(
  schedule: CouponSchedulePeriod[] | null | undefined,
  onIso: string
): CouponSchedulePeriod | undefined {
  const rows = Array.isArray(schedule) ? schedule : []
  return rows.find((row) => {
    if (!row?.from) return false
    if (row.from > onIso) return false
    if (row.to != null && row.to !== '' && row.to < onIso) return false
    return true
  })
}

/**
 * Calendar days from settlement to maturity for DKJ remaining-days (ACT day count).
 * Returns null when dates are missing/invalid or maturity is not after settlement.
 */
export function deriveDkjRemainingDays(
  settlementDate: string,
  maturityDate: string
): number | null {
  if (!isValidIsoDate(settlementDate) || !isValidIsoDate(maturityDate)) return null
  if (maturityDate <= settlementDate) return null
  return calendarDaysBetweenIso(settlementDate, maturityDate)
}

/**
 * Annualize a simple holding-period return with the discount-bill day-count denominator.
 * Default convention is ACT/360 (360-day year); other conventions change only the year length.
 */
export function annualizeDkjSimpleReturnPct(
  simpleReturnPct: number,
  remainingDays: number,
  dayCount: DayCountConvention | string | null | undefined = DEFAULT_GOVERNMENT_SECURITY_DAY_COUNT
): number {
  if (!Number.isFinite(simpleReturnPct)) {
    throw new Error('simpleReturnPct must be a finite number.')
  }
  if (!Number.isFinite(remainingDays) || remainingDays <= 0) {
    throw new Error('remainingDays must be a positive finite number.')
  }
  const denominator = dayCountDenominator(normalizeDayCountConvention(dayCount))
  return simpleReturnPct * (denominator / remainingDays)
}
