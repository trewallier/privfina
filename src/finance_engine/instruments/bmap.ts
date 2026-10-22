/**
 * Reusable BMAP calculation primitives (ADR 0017 — TypeScript owns new math).
 * Browser dual-surface: `public/controller/bmap-calculation-adapter.js` until bundler.
 */

import { formatIsoDate, parseIsoDate } from '../date_utils'
import { createCashFlow, sortCashFlowsByDate } from './common'
import { CashFlowDirection } from '../models'
import type { CashFlow } from '../models'

const MILLIS_PER_DAY = 24 * 60 * 60 * 1000
const ACT_360_DAY_COUNT = 360
const BMAP_TERM_YEARS = 6
const QUARTER_MONTHS = 3

export type BmapRateOutputs = {
  effectiveDkjBaseYieldPct: number
  annualCouponRatePct: number
  couponPaymentFrequency: 'quarterly'
  periodCouponRatePct: number
}

export type BmapSpecInputs = {
  principal: number
  dkjBaseYieldPct: number
  interestPremiumPct: number
  startDate: string
  purchaseDate?: string
  issueDate?: string
  firstCouponDate?: string
}

function addMonthsUtc(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()))
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

export function deriveBmapMaturityDate(startDateIso: string): string {
  return formatIsoDate(addYearsUtc(parseIsoDate(startDateIso), BMAP_TERM_YEARS))
}

export function deriveBmapRateOutputs(specInputs: Pick<BmapSpecInputs, 'dkjBaseYieldPct' | 'interestPremiumPct'>): BmapRateOutputs {
  const dkjBaseYieldPct = ensureFiniteNumber(specInputs.dkjBaseYieldPct, 'dkjBaseYieldPct')
  const effectiveDkjBaseYieldPct = Math.max(dkjBaseYieldPct, 0)
  const interestPremiumPct = ensureNonNegativeNumber(specInputs.interestPremiumPct, 'interestPremiumPct')
  const annualCouponRatePct = effectiveDkjBaseYieldPct + interestPremiumPct

  return {
    effectiveDkjBaseYieldPct,
    annualCouponRatePct,
    couponPaymentFrequency: 'quarterly',
    periodCouponRatePct: annualCouponRatePct / 4
  }
}

/**
 * ACT/360 accrued interest from accrual start (issueDate or startDate) to purchaseDate.
 * Returns 0 when purchaseDate is omitted.
 */
export function deriveBmapAccruedInterestAmount(
  specInputs: Pick<BmapSpecInputs, 'principal' | 'startDate' | 'purchaseDate' | 'issueDate'>,
  annualCouponRatePct: number
): number {
  const startDateIso = String(specInputs.startDate || '').trim()
  const purchaseDateIso =
    typeof specInputs.purchaseDate === 'string' ? String(specInputs.purchaseDate).trim() : ''

  if (!purchaseDateIso) {
    return 0
  }

  const issueDateRaw = typeof specInputs.issueDate === 'string' ? String(specInputs.issueDate).trim() : ''
  const accrualStartIso = issueDateRaw || startDateIso
  if (purchaseDateIso < accrualStartIso) {
    throw new Error('purchaseDate must be on or after startDate or issueDate.')
  }

  const principal = ensureNonNegativeNumber(specInputs.principal, 'principal')
  const days = Math.floor(
    (parseIsoDate(purchaseDateIso).getTime() - parseIsoDate(accrualStartIso).getTime()) / MILLIS_PER_DAY
  )
  return (principal * annualCouponRatePct * days) / (100 * ACT_360_DAY_COUNT)
}

export function generateBmapQuarterlyCouponFlows(
  specInputs: BmapSpecInputs,
  purchaseAmount: number,
  annualCouponRatePct: number,
  description = 'BMAP'
): CashFlow[] {
  const startDateIso = String(specInputs.startDate || '').trim()
  const maturityDateIso = deriveBmapMaturityDate(startDateIso)
  const purchaseDateIso =
    typeof specInputs.purchaseDate === 'string' ? String(specInputs.purchaseDate).trim() : ''
  const firstCouponDateIso =
    typeof specInputs.firstCouponDate === 'string' ? String(specInputs.firstCouponDate).trim() : ''
  const principal = ensureNonNegativeNumber(specInputs.principal, 'principal')
  const couponAmount = (principal * annualCouponRatePct) / 100 / 4

  const flows: CashFlow[] = [
    createCashFlow(
      purchaseDateIso || startDateIso,
      purchaseAmount,
      CashFlowDirection.Outflow,
      'investment',
      description
    )
  ]

  let couponDate = firstCouponDateIso
    ? parseIsoDate(firstCouponDateIso)
    : addMonthsUtc(parseIsoDate(startDateIso), QUARTER_MONTHS)
  const maturityDate = parseIsoDate(maturityDateIso)
  const purchaseOrStart = purchaseDateIso || startDateIso

  while (couponDate.getTime() <= maturityDate.getTime()) {
    const couponIso = formatIsoDate(couponDate)
    if (couponIso >= purchaseOrStart) {
      flows.push(
        createCashFlow(couponIso, couponAmount, CashFlowDirection.Inflow, 'investment', description)
      )
    }
    couponDate = addMonthsUtc(couponDate, QUARTER_MONTHS)
  }

  flows.push(
    createCashFlow(maturityDateIso, principal, CashFlowDirection.Inflow, 'investment', description)
  )

  return sortCashFlowsByDate(flows)
}
