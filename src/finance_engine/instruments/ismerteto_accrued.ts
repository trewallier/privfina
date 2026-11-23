/**
 * ÁKK Ismertető ACT/ACT (Tényleges/tényleges) accrued-interest period fractions.
 *
 * Used by PMÁP (annual, ga) and FixMÁP (quarterly, ga/n). Same *contract* shape
 * as MÁP Plusz / Babakötvény, but this module is intentionally separate for now:
 * - Short-first (`issue > dt1`) uses denom `dt1→d1` (Ismertető case 2).
 * - `mapp.ts` currently falls through to partA/partB and can yield a negative
 *   partA when `issue > dt1`; do not route MÁP Plusz through this helper until
 *   that divergence is reconciled in a dedicated follow-up.
 * - Babakötvény keeps its own annual path (first-period cash-coupon rounding).
 *
 * Not ISDA Actual/Actual calendar-year fraction (`actActIsdaYearFraction`).
 */

import { formatIsoDate, parseIsoDate } from '../date_utils'
import { calendarDaysBetweenIso, isActActDayCountConvention } from './day_count'

export { isActActDayCountConvention }

const MAX_COUPON_STEPS = 240

function ensureNonNegativeNumber(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`)
  }
  if (value < 0) {
    throw new Error(`${label} must be a non-negative finite number.`)
  }
  return value
}

function requireIso(value: string | undefined, label: string): string {
  const iso = String(value || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    throw new Error(`${label} must be an ISO date.`)
  }
  return iso
}

function addMonthsUtc(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()))
}

/** Period rate gp base: ga × frequencyMonths/12 (annual → ga; quarterly → ga/4). */
export function ismertetoPeriodRatePct(annualRatePct: number, frequencyMonths: number): number {
  const ga = ensureNonNegativeNumber(annualRatePct, 'annualRatePct')
  const months = Number(frequencyMonths)
  if (![3, 6, 12].includes(months)) {
    throw new Error('frequencyMonths must be 3, 6, or 12.')
  }
  return ga * (months / 12)
}

export function resolveIsmertetoFirstCouponDateIso(args: {
  issueDate: string
  firstCouponDate?: string | null
  frequencyMonths: number
}): string {
  const issueDateIso = requireIso(args.issueDate, 'issueDate')
  const first = String(args.firstCouponDate || '').trim()
  if (first) return requireIso(first, 'firstCouponDate')
  return formatIsoDate(
    addMonthsUtc(parseIsoDate(issueDateIso), Number(args.frequencyMonths))
  )
}

/** Last coupon payment on/before purchase, else issueDate. */
export function resolveIsmertetoAccrualStartIso(args: {
  purchaseDate: string
  issueDate: string
  firstCouponDate?: string | null
  frequencyMonths: number
}): string {
  const issueDateIso = requireIso(args.issueDate, 'issueDate')
  const purchaseDateIso = requireIso(args.purchaseDate, 'purchaseDate')
  const firstCouponDateIso = resolveIsmertetoFirstCouponDateIso(args)
  const frequencyMonths = Number(args.frequencyMonths)

  let couponDate = parseIsoDate(firstCouponDateIso)
  let accrualStartIso = issueDateIso
  for (let step = 0; step < MAX_COUPON_STEPS; step += 1) {
    const couponIso = formatIsoDate(couponDate)
    if (couponIso > purchaseDateIso) break
    accrualStartIso = couponIso
    couponDate = addMonthsUtc(couponDate, frequencyMonths)
  }
  return accrualStartIso
}

/**
 * Accrued interest amount per ÁKK Ismertető ACT/ACT period-fraction formulas.
 * First period uses technical dt0/dt1; later periods use previous → next payment.
 */
export function accrueIsmertetoActActAmount(args: {
  principal: number
  annualRatePct: number
  purchaseDate: string
  issueDate: string
  firstCouponDate?: string | null
  frequencyMonths: number
}): number {
  const issueDateIso = requireIso(args.issueDate, 'issueDate')
  const purchaseDateIso = requireIso(args.purchaseDate, 'purchaseDate')
  const frequencyMonths = Number(args.frequencyMonths)
  const firstCouponDateIso = resolveIsmertetoFirstCouponDateIso(args)
  const principal = ensureNonNegativeNumber(args.principal, 'principal')
  const gBase = ismertetoPeriodRatePct(args.annualRatePct, frequencyMonths)

  if (purchaseDateIso < issueDateIso) {
    throw new Error('purchaseDate must be on or after issueDate.')
  }
  if (purchaseDateIso === issueDateIso) return 0

  const firstCouponDate = parseIsoDate(firstCouponDateIso)
  const dt1Iso = formatIsoDate(addMonthsUtc(firstCouponDate, -frequencyMonths))
  const dt0Iso = formatIsoDate(addMonthsUtc(firstCouponDate, -2 * frequencyMonths))

  if (purchaseDateIso < firstCouponDateIso) {
    // Case 2: short first period (d0 > dt1) — single fraction over technical year grid.
    if (issueDateIso > dt1Iso) {
      const denom = calendarDaysBetweenIso(dt1Iso, firstCouponDateIso)
      if (denom <= 0) return 0
      const numer = calendarDaysBetweenIso(issueDateIso, purchaseDateIso)
      return (principal * gBase * Math.max(0, numer)) / (100 * denom)
    }
    // Case 3: equal first period (d0 = dt1).
    if (issueDateIso === dt1Iso) {
      const denom = calendarDaysBetweenIso(issueDateIso, firstCouponDateIso)
      if (denom <= 0) return 0
      const numer = calendarDaysBetweenIso(issueDateIso, purchaseDateIso)
      return (principal * gBase * numer) / (100 * denom)
    }
    // Case 1: long first period (d0 < dt1).
    if (purchaseDateIso <= dt1Iso) {
      const denom = calendarDaysBetweenIso(dt0Iso, dt1Iso)
      if (denom <= 0) return 0
      const numer = calendarDaysBetweenIso(issueDateIso, purchaseDateIso)
      return (principal * gBase * Math.max(0, numer)) / (100 * denom)
    }
    const partADenom = calendarDaysBetweenIso(dt0Iso, dt1Iso)
    const partBDenom = calendarDaysBetweenIso(dt1Iso, firstCouponDateIso)
    const partA =
      partADenom > 0
        ? (gBase * calendarDaysBetweenIso(issueDateIso, dt1Iso)) / partADenom
        : 0
    const partB =
      partBDenom > 0
        ? (gBase * calendarDaysBetweenIso(dt1Iso, purchaseDateIso)) / partBDenom
        : 0
    return (principal * (partA + partB)) / 100
  }

  const accrualStartIso = resolveIsmertetoAccrualStartIso({
    purchaseDate: purchaseDateIso,
    issueDate: issueDateIso,
    firstCouponDate: firstCouponDateIso,
    frequencyMonths
  })
  if (purchaseDateIso === accrualStartIso) return 0

  let nextPayment = addMonthsUtc(parseIsoDate(accrualStartIso), frequencyMonths)
  if (accrualStartIso === issueDateIso) {
    nextPayment = parseIsoDate(firstCouponDateIso)
  }
  const nextIso = formatIsoDate(nextPayment)
  const denom = calendarDaysBetweenIso(accrualStartIso, nextIso)
  if (denom <= 0) return 0
  const numer = calendarDaysBetweenIso(accrualStartIso, purchaseDateIso)
  return (principal * gBase * numer) / (100 * denom)
}
