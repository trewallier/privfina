/**
 * FixMÁP calculation primitives (ADR 0017 / 0038 / ROADMAP §6j).
 * Cash flows are quarterly (ÁKK negyedéves); accrued interest for ACT/ACT
 * follows the ÁKK Ismertető path (ga/n, n=4) — not the ISDA year-fraction helper.
 */

import type { CashFlow } from '../models'
import {
  derivePmapAccruedInterestAmount,
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
  annualCouponRatePct?: number
): number {
  if (isActActDayCountConvention(specInputs.dayCountConvention)) {
    const rate =
      annualCouponRatePct != null
        ? Number(annualCouponRatePct)
        : deriveFixmapRateOutputs(specInputs).annualCouponRatePct
    return accrueIsmertetoActActAmount({
      principal: Number(specInputs.principal),
      annualRatePct: rate,
      purchaseDate: String(specInputs.purchaseDate || ''),
      issueDate: String(specInputs.issueDate || ''),
      firstCouponDate: specInputs.firstCouponDate,
      frequencyMonths: FIXMAP_COUPON_FREQUENCY_MONTHS
    })
  }
  return derivePmapAccruedInterestAmount(specInputs, annualCouponRatePct)
}

/**
 * Prefer couponSchedule From dates after issue as the payment calendar when
 * their spacing matches quarterly frequency (commercial autofill merges
 * issue ∪ offering paymentDates). Annual rate-band Froms alone are not a
 * payment calendar — fall back to firstCouponDate + frequency walk.
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

export function generateFixmapAnnualCouponFlows(
  specInputs: FixmapSpecInputs,
  purchaseAmount: number,
  annualCouponRatePct: number,
  description = 'FixMAP'
): CashFlow[] {
  return generateCouponFlowsWithFrequency(
    specInputs,
    purchaseAmount,
    annualCouponRatePct,
    description,
    FIXMAP_COUPON_FREQUENCY_MONTHS,
    paymentDatesFromCouponSchedule(specInputs)
  )
}
