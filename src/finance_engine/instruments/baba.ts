/**
 * Babakötvény calculation primitives (ADR 0017 / 0038 / ROADMAP §6j).
 *
 * Annual HUF cash coupons with Ismertető ACT/ACT (Tényleges/tényleges) accrued
 * and irregular first-period payable rate gp = round(ga × days/regularYearDays, 0.01%).
 * Commercial inputs use effective annual rates (not live CPI + premium).
 * No kamatjuttatás; no productCode forks.
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
const FREQUENCY_MONTHS = 12

export type BabaRateOutputs = {
  annualCouponRatePct: number
}

export type BabaSpecInputs = {
  principal: number
  annualCouponRatePct: number
  purchaseDate: string
  issueDate: string
  maturityDate: string
  firstCouponDate?: string
  dayCountConvention?: DayCountConvention | string
  couponSchedule?: CouponSchedulePeriod[]
}

function addMonthsUtc(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()))
}

function addYearsUtc(date: Date, years: number): Date {
  return addMonthsUtc(date, years * 12)
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

/** Round rate percent to 0.01 (ajánlattétel kerekítés). */
export function roundCouponRatePctToHundredth(ratePct: number): number {
  return Math.round(ensureFiniteNumber(ratePct, 'ratePct') * 100) / 100
}

function resolveFirstCouponDateIso(specInputs: BabaSpecInputs): string {
  const issueDateIso = requireIso(specInputs.issueDate, 'issueDate')
  const firstCouponDateIso =
    typeof specInputs.firstCouponDate === 'string' ? String(specInputs.firstCouponDate).trim() : ''
  if (firstCouponDateIso) return requireIso(firstCouponDateIso, 'firstCouponDate')
  return formatIsoDate(addYearsUtc(parseIsoDate(issueDateIso), 1))
}

/** Technical anniversary dates: dt1 = firstCoupon − 1y, dt0 = firstCoupon − 2y. */
export function babaTechnicalAnniversaryDates(firstCouponDateIso: string): {
  dt0Iso: string
  dt1Iso: string
} {
  const firstCouponDate = parseIsoDate(requireIso(firstCouponDateIso, 'firstCouponDate'))
  return {
    dt1Iso: formatIsoDate(addMonthsUtc(firstCouponDate, -FREQUENCY_MONTHS)),
    dt0Iso: formatIsoDate(addMonthsUtc(firstCouponDate, -2 * FREQUENCY_MONTHS))
  }
}

/**
 * Irregular first-period payable coupon rate (2045/S: 7.40% × 364/365 = 7.38%).
 * gp = round(ga × (d1 − d0) / (d1 − dt1), 0.01%).
 */
export function babaFirstPeriodRatePct(args: {
  annualRatePct: number
  issueDate: string
  firstCouponDate: string
}): number {
  const ga = ensureNonNegativeNumber(args.annualRatePct, 'annualCouponRatePct')
  const issueDateIso = requireIso(args.issueDate, 'issueDate')
  const firstCouponDateIso = requireIso(args.firstCouponDate, 'firstCouponDate')
  const { dt1Iso } = babaTechnicalAnniversaryDates(firstCouponDateIso)
  const numer = calendarDaysBetweenIso(issueDateIso, firstCouponDateIso)
  const denom = calendarDaysBetweenIso(dt1Iso, firstCouponDateIso)
  if (denom <= 0 || numer <= 0) return roundCouponRatePctToHundredth(ga)
  return roundCouponRatePctToHundredth((ga * numer) / denom)
}

export function deriveBabaRateOutputs(
  specInputs: Pick<
    BabaSpecInputs,
    'annualCouponRatePct' | 'couponSchedule' | 'purchaseDate' | 'issueDate'
  >
): BabaRateOutputs {
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

/** Last coupon payment ISO on/before purchase, else issueDate. */
export function resolveBabaAccrualStartIso(
  specInputs: Pick<BabaSpecInputs, 'purchaseDate' | 'issueDate' | 'firstCouponDate'>
): string {
  const issueDateIso = requireIso(specInputs.issueDate, 'issueDate')
  const purchaseDateIso = requireIso(specInputs.purchaseDate, 'purchaseDate')
  const firstCouponDateIso = resolveFirstCouponDateIso(specInputs as BabaSpecInputs)

  let couponDate = parseIsoDate(firstCouponDateIso)
  let accrualStartIso = issueDateIso
  for (let step = 0; step < MAX_COUPON_STEPS; step += 1) {
    const couponIso = formatIsoDate(couponDate)
    if (couponIso > purchaseDateIso) break
    accrualStartIso = couponIso
    couponDate = addYearsUtc(couponDate, 1)
  }
  return accrualStartIso
}

export function listBabaPaymentDatesIso(
  specInputs: Pick<BabaSpecInputs, 'issueDate' | 'maturityDate' | 'firstCouponDate'>
): string[] {
  const maturityDateIso = requireIso(specInputs.maturityDate, 'maturityDate')
  const firstCouponDateIso = resolveFirstCouponDateIso(specInputs as BabaSpecInputs)
  const maturityDate = parseIsoDate(maturityDateIso)
  const dates: string[] = []
  let couponDate = parseIsoDate(firstCouponDateIso)
  for (let step = 0; step < MAX_COUPON_STEPS; step += 1) {
    if (couponDate.getTime() > maturityDate.getTime()) break
    dates.push(formatIsoDate(couponDate))
    couponDate = addYearsUtc(couponDate, 1)
  }
  return dates
}

/**
 * Accrued interest via Ismertető ACT/ACT period fractions.
 * Short first period (d0 > dt1): ga × (ds − d0) / (d1 − dt1).
 * Later periods: ga × (ds − lastPay) / (nextPay − lastPay).
 */
export function deriveBabaAccruedInterestAmount(
  specInputs: Pick<
    BabaSpecInputs,
    | 'principal'
    | 'purchaseDate'
    | 'issueDate'
    | 'firstCouponDate'
    | 'dayCountConvention'
    | 'annualCouponRatePct'
    | 'couponSchedule'
  >,
  annualCouponRatePct?: number
): number {
  void specInputs.dayCountConvention
  const issueDateIso = requireIso(specInputs.issueDate, 'issueDate')
  const purchaseDateIso = requireIso(specInputs.purchaseDate, 'purchaseDate')
  const firstCouponDateIso = resolveFirstCouponDateIso(specInputs as BabaSpecInputs)
  const principal = ensureNonNegativeNumber(specInputs.principal, 'principal')
  const ga =
    annualCouponRatePct != null
      ? ensureNonNegativeNumber(annualCouponRatePct, 'annualCouponRatePct')
      : deriveBabaRateOutputs(specInputs).annualCouponRatePct

  if (purchaseDateIso < issueDateIso) {
    throw new Error('purchaseDate must be on or after issueDate.')
  }
  if (purchaseDateIso === issueDateIso) return 0

  const { dt1Iso } = babaTechnicalAnniversaryDates(firstCouponDateIso)

  if (purchaseDateIso < firstCouponDateIso) {
    const denom = calendarDaysBetweenIso(dt1Iso, firstCouponDateIso)
    if (denom <= 0) return 0
    const numer = calendarDaysBetweenIso(issueDateIso, purchaseDateIso)
    return (principal * ga * Math.max(0, numer)) / (100 * denom)
  }

  const accrualStartIso = resolveBabaAccrualStartIso(specInputs)
  if (purchaseDateIso === accrualStartIso) return 0

  let nextPayment = addYearsUtc(parseIsoDate(accrualStartIso), 1)
  if (accrualStartIso === issueDateIso) {
    nextPayment = parseIsoDate(firstCouponDateIso)
  }
  const nextIso = formatIsoDate(nextPayment)
  const denom = calendarDaysBetweenIso(accrualStartIso, nextIso)
  if (denom <= 0) return 0
  const numer = calendarDaysBetweenIso(accrualStartIso, purchaseDateIso)
  return (principal * ga * numer) / (100 * denom)
}

function periodRatePctForPayment(args: {
  paymentIso: string
  isFirstPayment: boolean
  annualRatePct: number
  issueDateIso: string
  firstCouponDateIso: string
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
    return babaFirstPeriodRatePct({
      annualRatePct: ga,
      issueDate: args.issueDateIso,
      firstCouponDate: args.firstCouponDateIso
    })
  }
  return ensureNonNegativeNumber(ga, 'annualCouponRatePct')
}

/**
 * Customer cash flows: purchase outflow; annual HUF coupon inflows; principal at maturity.
 */
export function generateBabaAnnualCouponFlows(
  specInputs: BabaSpecInputs,
  purchaseAmount: number,
  annualCouponRatePct: number,
  description = 'BABA'
): CashFlow[] {
  const issueDateIso = requireIso(specInputs.issueDate, 'issueDate')
  const maturityDateIso = requireIso(specInputs.maturityDate, 'maturityDate')
  const purchaseDateIso = requireIso(specInputs.purchaseDate, 'purchaseDate')
  const firstCouponDateIso = resolveFirstCouponDateIso(specInputs)
  const principal = ensureNonNegativeNumber(specInputs.principal, 'principal')
  const schedule = Array.isArray(specInputs.couponSchedule) ? specInputs.couponSchedule : []
  const scheduleActive = schedule.length > 0
  const fallbackAnnualRatePct = ensureNonNegativeNumber(annualCouponRatePct, 'annualCouponRatePct')

  const flows: CashFlow[] = [
    createCashFlow(
      purchaseDateIso,
      purchaseAmount,
      CashFlowDirection.Outflow,
      'investment',
      description
    )
  ]

  const paymentDates = listBabaPaymentDatesIso(specInputs)
  for (let i = 0; i < paymentDates.length; i += 1) {
    const paymentIso = paymentDates[i]
    if (paymentIso < purchaseDateIso) continue
    const gp = periodRatePctForPayment({
      paymentIso,
      isFirstPayment: paymentIso === firstCouponDateIso,
      annualRatePct: fallbackAnnualRatePct,
      issueDateIso,
      firstCouponDateIso,
      schedule,
      scheduleActive,
      fallbackAnnualRatePct
    })
    if (gp == null) continue
    const couponAmount = (principal * gp) / 100
    flows.push(
      createCashFlow(paymentIso, couponAmount, CashFlowDirection.Inflow, 'investment', description)
    )
  }

  flows.push(
    createCashFlow(maturityDateIso, principal, CashFlowDirection.Inflow, 'investment', description)
  )

  return sortCashFlowsByDate(flows)
}
