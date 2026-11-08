/**
 * FixMÁP calculation primitives (ADR 0017 / 0038 / ROADMAP §6j).
 * Annual coupon + stepped schedule path reuses the shared PMÁP primitives
 * (same day-count / couponSchedule contract; no productCode forks).
 */

import type { CashFlow } from '../models'
import {
  derivePmapAccruedInterestAmount,
  derivePmapRateOutputs,
  generatePmapAnnualCouponFlows,
  type PmapRateOutputs,
  type PmapSpecInputs
} from './pmap'

export type FixmapSpecInputs = PmapSpecInputs
export type FixmapRateOutputs = PmapRateOutputs

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
    | 'dayCountConvention'
    | 'annualCouponRatePct'
    | 'couponSchedule'
  >,
  annualCouponRatePct?: number
): number {
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
