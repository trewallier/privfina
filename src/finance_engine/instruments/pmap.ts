/**
 * Reusable PMÁP calculation primitives (ADR 0017 / 0038).
 */

import { formatIsoDate, parseIsoDate } from '../date_utils'
import { createCashFlow, sortCashFlowsByDate } from './common'
import {
  accrueInterestAmount,
  normalizeDayCountConvention,
  resolveCouponRatePct,
  type CouponSchedulePeriod,
  type DayCountConvention
} from './day_count'
import { CashFlowDirection } from '../models'
import type { CashFlow } from '../models'

export type PmapRateOutputs = {
  annualCouponRatePct: number
}

export type PmapSpecInputs = {
  principal: number
  annualCouponRatePct: number
  purchaseDate: string
  issueDate: string
  maturityDate: string
  startDate?: string
  firstCouponDate?: string
  dayCountConvention?: DayCountConvention | string
  couponSchedule?: CouponSchedulePeriod[]
}

function addYearsUtc(date: Date, years: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear() + years, date.getUTCMonth(), date.getUTCDate()))
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
    | 'startDate'
    | 'purchaseDate'
    | 'issueDate'
    | 'dayCountConvention'
    | 'annualCouponRatePct'
    | 'couponSchedule'
  >,
  annualCouponRatePct?: number
): number {
  const issueDateIso = requireIso(specInputs.issueDate, 'issueDate')
  const startDateIso = String(specInputs.startDate || '').trim() || issueDateIso
  const purchaseDateIso = requireIso(specInputs.purchaseDate, 'purchaseDate')
  const accrualStartIso = issueDateIso || startDateIso
  if (purchaseDateIso < accrualStartIso) {
    throw new Error('purchaseDate must be on or after startDate or issueDate.')
  }
  const rate =
    annualCouponRatePct != null
      ? ensureNonNegativeNumber(annualCouponRatePct, 'annualCouponRatePct')
      : derivePmapRateOutputs(specInputs).annualCouponRatePct
  const principal = ensureNonNegativeNumber(specInputs.principal, 'principal')
  return accrueInterestAmount({
    principal,
    annualRatePct: rate,
    fromIso: accrualStartIso,
    toIso: purchaseDateIso,
    dayCount: normalizeDayCountConvention(specInputs.dayCountConvention)
  })
}

export function generatePmapAnnualCouponFlows(
  specInputs: PmapSpecInputs,
  purchaseAmount: number,
  annualCouponRatePct: number,
  description = 'PMAP'
): CashFlow[] {
  const issueDateIso = requireIso(specInputs.issueDate, 'issueDate')
  const startDateIso = String(specInputs.startDate || '').trim() || issueDateIso
  const maturityDateIso = requireIso(specInputs.maturityDate, 'maturityDate')
  const purchaseDateIso = requireIso(specInputs.purchaseDate, 'purchaseDate')
  const firstCouponDateIso =
    typeof specInputs.firstCouponDate === 'string' ? String(specInputs.firstCouponDate).trim() : ''
  const principal = ensureNonNegativeNumber(specInputs.principal, 'principal')
  const schedule = Array.isArray(specInputs.couponSchedule) ? specInputs.couponSchedule : []

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
    : addYearsUtc(parseIsoDate(startDateIso), 1)
  const maturityDate = parseIsoDate(maturityDateIso)

  while (couponDate.getTime() <= maturityDate.getTime()) {
    const couponIso = formatIsoDate(couponDate)
    if (couponIso >= purchaseDateIso) {
      const period = schedule.find((row) => {
        if (!row?.from) return false
        if (row.from > couponIso) return false
        if (row.to != null && row.to !== '' && row.to < couponIso) return false
        return true
      })
      if (period && (period.rate == null || !Number.isFinite(Number(period.rate)))) {
        couponDate = addYearsUtc(couponDate, 1)
        continue
      }
      const ratePct =
        period && period.rate != null && Number.isFinite(Number(period.rate))
          ? Number(period.rate)
          : annualCouponRatePct
      const couponAmount = (principal * ratePct) / 100
      flows.push(
        createCashFlow(couponIso, couponAmount, CashFlowDirection.Inflow, 'investment', description)
      )
    }
    couponDate = addYearsUtc(couponDate, 1)
  }

  flows.push(
    createCashFlow(maturityDateIso, principal, CashFlowDirection.Inflow, 'investment', description)
  )

  return sortCashFlowsByDate(flows)
}
