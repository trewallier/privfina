/**
 * MÁP Plusz calculation primitives (ADR 0017 / 0038 / ROADMAP §6j).
 *
 * Series-authored couponFrequencyMonths (12 = newer annual-pay; 6 = older
 * semi-annual) shares one product path. Accrued interest and irregular first
 * period gp follow the ÁKK Ismertető ACT/ACT period-fraction formulas.
 * Intermediate kamatteljesítés is kamatjuttatás (in-kind face); only maturity
 * pays HUF coupon cash. Year-band couponSchedule rows select covering ga only.
 */

import { formatIsoDate, parseIsoDate } from '../date_utils'
import { createCashFlow, sortCashFlowsByDate } from './common'
import {
  calendarDaysBetweenIso,
  resolveCoveringCouponPeriod,
  resolveCouponRatePct,
  type CouponSchedulePeriod,
  type DayCountConvention
} from './day_count'
import { CashFlowDirection } from '../models'
import type { CashFlow } from '../models'

const MAX_COUPON_STEPS = 240
const DEFAULT_FREQUENCY_MONTHS = 12

export type MappCouponFrequencyMonths = 6 | 12

export type MappRateOutputs = {
  annualCouponRatePct: number
}

export type MappSpecInputs = {
  principal: number
  annualCouponRatePct: number
  purchaseDate: string
  issueDate: string
  maturityDate: string
  firstCouponDate?: string
  couponFrequencyMonths?: MappCouponFrequencyMonths | number | string
  dayCountConvention?: DayCountConvention | string
  couponSchedule?: CouponSchedulePeriod[]
}

function addMonthsUtc(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()))
}

function ensureFiniteNumber(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`)
  }
  return value
}

function ensureNonNegativeNumber(value: number, label: string): number {
  const normalized = ensureFiniteNumber(value, label)
  if (normalized < 0) {
    throw new Error(`${label} must be a non-negative finite number.`)
  }
  return normalized
}

function requireIso(value: string | undefined, label: string): string {
  const iso = String(value || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    throw new Error(`${label} must be an ISO date.`)
  }
  return iso
}

export function normalizeMappCouponFrequencyMonths(
  value: MappCouponFrequencyMonths | number | string | null | undefined
): MappCouponFrequencyMonths {
  if (value == null || value === '') return DEFAULT_FREQUENCY_MONTHS
  const n = Number(value)
  if (n === 6) return 6
  if (n === 12) return 12
  throw new Error('couponFrequencyMonths must be 6 (semi-annual) or 12 (annual).')
}

/** Regular period rate gp = ga × frequencyMonths / 12. */
export function mappRegularPeriodRatePct(
  annualRatePct: number,
  frequencyMonths: MappCouponFrequencyMonths
): number {
  return ensureNonNegativeNumber(annualRatePct, 'annualCouponRatePct') * (frequencyMonths / 12)
}

/**
 * Irregular first-period gp (Ismertető): gBase + gBase × (dt1−d0)/(dt1−dt0)
 * with technical dates stepped back one/two frequency periods from firstCouponDate.
 */
export function mappFirstPeriodRatePct(args: {
  annualRatePct: number
  issueDate: string
  firstCouponDate: string
  couponFrequencyMonths?: MappCouponFrequencyMonths | number | string
}): number {
  const frequencyMonths = normalizeMappCouponFrequencyMonths(args.couponFrequencyMonths)
  const gBase = mappRegularPeriodRatePct(args.annualRatePct, frequencyMonths)
  const issueDateIso = requireIso(args.issueDate, 'issueDate')
  const firstCouponDateIso = requireIso(args.firstCouponDate, 'firstCouponDate')
  const firstCouponDate = parseIsoDate(firstCouponDateIso)
  const dt1Iso = formatIsoDate(addMonthsUtc(firstCouponDate, -frequencyMonths))
  const dt0Iso = formatIsoDate(addMonthsUtc(firstCouponDate, -2 * frequencyMonths))
  const numer = calendarDaysBetweenIso(issueDateIso, dt1Iso)
  const denom = calendarDaysBetweenIso(dt0Iso, dt1Iso)
  if (denom <= 0 || numer <= 0) return gBase
  return gBase + (gBase * numer) / denom
}

export function deriveMappRateOutputs(
  specInputs: Pick<
    MappSpecInputs,
    'annualCouponRatePct' | 'couponSchedule' | 'purchaseDate' | 'issueDate'
  >
): MappRateOutputs {
  const purchaseDate = String(specInputs.purchaseDate || specInputs.issueDate || '').trim()
  const fallback = ensureNonNegativeNumber(
    Number(specInputs.annualCouponRatePct),
    'annualCouponRatePct'
  )
  const annualCouponRatePct = resolveCouponRatePct(
    specInputs.couponSchedule,
    purchaseDate || String(specInputs.issueDate || ''),
    fallback
  )
  return { annualCouponRatePct }
}

function resolveFirstCouponDateIso(specInputs: MappSpecInputs, frequencyMonths: MappCouponFrequencyMonths): string {
  const issueDateIso = requireIso(specInputs.issueDate, 'issueDate')
  const firstCouponDateIso =
    typeof specInputs.firstCouponDate === 'string' ? String(specInputs.firstCouponDate).trim() : ''
  if (firstCouponDateIso) return requireIso(firstCouponDateIso, 'firstCouponDate')
  return formatIsoDate(addMonthsUtc(parseIsoDate(issueDateIso), frequencyMonths))
}

/** Payment dates from first coupon through maturity (inclusive when on grid). */
export function listMappPaymentDatesIso(
  specInputs: Pick<MappSpecInputs, 'issueDate' | 'maturityDate' | 'firstCouponDate' | 'couponFrequencyMonths'>
): string[] {
  const frequencyMonths = normalizeMappCouponFrequencyMonths(specInputs.couponFrequencyMonths)
  const maturityDateIso = requireIso(specInputs.maturityDate, 'maturityDate')
  const firstCouponDateIso = resolveFirstCouponDateIso(specInputs as MappSpecInputs, frequencyMonths)
  const maturityDate = parseIsoDate(maturityDateIso)
  const dates: string[] = []
  let couponDate = parseIsoDate(firstCouponDateIso)
  for (let step = 0; step < MAX_COUPON_STEPS; step += 1) {
    if (couponDate.getTime() > maturityDate.getTime()) break
    dates.push(formatIsoDate(couponDate))
    couponDate = addMonthsUtc(couponDate, frequencyMonths)
  }
  return dates
}

/**
 * Last coupon payment ISO on/before purchase, else issueDate.
 * Does not consult couponSchedule band starts (rate windows only).
 */
export function resolveMappAccrualStartIso(
  specInputs: Pick<
    MappSpecInputs,
    'purchaseDate' | 'issueDate' | 'firstCouponDate' | 'couponFrequencyMonths'
  >
): string {
  const issueDateIso = requireIso(specInputs.issueDate, 'issueDate')
  const purchaseDateIso = requireIso(specInputs.purchaseDate, 'purchaseDate')
  const frequencyMonths = normalizeMappCouponFrequencyMonths(specInputs.couponFrequencyMonths)
  const firstCouponDateIso = resolveFirstCouponDateIso(specInputs as MappSpecInputs, frequencyMonths)

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
 * Accrued interest via Ismertető ACT/ACT period-fraction formulas.
 * First (possibly irregular) period uses technical dt0/dt1; later periods use
 * previous payment → next payment.
 */
export function deriveMappAccruedInterestAmount(
  specInputs: Pick<
    MappSpecInputs,
    | 'principal'
    | 'purchaseDate'
    | 'issueDate'
    | 'firstCouponDate'
    | 'couponFrequencyMonths'
    | 'dayCountConvention'
    | 'annualCouponRatePct'
    | 'couponSchedule'
  >,
  annualCouponRatePct?: number
): number {
  void specInputs.dayCountConvention
  const issueDateIso = requireIso(specInputs.issueDate, 'issueDate')
  const purchaseDateIso = requireIso(specInputs.purchaseDate, 'purchaseDate')
  const frequencyMonths = normalizeMappCouponFrequencyMonths(specInputs.couponFrequencyMonths)
  const firstCouponDateIso = resolveFirstCouponDateIso(specInputs as MappSpecInputs, frequencyMonths)
  const principal = ensureNonNegativeNumber(specInputs.principal, 'principal')
  const ga =
    annualCouponRatePct != null
      ? ensureNonNegativeNumber(annualCouponRatePct, 'annualCouponRatePct')
      : deriveMappRateOutputs(specInputs).annualCouponRatePct
  const gBase = mappRegularPeriodRatePct(ga, frequencyMonths)

  if (purchaseDateIso < issueDateIso) {
    throw new Error('purchaseDate must be on or after issueDate.')
  }
  if (purchaseDateIso === issueDateIso) return 0

  const firstCouponDate = parseIsoDate(firstCouponDateIso)
  const dt1Iso = formatIsoDate(addMonthsUtc(firstCouponDate, -frequencyMonths))
  const dt0Iso = formatIsoDate(addMonthsUtc(firstCouponDate, -2 * frequencyMonths))

  if (purchaseDateIso < firstCouponDateIso) {
    // Still in first (possibly irregular) period.
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

  const accrualStartIso = resolveMappAccrualStartIso(specInputs)
  if (purchaseDateIso === accrualStartIso) return 0

  // Next payment after accrual start.
  let nextPayment = addMonthsUtc(parseIsoDate(accrualStartIso), frequencyMonths)
  // If accrual start is issue (purchase after first coupon path shouldn't hit), use first coupon.
  if (accrualStartIso === issueDateIso) {
    nextPayment = parseIsoDate(firstCouponDateIso)
  }
  const nextIso = formatIsoDate(nextPayment)
  const denom = calendarDaysBetweenIso(accrualStartIso, nextIso)
  if (denom <= 0) return 0
  const numer = calendarDaysBetweenIso(accrualStartIso, purchaseDateIso)
  return (principal * gBase * numer) / (100 * denom)
}

function periodRatePctForPayment(args: {
  paymentIso: string
  isFirstPayment: boolean
  annualRatePct: number
  issueDateIso: string
  firstCouponDateIso: string
  frequencyMonths: MappCouponFrequencyMonths
  schedule: CouponSchedulePeriod[]
  scheduleActive: boolean
  fallbackAnnualRatePct: number
}): number | null {
  const covering = resolveCoveringCouponPeriod(args.schedule, args.paymentIso)
  if (args.scheduleActive) {
    if (!covering || covering.rate == null || !Number.isFinite(Number(covering.rate))) {
      return null
    }
  }
  const ga =
    covering && covering.rate != null && Number.isFinite(Number(covering.rate))
      ? Number(covering.rate)
      : args.fallbackAnnualRatePct

  if (args.isFirstPayment) {
    return mappFirstPeriodRatePct({
      annualRatePct: ga,
      issueDate: args.issueDateIso,
      firstCouponDate: args.firstCouponDateIso,
      couponFrequencyMonths: args.frequencyMonths
    })
  }
  return mappRegularPeriodRatePct(ga, args.frequencyMonths)
}

/**
 * Customer cash flows: purchase outflow; intermediate kamatjuttatás compounds
 * face with no HUF inflow; maturity pays HUF coupon on compounded face + redemption.
 */
export function generateMappCouponFlows(
  specInputs: MappSpecInputs,
  purchaseAmount: number,
  annualCouponRatePct: number,
  description = 'MAPP'
): CashFlow[] {
  const issueDateIso = requireIso(specInputs.issueDate, 'issueDate')
  const maturityDateIso = requireIso(specInputs.maturityDate, 'maturityDate')
  const purchaseDateIso = requireIso(specInputs.purchaseDate, 'purchaseDate')
  const frequencyMonths = normalizeMappCouponFrequencyMonths(specInputs.couponFrequencyMonths)
  const firstCouponDateIso = resolveFirstCouponDateIso(specInputs, frequencyMonths)
  let face = ensureNonNegativeNumber(specInputs.principal, 'principal')
  const schedule = Array.isArray(specInputs.couponSchedule) ? specInputs.couponSchedule : []
  const scheduleActive = schedule.length > 0
  const fallbackAnnual = ensureNonNegativeNumber(annualCouponRatePct, 'annualCouponRatePct')

  const flows: CashFlow[] = [
    createCashFlow(
      purchaseDateIso,
      purchaseAmount,
      CashFlowDirection.Outflow,
      'investment',
      description
    )
  ]

  const paymentDates = listMappPaymentDatesIso(specInputs)
  for (let i = 0; i < paymentDates.length; i += 1) {
    const paymentIso = paymentDates[i]
    if (paymentIso < purchaseDateIso) continue

    const gp = periodRatePctForPayment({
      paymentIso,
      isFirstPayment: paymentIso === firstCouponDateIso,
      annualRatePct: fallbackAnnual,
      issueDateIso,
      firstCouponDateIso,
      frequencyMonths,
      schedule,
      scheduleActive,
      fallbackAnnualRatePct: fallbackAnnual
    })
    if (gp == null) continue

    const couponAmount = (face * gp) / 100
    const isMaturityPayment = paymentIso === maturityDateIso || i === paymentDates.length - 1

    if (isMaturityPayment && paymentIso >= maturityDateIso) {
      // Final kamatfizetés in HUF + principal redemption of compounded face.
      if (couponAmount > 0) {
        flows.push(
          createCashFlow(maturityDateIso, couponAmount, CashFlowDirection.Inflow, 'investment', description)
        )
      }
      flows.push(
        createCashFlow(maturityDateIso, face, CashFlowDirection.Inflow, 'investment', description)
      )
      face = 0
      break
    }

    // Intermediate kamatjuttatás: additional same-series face, no HUF inflow.
    face += couponAmount
  }

  if (face > 0) {
    // Maturity not on payment grid — still redeem remaining face.
    flows.push(
      createCashFlow(maturityDateIso, face, CashFlowDirection.Inflow, 'investment', description)
    )
  }

  return sortCashFlowsByDate(flows)
}

/** @deprecated Prefer generateMappCouponFlows. */
export function generateMappSemiAnnualCouponFlows(
  specInputs: MappSpecInputs,
  purchaseAmount: number,
  annualCouponRatePct: number,
  description = 'MAPP'
): CashFlow[] {
  return generateMappCouponFlows(specInputs, purchaseAmount, annualCouponRatePct, description)
}
