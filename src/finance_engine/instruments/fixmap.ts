/**
 * FixMÁP calculation primitives (ADR 0017 / 0038 / ROADMAP §6j).
 * Cash flows are quarterly (ÁKK negyedéves); accrued interest for ACT/ACT
 * follows the ÁKK Ismertető path (ga/n, n=4) — not the ISDA year-fraction helper.
 */

import type { CashFlow } from '../models'
import {
  accrueInterestAmount,
  normalizeDayCountConvention,
  resolvePaymentCalendarAccrualStartIso
} from './day_count'
import {
  derivePmapRateOutputs,
  generateCouponFlowsWithFrequency,
  type PmapRateOutputs,
  type PmapSpecInputs
} from './pmap'
import {
  accrueIsmertetoActActAmount,
  isActActDayCountConvention
} from './ismerteto_accrued'

export type FixmapSpecInputs = PmapSpecInputs
export type FixmapRateOutputs = PmapRateOutputs

/** FixMÁP pays quarterly — Ismertető ACT/ACT uses ga/n with n=4. */
export const FIXMAP_COUPON_FREQUENCY_MONTHS = 3

export function deriveFixmapRateOutputs(
  specInputs: Pick<
    FixmapSpecInputs,
    'annualCouponRatePct' | 'couponSchedule' | 'purchaseDate' | 'issueDate'
  >
): FixmapRateOutputs {
  return derivePmapRateOutputs(specInputs)
}

export function deriveFixmapAccruedInterestAmount(
  specInputs: Pick<
    FixmapSpecInputs,
    | 'principal'
    | 'purchaseDate'
    | 'issueDate'
    | 'firstCouponDate'
    | 'dayCountConvention'
    | 'annualCouponRatePct'
    | 'couponSchedule'
  >,
  annualCouponRatePct?: number,
  /** Optional offering payment calendar; preferred over schedule-gap heuristic. */
  paymentDates?: readonly string[] | null
): number {
  const rate =
    annualCouponRatePct != null
      ? Number(annualCouponRatePct)
      : deriveFixmapRateOutputs(specInputs).annualCouponRatePct
  const principal = Number(specInputs.principal)
  const purchaseDateIso = String(specInputs.purchaseDate || '').trim()
  const issueDateIso = String(specInputs.issueDate || '').trim()

  if (isActActDayCountConvention(specInputs.dayCountConvention)) {
    return accrueIsmertetoActActAmount({
      principal,
      annualRatePct: rate,
      purchaseDate: purchaseDateIso,
      issueDate: issueDateIso,
      firstCouponDate: specInputs.firstCouponDate,
      frequencyMonths: FIXMAP_COUPON_FREQUENCY_MONTHS
    })
  }

  // ACT/360 (etc.): accrue from last quarterly payment, not annual rate-band Froms
  // in couponSchedule (those are ga validity windows, not payment dates).
  const explicit =
    Array.isArray(paymentDates) && paymentDates.length > 0
      ? paymentDates
      : paymentDatesFromCouponSchedule(specInputs as FixmapSpecInputs)
  const accrualStartIso = resolvePaymentCalendarAccrualStartIso({
    purchaseDate: purchaseDateIso,
    issueDate: issueDateIso,
    paymentDates: explicit,
    firstCouponDate: specInputs.firstCouponDate,
    frequencyMonths: FIXMAP_COUPON_FREQUENCY_MONTHS
  })
  if (purchaseDateIso < accrualStartIso) {
    throw new Error('purchaseDate must be on or after accrual start (prior coupon or issueDate).')
  }
  if (purchaseDateIso === accrualStartIso) return 0
  return accrueInterestAmount({
    principal,
    annualRatePct: rate,
    fromIso: accrualStartIso,
    toIso: purchaseDateIso,
    dayCount: normalizeDayCountConvention(specInputs.dayCountConvention)
  })
}

/**
 * Prefer couponSchedule From dates after issue as the payment calendar when
 * their spacing matches quarterly frequency (commercial autofill merges
 * issue ∪ offering paymentDates). Annual rate-band Froms alone are not a
 * payment calendar — fall back to firstCouponDate + frequency walk.
 *
 * Prefer an explicit `paymentDates` argument when the commercial schedule is
 * offering-shaped; this median-gap heuristic can misclassify irregular stubs.
 */
function paymentDatesFromCouponSchedule(specInputs: FixmapSpecInputs): string[] | null {
  const issue = String(specInputs.issueDate || '').trim()
  const schedule = Array.isArray(specInputs.couponSchedule) ? specInputs.couponSchedule : []
  const payments = schedule
    .map((row) => String(row?.from || '').trim())
    .filter((iso) => /^\d{4}-\d{2}-\d{2}$/.test(iso))
    .filter((iso) => !issue || iso > issue)
    .sort()
  if (payments.length === 0) return null
  if (payments.length === 1) return payments
  const gapsMonths: number[] = []
  for (let i = 1; i < payments.length; i += 1) {
    const prev = new Date(`${payments[i - 1]}T00:00:00Z`)
    const next = new Date(`${payments[i]}T00:00:00Z`)
    const days = (next.getTime() - prev.getTime()) / 86400000
    if (days > 0) gapsMonths.push(days / 30.4375)
  }
  if (!gapsMonths.length) return null
  gapsMonths.sort((a, b) => a - b)
  const median = gapsMonths[Math.floor(gapsMonths.length / 2)]!
  // Closer to quarterly than annual → treat as offering payment calendar.
  if (Math.abs(median - FIXMAP_COUPON_FREQUENCY_MONTHS) < Math.abs(median - 12)) {
    return payments
  }
  return null
}

export function generateFixmapQuarterlyCouponFlows(
  specInputs: FixmapSpecInputs,
  purchaseAmount: number,
  annualCouponRatePct: number,
  description = 'FixMAP',
  /**
   * Optional offering payment calendar (ISO). When set, skips the schedule-gap
   * heuristic. Period 1 still starts on issueDate for accrual; payments are
   * dates strictly after issue (and strictly after purchase).
   */
  paymentDates?: readonly string[] | null
): CashFlow[] {
  const explicit =
    Array.isArray(paymentDates) && paymentDates.length > 0
      ? paymentDates
      : paymentDatesFromCouponSchedule(specInputs)
  return generateCouponFlowsWithFrequency(
    specInputs,
    purchaseAmount,
    annualCouponRatePct,
    description,
    FIXMAP_COUPON_FREQUENCY_MONTHS,
    explicit
  )
}

/** @deprecated Use {@link generateFixmapQuarterlyCouponFlows} — FixMÁP is quarterly. */
export const generateFixmapAnnualCouponFlows = generateFixmapQuarterlyCouponFlows
