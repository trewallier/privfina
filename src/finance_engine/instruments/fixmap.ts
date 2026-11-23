/**
 * FixMÁP calculation primitives (ADR 0017 / 0038 / ROADMAP §6j).
 * Cash-flow schedule path reuses shared PMÁP annual generators (existing
 * schedule-usable contract). Accrued interest for ACT/ACT follows the ÁKK
 * Ismertető quarterly path (ga/n, n=4) — not the ISDA year-fraction helper.
 */

import type { CashFlow } from '../models'
import {
  derivePmapAccruedInterestAmount,
  derivePmapRateOutputs,
  generatePmapAnnualCouponFlows,
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

export function generateFixmapAnnualCouponFlows(
  specInputs: FixmapSpecInputs,
  purchaseAmount: number,
  annualCouponRatePct: number,
  description = 'FixMAP'
): CashFlow[] {
  return generatePmapAnnualCouponFlows(
    specInputs,
    purchaseAmount,
    annualCouponRatePct,
    description
  )
}
