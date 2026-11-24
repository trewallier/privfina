/**
 * Shared day-count and accrued-interest helpers for government securities (ADR 0038).
 */

import { formatIsoDate, parseIsoDate } from '../date_utils'

export type DayCountConvention = 'ACT/360' | 'ACT/365F' | 'ACT/ACT' | '30E/360'

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
  if (isActActDayCountConvention(value)) return 'ACT/ACT'
  if (raw === '30E/360' || raw === '30/360' || raw === '30E360') return '30E/360'
  throw new Error(`Unsupported day-count convention: ${value}`)
}

/** True for ACT/ACT / Actual/Actual aliases (ÁKK Tényleges/tényleges token). */
export function isActActDayCountConvention(value: string | null | undefined): boolean {
  const raw = String(value || '').trim().toUpperCase().replace(/\s+/g, '')
  return (
    raw === 'ACT/ACT' ||
    raw === 'ACTACT' ||
    raw === 'ACTUAL/ACTUAL' ||
    raw === 'ACTUALACTUAL'
  )
}

export function dayCountDenominator(convention: DayCountConvention): number {
  switch (convention) {
    case 'ACT/360':
    case '30E/360':
      return 360
    case 'ACT/365F':
      return 365
    case 'ACT/ACT':
      throw new Error('ACT/ACT has no fixed year denominator; use accrueInterestAmount.')
    default:
      return 360
  }
}

function isUtcLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/**
 * ISDA Actual/Actual year fraction between ISO dates (UTC).
 * Splits on calendar-year boundaries; each portion uses days / (365 or 366
 * when that calendar year is a leap year).
 *
 * Used only by the generic `accrueInterestAmount` ACT/ACT branch. PMÁP/FixMÁP
 * offering ACT/ACT accrued uses ÁKK Ismertető period fractions
 * (`accrueIsmertetoActActAmount`); BMÁP remaps ACT/ACT → ACT/360.
 */
export function actActIsdaYearFraction(fromIso: string, toIso: string): number {
  const start = parseIsoDate(fromIso)
  const end = parseIsoDate(toIso)
  if (end.getTime() < start.getTime()) {
    throw new Error('accrual end date must be on or after start date.')
  }
  if (end.getTime() === start.getTime()) return 0

  let fraction = 0
  let cursor = new Date(start.getTime())
  while (cursor.getUTCFullYear() < end.getUTCFullYear()) {
    const nextYearStart = new Date(Date.UTC(cursor.getUTCFullYear() + 1, 0, 1))
    const days = Math.floor((nextYearStart.getTime() - cursor.getTime()) / MILLIS_PER_DAY)
    const denom = isUtcLeapYear(cursor.getUTCFullYear()) ? 366 : 365
    fraction += days / denom
    cursor = nextYearStart
  }
  const days = Math.floor((end.getTime() - cursor.getTime()) / MILLIS_PER_DAY)
  const denom = isUtcLeapYear(cursor.getUTCFullYear()) ? 366 : 365
  fraction += days / denom
  return fraction
}

/** Calendar days between ISO dates (UTC), floored; negative if end < start. */
export function calendarDaysBetweenIso(startIso: string, endIso: string): number {
  const start = parseIsoDate(startIso)
  const end = parseIsoDate(endIso)
  return Math.floor((end.getTime() - start.getTime()) / MILLIS_PER_DAY)
}

/**
 * Accrued interest amount: principal × annualRatePct/100 × day-count fraction.
 * ACT/360 and ACT/365F use calendar days over a fixed year length; ACT/ACT uses
 * ISDA Actual/Actual year fraction (generic fallback only — govsec ACT/ACT
 * product paths prefer `accrueIsmertetoActActAmount`); 30E/360 uses 30/360-style
 * day count.
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
  if (convention === 'ACT/ACT') {
    const yearFraction = actActIsdaYearFraction(args.fromIso, args.toIso)
    if (yearFraction === 0) return 0
    return (principal * annualRatePct * yearFraction) / 100
  }
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

function addMonthsUtc(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()))
}

/**
 * Accrual start from a **payment** calendar (last payment on/before purchase,
 * else issueDate). Use for products whose couponSchedule Froms are rate bands
 * (e.g. FixMÁP annual ga bands) rather than payment dates — do not use
 * {@link resolveAccrualStartIso} with those bands for mid-hold accrued.
 */
export function resolvePaymentCalendarAccrualStartIso(args: {
  purchaseDate: string
  issueDate: string
  /** Explicit payment dates (offering / quarterly schedule). */
  paymentDates?: readonly string[] | null
  firstCouponDate?: string | null
  /** When paymentDates empty, walk firstCouponDate (or issue+freq) by this step. */
  frequencyMonths?: number
}): string {
  const purchaseDate = String(args.purchaseDate || '').trim()
  const issueDate = String(args.issueDate || '').trim()
  if (!isValidIsoDate(issueDate)) {
    throw new Error('issueDate must be an ISO date.')
  }
  if (!isValidIsoDate(purchaseDate)) {
    throw new Error('purchaseDate must be an ISO date.')
  }

  const explicit = (Array.isArray(args.paymentDates) ? args.paymentDates : [])
    .map((entry) => String(entry || '').trim())
    .filter((entry) => isValidIsoDate(entry) && entry <= purchaseDate)
    .sort()

  let payments = explicit
  if (payments.length === 0) {
    const freq = Number(args.frequencyMonths)
    if (Number.isFinite(freq) && freq > 0) {
      const firstRaw = String(args.firstCouponDate || '').trim()
      let cursor = isValidIsoDate(firstRaw)
        ? firstRaw
        : formatIsoDate(addMonthsUtc(parseIsoDate(issueDate), freq))
      payments = []
      for (let step = 0; step < 240 && cursor <= purchaseDate; step += 1) {
        payments.push(cursor)
        cursor = formatIsoDate(addMonthsUtc(parseIsoDate(cursor), freq))
      }
    }
  }

  let start = issueDate
  for (const payment of payments) {
    if (payment <= purchaseDate) start = payment
  }
  return start
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
 * Default convention is ACT/360 (360-day year); other fixed-denominator conventions
 * change only the year length. ACT/ACT is not valid for DKJ annualization.
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
  const convention = normalizeDayCountConvention(dayCount)
  if (convention === 'ACT/ACT') {
    throw new Error('ACT/ACT is not valid for DKJ annualization.')
  }
  const denominator = dayCountDenominator(convention)
  return simpleReturnPct * (denominator / remainingDays)
}
