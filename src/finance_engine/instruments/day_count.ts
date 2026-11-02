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

/** Pick the schedule period covering `onIso`, else the latest period with a defined rate that started on/before onIso. */
export function resolveCouponRatePct(
  schedule: CouponSchedulePeriod[] | null | undefined,
  onIso: string,
  fallbackAnnualRatePct: number
): number {
  const rows = Array.isArray(schedule) ? schedule : []
  const covering = rows.find((row) => {
    if (!row?.from) return false
    if (row.from > onIso) return false
    if (row.to != null && row.to !== '' && row.to < onIso) return false
    return row.rate != null && Number.isFinite(Number(row.rate))
  })
  if (covering && covering.rate != null) return Number(covering.rate)

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
