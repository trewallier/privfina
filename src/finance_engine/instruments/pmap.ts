/**
 * Reusable PMÁP calculation primitives (ADR 0017 / 0038).
 */

import { formatIsoDate, parseIsoDate } from '../date_utils'
import { createCashFlow, sortCashFlowsByDate } from './common'
import {
  accrueInterestAmount,
  normalizeDayCountConvention,
  resolveAccrualStartIso,
  resolveCoveringCouponPeriod,
  resolveCouponRatePct,
  type CouponSchedulePeriod,
  type DayCountConvention
} from './day_count'
import {
  accrueIsmertetoActActAmount,
  isActActDayCountConvention
} from './ismerteto_accrued'
import { CashFlowDirection } from '../models'
import type { CashFlow } from '../models'

/** PMÁP pays annually — Ismertető ACT/ACT uses ga over the annual grid. */
export const PMAP_COUPON_FREQUENCY_MONTHS = 12

export type PmapRateOutputs = {
  annualCouponRatePct: number
}

export type PmapSpecInputs = {
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

export function derivePmapRateOutputs(
  specInputs: Pick<PmapSpecInputs, 'annualCouponRatePct' | 'couponSchedule' | 'purchaseDate' | 'issueDate'>
): PmapRateOutputs {
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

export function derivePmapAccruedInterestAmount(
  specInputs: Pick<
    PmapSpecInputs,
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
  const issueDateIso = requireIso(specInputs.issueDate, 'issueDate')
  const purchaseDateIso = requireIso(specInputs.purchaseDate, 'purchaseDate')
  const rate =
    annualCouponRatePct != null
      ? ensureNonNegativeNumber(annualCouponRatePct, 'annualCouponRatePct')
      : derivePmapRateOutputs(specInputs).annualCouponRatePct
  const principal = ensureNonNegativeNumber(specInputs.principal, 'principal')

  // Offering Tényleges/tényleges → Ismertető ACT/ACT period fractions (not ISDA).
  if (isActActDayCountConvention(specInputs.dayCountConvention)) {
    return accrueIsmertetoActActAmount({
      principal,
      annualRatePct: rate,
      purchaseDate: purchaseDateIso,
      issueDate: issueDateIso,
      firstCouponDate: specInputs.firstCouponDate,
      frequencyMonths: PMAP_COUPON_FREQUENCY_MONTHS
    })
  }

  const accrualStartIso = resolveAccrualStartIso({
    purchaseDate: purchaseDateIso,
    issueDate: issueDateIso,
    couponSchedule: specInputs.couponSchedule
  })
  if (purchaseDateIso < accrualStartIso) {
    throw new Error('purchaseDate must be on or after accrual start (prior coupon or issueDate).')
  }
  return accrueInterestAmount({
    principal,
    annualRatePct: rate,
    fromIso: accrualStartIso,
    toIso: purchaseDateIso,
    dayCount: normalizeDayCountConvention(specInputs.dayCountConvention)
  })
}

/**
 * Coupon cash-flow calendar for fixed/stepped coupon bonds.
 * `frequencyMonths` 12 = annual (PMÁP); 3 = quarterly (FixMÁP). Period cash =
 * ga × frequencyMonths/12. When `paymentDates` is non-empty, those ISO dates are
 * the payment calendar (offering / schedule); otherwise walk firstCoupon→maturity
 * by frequencyMonths.
 */
export function generateCouponFlowsWithFrequency(
  specInputs: PmapSpecInputs,
  purchaseAmount: number,
  annualCouponRatePct: number,
  description: string,
  frequencyMonths: number,
  paymentDates?: readonly string[] | null
): CashFlow[] {
  const step = Number(frequencyMonths)
  if (!Number.isFinite(step) || step <= 0 || 12 % step !== 0) {
    throw new Error('frequencyMonths must be a positive divisor of 12.')
  }
  const periodsPerYear = 12 / step
  const issueDateIso = requireIso(specInputs.issueDate, 'issueDate')
  const maturityDateIso = requireIso(specInputs.maturityDate, 'maturityDate')
  const purchaseDateIso = requireIso(specInputs.purchaseDate, 'purchaseDate')
  const firstCouponDateIso =
    typeof specInputs.firstCouponDate === 'string' ? String(specInputs.firstCouponDate).trim() : ''
  const principal = ensureNonNegativeNumber(specInputs.principal, 'principal')
  const schedule = Array.isArray(specInputs.couponSchedule) ? specInputs.couponSchedule : []
  const scheduleActive = schedule.length > 0

  const flows: CashFlow[] = [
    createCashFlow(
      purchaseDateIso,
      purchaseAmount,
      CashFlowDirection.Outflow,
      'investment',
      description
    )
  ]

  const explicitPayments = (Array.isArray(paymentDates) ? paymentDates : [])
    .map((entry) => String(entry || '').trim())
    .filter((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry))
    .filter((entry) => entry > issueDateIso)
    .sort()

  function pushCouponIfDue(couponIso: string): void {
    if (couponIso < purchaseDateIso) return
    if (couponIso > maturityDateIso) return
    const period = resolveCoveringCouponPeriod(schedule, couponIso)
    if (scheduleActive) {
      // With an explicit schedule: null rate OR missing covering period → skip (no invent).
      if (!period || period.rate == null || !Number.isFinite(Number(period.rate))) {
        return
      }
    } else if (period && (period.rate == null || !Number.isFinite(Number(period.rate)))) {
      return
    }
    const ratePct =
      period && period.rate != null && Number.isFinite(Number(period.rate))
        ? Number(period.rate)
        : annualCouponRatePct
    const couponAmount = (principal * ratePct) / 100 / periodsPerYear
    flows.push(
      createCashFlow(couponIso, couponAmount, CashFlowDirection.Inflow, 'investment', description)
    )
  }

  if (explicitPayments.length > 0) {
    for (const couponIso of explicitPayments) {
      pushCouponIfDue(couponIso)
    }
  } else {
    let couponDate = firstCouponDateIso
      ? parseIsoDate(firstCouponDateIso)
      : addMonthsUtc(parseIsoDate(issueDateIso), step)
    const maturityDate = parseIsoDate(maturityDateIso)
    while (couponDate.getTime() <= maturityDate.getTime()) {
      pushCouponIfDue(formatIsoDate(couponDate))
      couponDate = addMonthsUtc(couponDate, step)
    }
  }

  flows.push(
    createCashFlow(maturityDateIso, principal, CashFlowDirection.Inflow, 'investment', description)
  )

  return sortCashFlowsByDate(flows)
}

export function generatePmapAnnualCouponFlows(
  specInputs: PmapSpecInputs,
  purchaseAmount: number,
  annualCouponRatePct: number,
  description = 'PMAP'
): CashFlow[] {
  return generateCouponFlowsWithFrequency(
    specInputs,
    purchaseAmount,
    annualCouponRatePct,
    description,
    PMAP_COUPON_FREQUENCY_MONTHS
  )
}
