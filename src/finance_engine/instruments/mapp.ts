/**
 * MÁP Plusz calculation primitives (ADR 0017 / 0038 / ROADMAP §6j).
 * Semi-annual coupon + stepped schedule path reuses shared day-count /
 * covering-period helpers (same contract as BMÁP/PMÁP; no productCode forks).
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
import { CashFlowDirection } from '../models'
import type { CashFlow } from '../models'

const SEMI_ANNUAL_MONTHS = 6

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

export function deriveMappRateOutputs(
  specInputs: Pick<MappSpecInputs, 'annualCouponRatePct' | 'couponSchedule' | 'purchaseDate' | 'issueDate'>
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

/**
 * Accrued interest from last coupon on/before purchase (or issueDate) to purchaseDate.
 */
export function deriveMappAccruedInterestAmount(
  specInputs: Pick<
    MappSpecInputs,
    | 'principal'
    | 'purchaseDate'
    | 'issueDate'
    | 'dayCountConvention'
    | 'annualCouponRatePct'
    | 'couponSchedule'
  >,
  annualCouponRatePct?: number
): number {
  const issueDateIso = requireIso(specInputs.issueDate, 'issueDate')
  const purchaseDateIso = requireIso(specInputs.purchaseDate, 'purchaseDate')
  const accrualStartIso = resolveAccrualStartIso({
    purchaseDate: purchaseDateIso,
    issueDate: issueDateIso,
    couponSchedule: specInputs.couponSchedule
  })
  if (purchaseDateIso < accrualStartIso) {
    throw new Error('purchaseDate must be on or after accrual start (prior coupon or issueDate).')
  }
  const rate =
    annualCouponRatePct != null
      ? ensureNonNegativeNumber(annualCouponRatePct, 'annualCouponRatePct')
      : deriveMappRateOutputs(specInputs).annualCouponRatePct
  const principal = ensureNonNegativeNumber(specInputs.principal, 'principal')
  return accrueInterestAmount({
    principal,
    annualRatePct: rate,
    fromIso: accrualStartIso,
    toIso: purchaseDateIso,
    dayCount: normalizeDayCountConvention(specInputs.dayCountConvention)
  })
}

export function generateMappSemiAnnualCouponFlows(
  specInputs: MappSpecInputs,
  purchaseAmount: number,
  annualCouponRatePct: number,
  description = 'MAPP'
): CashFlow[] {
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

  let couponDate = firstCouponDateIso
    ? parseIsoDate(firstCouponDateIso)
    : addMonthsUtc(parseIsoDate(issueDateIso), SEMI_ANNUAL_MONTHS)
  const maturityDate = parseIsoDate(maturityDateIso)

  while (couponDate.getTime() <= maturityDate.getTime()) {
    const couponIso = formatIsoDate(couponDate)
    if (couponIso >= purchaseDateIso) {
      const period = resolveCoveringCouponPeriod(schedule, couponIso)
      if (scheduleActive) {
        // With an explicit schedule: null rate OR missing covering period → skip (no invent).
        if (!period || period.rate == null || !Number.isFinite(Number(period.rate))) {
          couponDate = addMonthsUtc(couponDate, SEMI_ANNUAL_MONTHS)
          continue
        }
      } else if (period && (period.rate == null || !Number.isFinite(Number(period.rate)))) {
        couponDate = addMonthsUtc(couponDate, SEMI_ANNUAL_MONTHS)
        continue
      }
      const ratePct =
        period && period.rate != null && Number.isFinite(Number(period.rate))
          ? Number(period.rate)
          : annualCouponRatePct
      const couponAmount = (principal * ratePct) / 100 / 2
      flows.push(
        createCashFlow(couponIso, couponAmount, CashFlowDirection.Inflow, 'investment', description)
      )
    }
    couponDate = addMonthsUtc(couponDate, SEMI_ANNUAL_MONTHS)
  }

  flows.push(
    createCashFlow(maturityDateIso, principal, CashFlowDirection.Inflow, 'investment', description)
  )

  return sortCashFlowsByDate(flows)
}
