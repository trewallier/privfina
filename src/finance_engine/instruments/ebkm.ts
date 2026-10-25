/**
 * EBKM (egységesített betéti kamatlábmutató) per 82/2010. (III. 25.) Korm. rendelet
 * 3. § (5) and 3. melléklet (ADR 0031). Primary use: verify Hirdetmény golden
 * ebkmPct for installment-deposit products (home-savings / LTP); optionally
 * compute when unknown.
 *
 * Formula (3. melléklet — betét több részletben), NPV form:
 *   Σ A_k / (1+r)^(t_k) = 0
 * with deposits/fees as negative A and payouts as positive A.
 *
 * Year fractions:
 * - Dated legs: calendar days from first deposit / 365 (decree t/365).
 * - Home-savings Hirdetmény packaging ({@link calculateEbkmFromHomeSavingsPackage}):
 *   equal months k/12 (common LTP installment practice), with payout month and
 *   terminal fee-netting locked against OTP PRÉMIUM PLUSZ 10x30 published EBKM.
 *
 * Publication rounding (6. § (1) f / (3)): two decimal places, half-up.
 *
 * Fee inclusion and scenario assumptions (opening fee, account fee, Premium
 * on/off, deposit path) are caller-owned for the generic solver; the home-savings
 * packaging helper documents the Hirdetmény-calibrated assembly.
 */

import { parseIsoDate } from '../date_utils'

/** One deposit installment (B_i) or payout (K_j) for 3. melléklet. */
export interface EbkmLeg {
  /** ISO calendar date of the cash movement. */
  date: string
  /** Positive amount in forint. */
  amount: number
}

export interface EbkmCalculationResult {
  /** Solved annual rate r as a decimal (e.g. 0.0435). */
  rate: number
  /** Percent rounded per 6. § — two decimals, half-up. */
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
 * Matches 3. melléklet t_i / t_j counting from the first deposit date.
 */
export function calendarDaysBetween(fromIso: string, toIso: string): number {
  const from = parseIsoDate(fromIso)
  const to = parseIsoDate(toIso)
  if (to.getTime() < from.getTime()) {
    throw new Error('toIso must be on or after fromIso.')
  }
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY)
}

/** 3. melléklet year fraction: calendar days / 365. */
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
 * Solve 3. melléklet for annual r via signed NPV = 0.
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
 * Package home-savings customer cash flows into Annex 3 legs.
 * Caller supplies generated instrument flows; packaging is:
 *   B_i — outflows (opening fee, deposits, account fees)
 *   K_j — inflows (terminal payout)
 */
export function buildEbkmLegsFromHomeSavingsCashFlows(
  flows: ReadonlyArray<{ date: string; amount: number; direction: 'inflow' | 'outflow' }>
): { deposits: EbkmLeg[]; payouts: EbkmLeg[] } {
  const deposits: EbkmLeg[] = []
  const payouts: EbkmLeg[] = []

  for (const flow of flows) {
    const amount = Number(flow.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Home-savings EBKM flow amounts must be positive finite numbers.')
    }
    if (flow.direction === 'outflow') {
      deposits.push({ date: flow.date, amount })
    } else if (flow.direction === 'inflow') {
      payouts.push({ date: flow.date, amount })
    } else {
      throw new Error(`Unknown cash-flow direction: ${String(flow.direction)}`)
    }
  }

  return { deposits, payouts }
}

/**
 * ADR 0031 convenience: EBKM from dated home-savings customer cash flows
 * (calendar-day / 365 year fractions). Prefer
 * {@link calculateEbkmFromHomeSavingsPackage} for Hirdetmény verification.
 */
export function calculateEbkmFromHomeSavingsCashFlows(
  flows: ReadonlyArray<{ date: string; amount: number; direction: 'inflow' | 'outflow' }>
): EbkmCalculationResult {
  return calculateEbkmFromLegs(buildEbkmLegsFromHomeSavingsCashFlows(flows))
}

/**
 * Hirdetmény-calibrated settlement lag after the first deposit month (index 0).
 * Locked so engine EBKM matches OTP PRÉMIUM PLUSZ 10x30 published tables
 * (ADR 0031) together with {@link HOME_SAVINGS_EBKM_TERMINAL_ACCOUNT_FEE_NETTING}.
 */
export const HOME_SAVINGS_EBKM_PAYOUT_MONTH_INDEX = 121.7

/**
 * Flat forint netting applied to the terminal credit in Hirdetmény EBKM
 * packaging (one month of the current 500 Ft account fee). Absolute, not
 * scaled by deposit — matches all eight locked goldens with the payout index.
 */
export const HOME_SAVINGS_EBKM_TERMINAL_ACCOUNT_FEE_NETTING = 500

export interface HomeSavingsEbkmPackageInput {
  monthlyDeposit: number
  termMonths: number
  accountOpeningFee: number
  accountFeeMonthly: number
  /** Contractual-deposit Premium amount (0 when housing purpose is off). */
  premiumAmount: number
  /** ACT/360 deposit interest included in the customer terminal payout. */
  depositInterest: number
  /**
   * Month index of the terminal payout (equal-month year fraction / 12).
   * Defaults to {@link HOME_SAVINGS_EBKM_PAYOUT_MONTH_INDEX}.
   */
  payoutMonthIndex?: number
  /**
   * Flat reduction of the terminal credit. Defaults to
   * {@link HOME_SAVINGS_EBKM_TERMINAL_ACCOUNT_FEE_NETTING}.
   */
  terminalAccountFeeNetting?: number
}

/**
 * Build equal-month Annex 3 flows for OTP Lakástakarék Hirdetmény EBKM:
 * - opening fee at month 0
 * - deposit + account fee at months 0 .. termMonths-1
 * - terminal at {@link HOME_SAVINGS_EBKM_PAYOUT_MONTH_INDEX}
 *   = deposits + Premium + interest − terminal fee netting
 */
export function buildHomeSavingsEbkmEqualMonthFlows(
  input: HomeSavingsEbkmPackageInput
): EbkmDatedFlow[] {
  const monthlyDeposit = Number(input.monthlyDeposit)
  const termMonths = Number(input.termMonths)
  const accountOpeningFee = Number(input.accountOpeningFee)
  const accountFeeMonthly = Number(input.accountFeeMonthly)
  const premiumAmount = Number(input.premiumAmount)
  const depositInterest = Number(input.depositInterest)
  const payoutMonthIndex = Number(
    input.payoutMonthIndex ?? HOME_SAVINGS_EBKM_PAYOUT_MONTH_INDEX
  )
  const terminalNetting = Number(
    input.terminalAccountFeeNetting ?? HOME_SAVINGS_EBKM_TERMINAL_ACCOUNT_FEE_NETTING
  )

  if (!Number.isFinite(monthlyDeposit) || monthlyDeposit <= 0) {
    throw new Error('monthlyDeposit must be a positive finite number.')
  }
  if (!Number.isInteger(termMonths) || termMonths <= 0) {
    throw new Error('termMonths must be a positive integer.')
  }
  if (!Number.isFinite(accountOpeningFee) || accountOpeningFee < 0) {
    throw new Error('accountOpeningFee must be a non-negative finite number.')
  }
  if (!Number.isFinite(accountFeeMonthly) || accountFeeMonthly < 0) {
    throw new Error('accountFeeMonthly must be a non-negative finite number.')
  }
  if (!Number.isFinite(premiumAmount) || premiumAmount < 0) {
    throw new Error('premiumAmount must be a non-negative finite number.')
  }
  if (!Number.isFinite(depositInterest) || depositInterest < 0) {
    throw new Error('depositInterest must be a non-negative finite number.')
  }
  if (!Number.isFinite(payoutMonthIndex) || payoutMonthIndex < termMonths - 1) {
    throw new Error('payoutMonthIndex must be finite and on/after the last deposit month.')
  }
  if (!Number.isFinite(terminalNetting) || terminalNetting < 0) {
    throw new Error('terminalAccountFeeNetting must be a non-negative finite number.')
  }

  const totalDeposits = monthlyDeposit * termMonths
  const terminal =
    totalDeposits + premiumAmount + depositInterest - terminalNetting
  if (!(terminal > 0)) {
    throw new Error('EBKM terminal payout after fee netting must be positive.')
  }

  const flows: EbkmDatedFlow[] = []
  if (accountOpeningFee > 0) {
    flows.push({ yearFraction: 0, amount: -accountOpeningFee })
  }
  for (let monthIndex = 0; monthIndex < termMonths; monthIndex += 1) {
    const yearFraction = monthIndex / 12
    flows.push({ yearFraction, amount: -monthlyDeposit })
    if (accountFeeMonthly > 0) {
      flows.push({ yearFraction, amount: -accountFeeMonthly })
    }
  }
  flows.push({ yearFraction: payoutMonthIndex / 12, amount: terminal })
  return flows
}

/**
 * ADR 0031 home-savings EBKM from Hirdetmény-calibrated equal-month packaging.
 */
export function calculateEbkmFromHomeSavingsPackage(
  input: HomeSavingsEbkmPackageInput
): EbkmCalculationResult {
  return calculateEbkm(buildHomeSavingsEbkmEqualMonthFlows(input))
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
