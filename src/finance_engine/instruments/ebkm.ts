/**
 * EBKM (unified deposit rate indicator / egységesített betéti kamatlábmutató)
 * per 82/2010. (III. 25.) Korm. rendelet 3. § (5) and 3. melléklet (ADR 0031).
 * Primary use: verify published tariff notice (Hirdetmény) golden ebkmPct for
 * installment-deposit products (home-savings / LTP); optionally compute when unknown.
 *
 * Formula (Annex 3 — deposit in installments), NPV form:
 *   Σ A_k / (1+r)^(t_k) = 0
 * with deposits/fees as negative A and payouts as positive A.
 *
 * Year fractions for dated legs: calendar days from first deposit / 365
 * (decree t/365). Publication rounding (6. § (1) f / (3)): two decimals, half-up.
 *
 * Home-savings EBKM packaging (General Terms and Conditions (ÁSZF) §22,
 * contracts from 2017-07-01): customer outflows (opening fee, deposits, account
 * fees) stay on schedule dates; the terminal inflow used for EBKM is dated on
 * the **first calendar day of the month that is three months after the
 * last-deposit month** (2-month allocation period after min. savings time, then
 * payment in the following month — conventional day-1 marker). Chart/schedule
 * cash flows use OTP-aligned maturity packaging (first of month after
 * lastDeposit+2) for the terminal; only the EBKM leg list retargets that inflow
 * to lastDepositMonth+3. Anchor the last-deposit month on deposit-labeled
 * outflows when descriptions are supplied. Do not invent free lag/netting knobs
 * beyond this ÁSZF-sourced rule (ADR 0024/0025 packaging-camouflage ban).
 *
 * Fee inclusion and Premium on/off remain caller-owned when assembling flows.
 */

import { formatIsoDate, parseIsoDate } from '../date_utils'

/** One deposit installment (B_i) or payout (K_j) for Annex 3 (3. melléklet). */
export interface EbkmLeg {
  /** ISO calendar date of the cash movement. */
  date: string
  /** Positive amount in forint. */
  amount: number
}

export interface EbkmCalculationResult {
  /** Solved annual rate r as a decimal (e.g. 0.0435). */
  rate: number
  /** Percent rounded per decree 6. § — two decimals, half-up. */
  percentRounded: number
}

export interface EbkmDatedFlow {
  /** Years (fraction) since first deposit; t/365. */
  yearFraction: number
  /**
   * Signed amount for the NPV form of Annex 3:
   * deposits/fees negative, payouts positive → solve Σ A / (1+r)^t = 0.
   */
  amount: number
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Calendar days from `fromIso` to `toIso` (same-day → 0).
 * Matches Annex 3 (3. melléklet) t_i / t_j counting from the first deposit date.
 */
export function calendarDaysBetween(fromIso: string, toIso: string): number {
  const from = parseIsoDate(fromIso)
  const to = parseIsoDate(toIso)
  if (to.getTime() < from.getTime()) {
    throw new Error('toIso must be on or after fromIso.')
  }
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY)
}

/** Annex 3 (3. melléklet) year fraction: calendar days / 365. */
export function ebkmYearFraction(fromIso: string, toIso: string): number {
  return calendarDaysBetween(fromIso, toIso) / 365
}

/**
 * 6. § (1) f: percent with two decimals; next digit ≥ 5 rounds away from zero
 * (symmetric half-up). Tiny epsilon absorbs binary float edges at *.xx5.
 */
export function roundEbkmPercent(percent: number): number {
  if (!Number.isFinite(percent)) {
    throw new Error('EBKM percent must be finite.')
  }
  if (percent === 0) {
    return 0
  }
  const sign = percent < 0 ? -1 : 1
  const hundredths = Math.abs(percent) * 100
  return (sign * Math.floor(hundredths + 0.5 + 1e-9)) / 100
}

/**
 * Build signed NPV flows from Annex 3 deposit and payout legs.
 * First deposit date is the earliest deposit leg date (t = 0).
 */
export function buildEbkmFlowsFromLegs(input: {
  deposits: readonly EbkmLeg[]
  payouts: readonly EbkmLeg[]
}): EbkmDatedFlow[] {
  if (!Array.isArray(input.deposits) || input.deposits.length === 0) {
    throw new Error('EBKM requires at least one deposit leg.')
  }
  if (!Array.isArray(input.payouts) || input.payouts.length === 0) {
    throw new Error('EBKM requires at least one payout leg.')
  }

  let firstDepositDate = input.deposits[0].date
  for (const leg of input.deposits) {
    assertPositiveLeg(leg, 'deposit')
    if (leg.date < firstDepositDate) {
      firstDepositDate = leg.date
    }
  }
  for (const leg of input.payouts) {
    assertPositiveLeg(leg, 'payout')
  }

  const flows: EbkmDatedFlow[] = []
  for (const leg of input.deposits) {
    flows.push({
      yearFraction: ebkmYearFraction(firstDepositDate, leg.date),
      amount: -leg.amount
    })
  }
  for (const leg of input.payouts) {
    flows.push({
      yearFraction: ebkmYearFraction(firstDepositDate, leg.date),
      amount: leg.amount
    })
  }
  return flows
}

export function ebkmPresentValue(rate: number, flows: readonly EbkmDatedFlow[]): number {
  if (!(rate > -1)) {
    throw new Error('Discount rate must be greater than -1.')
  }
  let total = 0
  for (const flow of flows) {
    if (!Number.isFinite(flow.yearFraction) || flow.yearFraction < 0) {
      throw new Error('Year fractions must be non-negative finite numbers.')
    }
    if (!Number.isFinite(flow.amount)) {
      throw new Error('Cash-flow amounts must be finite numbers.')
    }
    total += flow.amount / Math.pow(1 + rate, flow.yearFraction)
  }
  return total
}

/**
 * Solve Annex 3 (3. melléklet) for annual r via signed NPV = 0.
 */
export function calculateEbkm(flows: readonly EbkmDatedFlow[]): EbkmCalculationResult {
  assertValidEbkmFlows(flows)

  const pv = (rate: number) => ebkmPresentValue(rate, flows)

  let low = -0.999999
  let high = 1
  let pvLow = pv(low)
  let pvHigh = pv(high)

  for (let expand = 0; expand < 60 && pvLow * pvHigh > 0; expand += 1) {
    high = high * 2 + 1
    pvHigh = pv(high)
    if (high > 1e6) {
      break
    }
  }

  // Also expand downward toward -1 if still same sign (fee-heavy / negative EBKM).
  for (let expand = 0; expand < 40 && pvLow * pvHigh > 0; expand += 1) {
    low = (low - 1) / 2
    if (low <= -1) {
      low = -0.999999
      break
    }
    pvLow = pv(low)
  }

  if (pvLow * pvHigh > 0) {
    throw new Error('EBKM solver could not bracket a root for the given cash flows.')
  }

  let mid = 0
  for (let i = 0; i < 120; i += 1) {
    mid = (low + high) / 2
    const value = pv(mid)
    if (value === 0 || Math.abs(high - low) < 1e-15) {
      break
    }
    // Positive NPV (payouts dominate at this rate) → rate too low for deposits.
    if (value > 0) {
      low = mid
    } else {
      high = mid
    }
  }

  const rate = mid
  return { rate, percentRounded: roundEbkmPercent(rate * 100) }
}

/**
 * Convenience: solve Annex 3 from deposit and payout legs.
 */
export function calculateEbkmFromLegs(input: {
  deposits: readonly EbkmLeg[]
  payouts: readonly EbkmLeg[]
}): EbkmCalculationResult {
  return calculateEbkm(buildEbkmFlowsFromLegs(input))
}

/**
 * OTP General Terms and Conditions (ÁSZF) §22 (contracts from 2017-07-01):
 * earliest customer payout falls in the calendar month after min. savings time
 * + a 2-month allocation period (kiutalási időszak). For continuous monthly
 * deposits this is modeled as the **first calendar day** of the month three
 * months after the last-deposit month (conventional day-1 settlement marker
 * inside the payment month).
 *
 * Half-up residual: for the locked Hirdetmény examples (start `2026-10-10`,
 * last deposit `2036-09-10`), day-1 (`2036-12-01`) leaves promo-20k both legs
 * 0.01 off published. End-of-allocation (`2036-11-30`) keeps that same miss
 * pair; no single day marker closes both legs without reopening other cells.
 * Do **not** hunt a fitted settlement day — wait for an ÁSZF/OTP cite.
 */
export function resolveHomeSavingsEbkmPayoutDate(lastDepositDateIso: string): string {
  const lastDeposit = parseIsoDate(lastDepositDateIso)
  return formatIsoDate(
    new Date(Date.UTC(lastDeposit.getUTCFullYear(), lastDeposit.getUTCMonth() + 3, 1))
  )
}

/**
 * Package home-savings customer cash flows into Annex 3 legs.
 * Caller supplies generated instrument flows; packaging is:
 *   B_i — outflows (opening fee, deposits, account fees)
 *   K_j — inflows (terminal payout), retargeted to the ÁSZF EBKM payout date
 *          unless `retargetTerminalPayout` is false (tests / diagnostics).
 */
export function buildEbkmLegsFromHomeSavingsCashFlows(
  flows: ReadonlyArray<{
    date: string
    amount: number
    direction: 'inflow' | 'outflow'
    /** When present, "Monthly deposit" labels anchor ÁSZF last-deposit month. */
    description?: string
  }>,
  options: { retargetTerminalPayout?: boolean; lastDepositDate?: string } = {}
): { deposits: EbkmLeg[]; payouts: EbkmLeg[] } {
  const retargetTerminalPayout = options.retargetTerminalPayout !== false
  const deposits: EbkmLeg[] = []
  const payouts: EbkmLeg[] = []
  let lastDepositDate: string | null =
    typeof options.lastDepositDate === 'string' ? options.lastDepositDate : null
  let lastOutflowDate: string | null = null
  let sawDepositLabel = lastDepositDate !== null

  for (const flow of flows) {
    const amount = Number(flow.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Home-savings EBKM flow amounts must be positive finite numbers.')
    }
    if (flow.direction === 'outflow') {
      deposits.push({ date: flow.date, amount })
      if (lastOutflowDate === null || flow.date > lastOutflowDate) {
        lastOutflowDate = flow.date
      }
      if (
        typeof flow.description === 'string' &&
        /monthly deposit/i.test(flow.description)
      ) {
        sawDepositLabel = true
        if (lastDepositDate === null || flow.date > lastDepositDate) {
          lastDepositDate = flow.date
        }
      }
    } else if (flow.direction === 'inflow') {
      payouts.push({ date: flow.date, amount })
    } else {
      throw new Error(`Unknown cash-flow direction: ${String(flow.direction)}`)
    }
  }

  if (retargetTerminalPayout && payouts.length > 0) {
    if (payouts.length !== 1) {
      throw new Error(
        `EBKM payout retarget expects a single terminal inflow (got ${payouts.length}).`
      )
    }
    const anchor = sawDepositLabel ? lastDepositDate : lastOutflowDate
    if (anchor === null) {
      throw new Error(
        'EBKM payout retarget requires a last-deposit date (Monthly deposit label, lastDepositDate option, or outflow fallback).'
      )
    }
    payouts[0].date = resolveHomeSavingsEbkmPayoutDate(anchor)
  }

  return { deposits, payouts }
}

/**
 * ADR 0031 convenience: EBKM from dated home-savings customer cash flows
 * (calendar-day / 365). By default retargets terminal inflow to the ÁSZF
 * allocation (kiutalás) payout date; pass `{ retargetTerminalPayout: false }`
 * for schedule-date diagnostics.
 */
export function calculateEbkmFromHomeSavingsCashFlows(
  flows: ReadonlyArray<{
    date: string
    amount: number
    direction: 'inflow' | 'outflow'
    description?: string
  }>,
  options: { retargetTerminalPayout?: boolean; lastDepositDate?: string } = {}
): EbkmCalculationResult {
  return calculateEbkmFromLegs(buildEbkmLegsFromHomeSavingsCashFlows(flows, options))
}

function assertPositiveLeg(leg: EbkmLeg, kind: string): void {
  if (typeof leg.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(leg.date)) {
    throw new Error(`EBKM ${kind} leg requires an ISO date.`)
  }
  // Validate calendar date.
  parseIsoDate(leg.date)
  if (!Number.isFinite(leg.amount) || leg.amount <= 0) {
    throw new Error(`EBKM ${kind} amounts must be positive finite numbers.`)
  }
}

function assertValidEbkmFlows(flows: readonly EbkmDatedFlow[]): void {
  if (!Array.isArray(flows) || flows.length === 0) {
    throw new Error('EBKM requires at least one cash flow.')
  }

  let hasPositive = false
  let hasNegative = false
  for (const flow of flows) {
    if (!Number.isFinite(flow.yearFraction) || flow.yearFraction < 0) {
      throw new Error('Year fractions must be non-negative finite numbers.')
    }
    if (!Number.isFinite(flow.amount)) {
      throw new Error('Cash-flow amounts must be finite numbers.')
    }
    if (flow.amount > 0) hasPositive = true
    if (flow.amount < 0) hasNegative = true
  }

  if (!hasPositive || !hasNegative) {
    throw new Error('EBKM cash flows must include both deposits and payouts.')
  }
}
