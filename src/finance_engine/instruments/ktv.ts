/**
 * MÁK / `ktv` calculation primitives (ADR 0017 / 0038 / 0044 / 0047 / ROADMAP §6j / §6q).
 *
 * Babakötvény-style first-period payable stub on published ga under ACT/365F
 * (Actual/365): stub = round(ga × days/365, 0.01%). Accrue on ga — never treat
 * the stub as a FixMÁP covering annual band. ADR 0044 ingest ACT/360-when-null
 * is quote fallback only, not product math for the 2037/A witness.
 * FLOAT (§6q / ADR 0047): quarterly ACT/360 payable from resolved period ga;
 * skip periods with null rate; never invent / never write ktv coupons.
 * No productCode forks.
 */

import { formatIsoDate, parseIsoDate } from '../date_utils'
import { createCashFlow, sortCashFlowsByDate } from './common'
import {
  accrueInterestAmount,
  calendarDaysBetweenIso,
  dayCountDenominator,
  normalizeDayCountConvention,
  resolveCoveringCouponPeriod,
  resolveCouponRatePct,
  type CouponSchedulePeriod,
  type DayCountConvention
} from './day_count'
import { CashFlowDirection } from '../models'
import type { CashFlow } from '../models'

const MAX_COUPON_STEPS = 240
/** Product default for MÁK 2037/A witness (Actual/365). */
export const KTV_DEFAULT_DAY_COUNT: DayCountConvention = 'ACT/365F'
/** FLOAT indexReset default day-count (ÁKK ISSUE ACT/360). */
export const KTV_FLOAT_DAY_COUNT: DayCountConvention = 'ACT/360'
/** FLOAT default period length when indexReset.periodMonths omitted. */
export const KTV_FLOAT_DEFAULT_PERIOD_MONTHS = 3

export type KtvRateOutputs = {
  annualCouponRatePct: number
}

export type KtvSpecInputs = {
  principal: number
  annualCouponRatePct: number
  purchaseDate: string
  issueDate: string
  maturityDate: string
  firstCouponDate?: string
  dayCountConvention?: DayCountConvention | string
  couponSchedule?: CouponSchedulePeriod[]
  /**
   * Optional offering / derived payment dates (period turns). When present for
   * FLOAT, prefer these over maturity-anniversary generation (ADR 0047).
   */
  paymentDates?: string[]
  /** FLOAT interest period length in months (default 3). */
  periodMonths?: number
}

function addYearsUtc(date: Date, years: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear() + years, date.getUTCMonth(), date.getUTCDate()))
}

function addMonthsUtc(date: Date, months: number): Date {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth() + months
  const day = date.getUTCDate()
  const targetYear = year + Math.floor(month / 12)
  const targetMonth = ((month % 12) + 12) % 12
  const dim = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
  return new Date(Date.UTC(targetYear, targetMonth, Math.min(day, dim)))
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
export function roundKtvCouponRatePctToHundredth(ratePct: number): number {
  return Math.round(ensureFiniteNumber(ratePct, 'ratePct') * 100) / 100
}

function resolveKtvDayCount(value: string | null | undefined): DayCountConvention {
  const raw = String(value || '').trim()
  if (!raw) return KTV_DEFAULT_DAY_COUNT
  return normalizeDayCountConvention(raw)
}

function resolveFirstCouponDateIso(specInputs: KtvSpecInputs): string {
  const issueDateIso = requireIso(specInputs.issueDate, 'issueDate')
  const firstCouponDateIso =
    typeof specInputs.firstCouponDate === 'string' ? String(specInputs.firstCouponDate).trim() : ''
  if (firstCouponDateIso) return requireIso(firstCouponDateIso, 'firstCouponDate')
  return formatIsoDate(addYearsUtc(parseIsoDate(issueDateIso), 1))
}

/**
 * Irregular first-period payable stub (2037/A: 6.25% × 217/365 = 3.72%).
 * gp = round(ga × (firstCoupon − issue) / denom, 0.01%) with ACT/365F denom 365.
 */
export function ktvFirstPeriodRatePct(args: {
  annualRatePct: number
  issueDate: string
  firstCouponDate: string
  dayCountConvention?: DayCountConvention | string
}): number {
  const ga = ensureNonNegativeNumber(args.annualRatePct, 'annualCouponRatePct')
  const issueDateIso = requireIso(args.issueDate, 'issueDate')
  const firstCouponDateIso = requireIso(args.firstCouponDate, 'firstCouponDate')
  const convention = resolveKtvDayCount(args.dayCountConvention)
  const numer = calendarDaysBetweenIso(issueDateIso, firstCouponDateIso)
  const denom = dayCountDenominator(convention)
  if (denom <= 0 || numer <= 0) return roundKtvCouponRatePctToHundredth(ga)
  return roundKtvCouponRatePctToHundredth((ga * numer) / denom)
}

export function deriveKtvRateOutputs(
  specInputs: Pick<
    KtvSpecInputs,
    'annualCouponRatePct' | 'couponSchedule' | 'purchaseDate' | 'issueDate'
  >
): KtvRateOutputs {
  const purchaseDate = String(specInputs.purchaseDate || specInputs.issueDate || '').trim()
  const fallback = ensureNonNegativeNumber(
    Number(specInputs.annualCouponRatePct),
    'annualCouponRatePct'
  )
  // Keep published ga; schedule covering is for later stepped bands, not the stub.
  const annualCouponRatePct = resolveCouponRatePct(
    specInputs.couponSchedule,
    purchaseDate || String(specInputs.issueDate || ''),
    fallback
  )
  return { annualCouponRatePct }
}

/** True when inputs carry FLOAT period length (SPA / adapter set periodMonths). */
export function isKtvFloatSpecInputs(
  specInputs: Pick<KtvSpecInputs, 'periodMonths'>
): boolean {
  const months = Number(specInputs.periodMonths)
  return Number.isFinite(months) && months > 0
}

/** Last coupon payment ISO on/before purchase, else issueDate (FIX annual path). */
export function resolveKtvAccrualStartIso(
  specInputs: Pick<
    KtvSpecInputs,
    'purchaseDate' | 'issueDate' | 'firstCouponDate' | 'periodMonths' | 'paymentDates' | 'maturityDate'
  >
): string {
  if (isKtvFloatSpecInputs(specInputs) && specInputs.maturityDate) {
    return resolveKtvFloatAccrualStartIso(specInputs as KtvSpecInputs)
  }
  const issueDateIso = requireIso(specInputs.issueDate, 'issueDate')
  const purchaseDateIso = requireIso(specInputs.purchaseDate, 'purchaseDate')
  const firstCouponDateIso = resolveFirstCouponDateIso(specInputs as KtvSpecInputs)

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

/**
 * FLOAT accrual start = latest period turn on or before purchase (period start).
 * Falls back to issueDate when no turn is on/before purchase.
 */
export function resolveKtvFloatAccrualStartIso(
  specInputs: Pick<
    KtvSpecInputs,
    'purchaseDate' | 'issueDate' | 'maturityDate' | 'paymentDates' | 'periodMonths' | 'firstCouponDate'
  >
): string {
  const issueDateIso = requireIso(specInputs.issueDate, 'issueDate')
  const purchaseDateIso = requireIso(specInputs.purchaseDate, 'purchaseDate')
  const turns = listKtvFloatPeriodTurnsIso(specInputs)
  let best = issueDateIso
  for (const turn of turns) {
    if (turn <= purchaseDateIso && turn >= best) best = turn
  }
  return best
}

export function listKtvPaymentDatesIso(
  specInputs: Pick<KtvSpecInputs, 'issueDate' | 'maturityDate' | 'firstCouponDate'>
): string[] {
  const maturityDateIso = requireIso(specInputs.maturityDate, 'maturityDate')
  const firstCouponDateIso = resolveFirstCouponDateIso(specInputs as KtvSpecInputs)
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
 * Accrued interest on published / resolved ga.
 * FIX default: ACT/365F from annual anniversary. FLOAT (periodMonths set): ACT/360
 * from latest period turn on/before purchase (ADR 0047).
 */
export function deriveKtvAccruedInterestAmount(
  specInputs: Pick<
    KtvSpecInputs,
    | 'principal'
    | 'purchaseDate'
    | 'issueDate'
    | 'maturityDate'
    | 'firstCouponDate'
    | 'dayCountConvention'
    | 'annualCouponRatePct'
    | 'couponSchedule'
    | 'periodMonths'
    | 'paymentDates'
  >,
  annualCouponRatePct?: number
): number {
  const purchaseDateIso = requireIso(specInputs.purchaseDate, 'purchaseDate')
  const accrualStartIso = resolveKtvAccrualStartIso(specInputs)
  if (purchaseDateIso < accrualStartIso) {
    throw new Error('purchaseDate must be on or after accrual start (prior coupon or issueDate).')
  }
  const rate =
    annualCouponRatePct != null
      ? ensureNonNegativeNumber(annualCouponRatePct, 'annualCouponRatePct')
      : deriveKtvRateOutputs(specInputs).annualCouponRatePct
  const principal = ensureNonNegativeNumber(specInputs.principal, 'principal')
  const dayCount = isKtvFloatSpecInputs(specInputs)
    ? normalizeDayCountConvention(specInputs.dayCountConvention || KTV_FLOAT_DAY_COUNT)
    : resolveKtvDayCount(specInputs.dayCountConvention)
  return accrueInterestAmount({
    principal,
    annualRatePct: rate,
    fromIso: accrualStartIso,
    toIso: purchaseDateIso,
    dayCount
  })
}

function periodRatePctForPayment(args: {
  paymentIso: string
  isFirstPayment: boolean
  annualRatePct: number
  issueDateIso: string
  firstCouponDateIso: string
  dayCountConvention?: DayCountConvention | string
  schedule: CouponSchedulePeriod[]
  scheduleActive: boolean
  fallbackAnnualRatePct: number
}): number | null {
  const covering = resolveCoveringCouponPeriod(args.schedule, args.paymentIso)
  if (args.scheduleActive) {
    if (!covering || covering.rate == null || !Number.isFinite(Number(covering.rate))) {
      // Still allow deriving the first-period stub from ga when schedule omits it.
      if (!args.isFirstPayment) return null
    }
  }

  const ga =
    covering && covering.rate != null && Number.isFinite(Number(covering.rate)) && !args.isFirstPayment
      ? Number(covering.rate)
      : args.fallbackAnnualRatePct

  if (args.isFirstPayment) {
    return ktvFirstPeriodRatePct({
      annualRatePct: args.fallbackAnnualRatePct,
      issueDate: args.issueDateIso,
      firstCouponDate: args.firstCouponDateIso,
      dayCountConvention: args.dayCountConvention
    })
  }
  return ensureNonNegativeNumber(ga, 'annualCouponRatePct')
}

/**
 * Customer cash flows: purchase outflow; annual HUF coupon inflows; principal at maturity.
 * First cash uses payable stub from ga × days/365; later coupons use ga (or schedule bands).
 */
export function generateKtvAnnualCouponFlows(
  specInputs: KtvSpecInputs,
  purchaseAmount: number,
  annualCouponRatePct: number,
  description = 'MÁK'
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

  const paymentDates = listKtvPaymentDatesIso(specInputs)
  for (let i = 0; i < paymentDates.length; i += 1) {
    const paymentIso = paymentDates[i]
    if (paymentIso < purchaseDateIso) continue
    const gp = periodRatePctForPayment({
      paymentIso,
      isFirstPayment: paymentIso === firstCouponDateIso,
      annualRatePct: fallbackAnnualRatePct,
      issueDateIso,
      firstCouponDateIso,
      dayCountConvention: specInputs.dayCountConvention,
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

/**
 * Period-turn dates for FLOAT MÁK: prefer explicit paymentDates; else
 * maturity-anniversary every `periodMonths` back from maturity through issue
 * (ADR 0047). Always includes maturity when it is a turn.
 */
export function listKtvFloatPeriodTurnsIso(
  specInputs: Pick<
    KtvSpecInputs,
    'issueDate' | 'maturityDate' | 'paymentDates' | 'periodMonths' | 'firstCouponDate'
  >
): string[] {
  const maturityDateIso = requireIso(specInputs.maturityDate, 'maturityDate')
  const issueDateIso = requireIso(specInputs.issueDate, 'issueDate')
  const explicit = Array.isArray(specInputs.paymentDates)
    ? specInputs.paymentDates
        .map((d) => String(d || '').trim())
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
        .sort()
    : []
  if (explicit.length > 0) {
    return explicit.filter((d) => d >= issueDateIso && d <= maturityDateIso)
  }

  const periodMonths = Math.max(
    1,
    Number(specInputs.periodMonths) || KTV_FLOAT_DEFAULT_PERIOD_MONTHS
  )
  const maturityDate = parseIsoDate(maturityDateIso)
  const issueDate = parseIsoDate(issueDateIso)
  const turns: string[] = []
  let cursor = maturityDate
  for (let step = 0; step < MAX_COUPON_STEPS; step += 1) {
    if (cursor.getTime() < issueDate.getTime()) break
    turns.push(formatIsoDate(cursor))
    cursor = addMonthsUtc(cursor, -periodMonths)
  }
  turns.reverse()
  const firstCoupon =
    typeof specInputs.firstCouponDate === 'string' ? String(specInputs.firstCouponDate).trim() : ''
  if (firstCoupon && /^\d{4}-\d{2}-\d{2}$/.test(firstCoupon) && !turns.includes(firstCoupon)) {
    turns.push(firstCoupon)
    turns.sort()
  }
  return turns
}

/**
 * FLOAT MÁK cash flows: purchase outflow; ACT/360 period payables when rate known;
 * skip null-rate periods; principal at maturity (ADR 0047).
 *
 * `periodRatesByTurnIso` keys are period-**end** payment dates (the turn that
 * closes the accrued interval). Rate resolve uses period-**start** turns
 * (`resolveMakFloatAnnualRatePct.periodTurnIso`) — do not mix the two.
 */
export function generateKtvFloatCouponFlows(
  specInputs: KtvSpecInputs,
  purchaseAmount: number,
  periodRatesByTurnIso: ReadonlyMap<string, number | null> | Record<string, number | null>,
  description = 'MÁK'
): CashFlow[] {
  const maturityDateIso = requireIso(specInputs.maturityDate, 'maturityDate')
  const purchaseDateIso = requireIso(specInputs.purchaseDate, 'purchaseDate')
  const issueDateIso = requireIso(specInputs.issueDate, 'issueDate')
  const principal = ensureNonNegativeNumber(specInputs.principal, 'principal')
  const convention = normalizeDayCountConvention(
    specInputs.dayCountConvention || KTV_FLOAT_DAY_COUNT
  )
  const rateMap =
    periodRatesByTurnIso instanceof Map
      ? periodRatesByTurnIso
      : new Map(Object.entries(periodRatesByTurnIso))

  const flows: CashFlow[] = [
    createCashFlow(
      purchaseDateIso,
      purchaseAmount,
      CashFlowDirection.Outflow,
      'investment',
      description
    )
  ]

  const turns = listKtvFloatPeriodTurnsIso(specInputs)
  for (let i = 0; i < turns.length; i += 1) {
    const paymentIso = turns[i]
    if (paymentIso < purchaseDateIso) continue
    if (paymentIso === maturityDateIso && i === turns.length - 1) {
      // Maturity principal is added separately; coupon for final period still pays when rated.
    }
    const rateRaw = rateMap.has(paymentIso) ? rateMap.get(paymentIso) : undefined
    if (rateRaw == null || !Number.isFinite(Number(rateRaw))) continue
    const ratePct = ensureNonNegativeNumber(Number(rateRaw), 'periodRatePct')
    const periodStartIso = i === 0 ? issueDateIso : turns[i - 1]
    const amount = accrueInterestAmount({
      principal,
      annualRatePct: ratePct,
      fromIso: periodStartIso,
      toIso: paymentIso,
      dayCount: convention
    })
    if (amount > 0) {
      flows.push(
        createCashFlow(paymentIso, amount, CashFlowDirection.Inflow, 'investment', description)
      )
    }
  }

  flows.push(
    createCashFlow(maturityDateIso, principal, CashFlowDirection.Inflow, 'investment', description)
  )

  return sortCashFlowsByDate(flows)
}
