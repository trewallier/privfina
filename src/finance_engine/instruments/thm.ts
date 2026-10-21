/**
 * THM (teljes hiteldíj mutató) per 83/2010. (III. 25.) Korm. rendelet
 * 5. § and 1. melléklet (ADR 0022). Primary use: verify Hirdetmény golden
 * thmPct during loan-product implementation; optionally compute when unknown.
 *
 * Fee inclusion (§3) and scenario assumptions (§4) are caller-owned: this
 * module solves the Annex equation for a supplied cash-flow set.
 *
 * The monthly convenience API ({@link computeThmPct}) from ADR 0021 remains
 * for mortgage engine-lane packaging and matches the Annex solution when year
 * fractions are equal months (k/12).
 */

import { parseIsoDate } from '../date_utils'

/** Signed cash flow for the Annex equation: + to borrower, − from borrower. */
export interface ThmFlow {
  /** Years (or fraction) since first disbursement; t1 = 0. */
  yearFraction: number
  amount: number
}

export interface ThmCalculationResult {
  /** Solved annual rate X as a decimal (e.g. 0.086). */
  rate: number
  /** Percent rounded per 5. § (2) e (at least one decimal, half-up). */
  percentRounded: number
}

/** @deprecated Prefer {@link ThmFlow}; kept for ADR 0021 monthly packaging. */
export interface ThmCashFlow {
  /** Month index from disbursement (0 = start). */
  monthIndex: number
  /** Signed amount from the borrower's perspective: +inflow, −outflow. */
  amount: number
}

export interface ThmComputationInput {
  /** Principal disbursed to the borrower (gross). */
  principal: number
  /** Upfront credit-cost fees paid by the borrower (reduce net proceeds / C_k). */
  upfrontFees: number
  /** Level or sequenced monthly repayment amounts in order from month 1. */
  monthlyPayments: readonly number[]
}

export interface ThmComputationResult {
  thmPct: number
  monthlyRate: number
  netProceeds: number
  paymentCount: number
}

/** 5. § (2) d: twelve equal months of 30.41666 days → months/12 years. */
export function yearFractionEqualMonths(months: number): number {
  if (!Number.isFinite(months) || months < 0) {
    throw new Error('Month count must be a non-negative finite number.')
  }
  return months / 12
}

/**
 * Calendar-day count excluding the first day and including the last
 * (5. § (3) a–b), then divide by 365 or 366 looking back one year from `to`
 * (5. § (3) c). Suitable for residual day spans; callers combine with whole
 * months/weeks/years when needed.
 */
export function yearFractionActualDays(fromIso: string, toIso: string): number {
  const from = parseIsoDate(fromIso)
  const to = parseIsoDate(toIso)
  if (to.getTime() < from.getTime()) {
    throw new Error('toIso must be on or after fromIso.')
  }

  const msPerDay = 24 * 60 * 60 * 1000
  // Exclude first day, include last ≡ UTC date difference in whole days.
  const dayCount = Math.round((to.getTime() - from.getTime()) / msPerDay)
  if (dayCount === 0) {
    return 0
  }

  const priorYearSameDay = new Date(
    Date.UTC(to.getUTCFullYear() - 1, to.getUTCMonth(), to.getUTCDate())
  )
  const daysInLookbackYear = Math.round((to.getTime() - priorYearSameDay.getTime()) / msPerDay)

  return dayCount / daysInLookbackYear
}

/**
 * Annex: C_k is the drawdown reduced by costs payable up to first disbursement.
 */
export function netDrawdownWithUpfrontCosts(drawdown: number, upfrontCosts: number): number {
  if (!Number.isFinite(drawdown) || drawdown < 0) {
    throw new Error('Drawdown must be a non-negative finite number.')
  }
  if (!Number.isFinite(upfrontCosts) || upfrontCosts < 0) {
    throw new Error('Upfront costs must be a non-negative finite number.')
  }
  return drawdown - upfrontCosts
}

/**
 * 5. § (2) e: percent with at least one decimal; next digit ≥ 5 rounds up.
 */
export function roundThmPercent(percent: number): number {
  if (!Number.isFinite(percent)) {
    throw new Error('THM percent must be finite.')
  }
  // Half-up for non-negative values (THM is an annual percentage rate ≥ 0 in practice;
  // still defined for negative experimental rates).
  if (percent >= 0) {
    return Math.floor(percent * 10 + 0.5) / 10
  }
  return -Math.floor(-percent * 10 + 0.5) / 10
}

export function thmPresentValue(rate: number, flows: readonly ThmFlow[]): number {
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

function assertValidFlows(flows: readonly ThmFlow[]): void {
  if (!Array.isArray(flows) || flows.length === 0) {
    throw new Error('THM requires at least one cash flow.')
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
    throw new Error('THM cash flows must include both borrower inflows and outflows.')
  }
}

/**
 * Solve 1. melléklet for annual X: Σ A_i / (1+X)^t_i = 0.
 */
export function calculateThm(flows: readonly ThmFlow[]): ThmCalculationResult {
  assertValidFlows(flows)

  const pv = (rate: number) => thmPresentValue(rate, flows)

  // At X → -1+, discounted distant outflows dominate → typically negative PV for
  // +drawdown/−repayments. Bracket a sign change for the root.
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

  if (pvLow * pvHigh > 0) {
    throw new Error('THM solver could not bracket a root for the given cash flows.')
  }

  let mid = 0
  for (let i = 0; i < 100; i += 1) {
    mid = (low + high) / 2
    const value = pv(mid)
    if (value === 0 || Math.abs(high - low) < 1e-15) {
      break
    }
    // Mirror monthly bisection orientation used by computeThmPct:
    // positive PV → rate too high (discount outflows less relative to drawdown).
    if (value > 0) {
      high = mid
    } else {
      low = mid
    }
  }

  const rate = mid
  const percentRounded = roundThmPercent(rate * 100)

  return { rate, percentRounded }
}

function npvMonthly(monthlyRate: number, flows: readonly ThmCashFlow[]): number {
  let total = 0
  for (const flow of flows) {
    total += flow.amount / Math.pow(1 + monthlyRate, flow.monthIndex)
  }
  return total
}

function buildBorrowerFlows(input: ThmComputationInput): ThmCashFlow[] {
  const principal = Number(input.principal)
  const upfrontFees = Number(input.upfrontFees)
  if (!Number.isFinite(principal) || principal <= 0) {
    throw new Error('THM principal must be a positive finite number.')
  }
  if (!Number.isFinite(upfrontFees) || upfrontFees < 0) {
    throw new Error('THM upfrontFees must be a non-negative finite number.')
  }

  const netProceeds = netDrawdownWithUpfrontCosts(principal, upfrontFees)
  const flows: ThmCashFlow[] = [{ monthIndex: 0, amount: netProceeds }]

  input.monthlyPayments.forEach((payment, index) => {
    const amount = Number(payment)
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error('THM monthly payments must be non-negative finite numbers.')
    }
    flows.push({ monthIndex: index + 1, amount: -amount })
  })

  return flows
}

/**
 * Mortgage packaging helper (ADR 0021): monthly IRR annualized as EAR.
 * Equivalent to {@link calculateThm} with year fractions k/12 for the same flows.
 */
export function computeThmPct(input: ThmComputationInput): ThmComputationResult {
  const flows = buildBorrowerFlows(input)
  const netProceeds = flows[0].amount
  const paymentCount = input.monthlyPayments.length

  if (paymentCount === 0) {
    throw new Error('THM requires at least one monthly payment.')
  }

  if (netProceeds <= 0) {
    return {
      thmPct: Number.POSITIVE_INFINITY,
      monthlyRate: Number.POSITIVE_INFINITY,
      netProceeds,
      paymentCount
    }
  }

  let low = -0.999
  let high = 10
  let mid = 0

  for (let i = 0; i < 80; i += 1) {
    mid = (low + high) / 2
    const value = npvMonthly(mid, flows)
    if (value > 0) {
      high = mid
    } else {
      low = mid
    }
  }

  const monthlyRate = mid
  const thmPct = (Math.pow(1 + monthlyRate, 12) - 1) * 100

  return {
    thmPct,
    monthlyRate,
    netProceeds,
    paymentCount
  }
}

/**
 * Expand a resolved loan schedule (optional grace interest-only, then level annuity)
 * into the monthly payment vector expected by {@link computeThmPct}.
 */
export function expandScheduleToMonthlyPayments(schedule: {
  gracePeriodMonths: number
  capitalizeInterestAtGraceEnd: boolean
  graceInterestOnlyPayment: number
  monthlyInstallment: number
  amortizationMonths: number
}): number[] {
  const payments: number[] = []
  if (schedule.gracePeriodMonths > 0 && !schedule.capitalizeInterestAtGraceEnd) {
    for (let i = 0; i < schedule.gracePeriodMonths; i += 1) {
      payments.push(schedule.graceInterestOnlyPayment)
    }
  }
  for (let i = 0; i < schedule.amortizationMonths; i += 1) {
    payments.push(schedule.monthlyInstallment)
  }
  return payments
}

/**
 * Build Annex {@link ThmFlow}s from a gross drawdown, upfront costs (netted into C_1),
 * and month-indexed repayments/fees (month 0 = disbursement).
 */
export function buildThmFlowsFromMonthly(input: {
  principal: number
  upfrontFees?: number
  /** Month index → payment amount (borrower outflow). Month 0 fees beyond upfront netting go here. */
  monthlyOutflows: ReadonlyArray<{ monthIndex: number; amount: number }>
}): ThmFlow[] {
  const upfrontFees = input.upfrontFees ?? 0
  const net = netDrawdownWithUpfrontCosts(input.principal, upfrontFees)
  const flows: ThmFlow[] = [{ yearFraction: 0, amount: net }]

  for (const outflow of input.monthlyOutflows) {
    if (!Number.isInteger(outflow.monthIndex) || outflow.monthIndex < 0) {
      throw new Error('monthIndex must be a non-negative integer.')
    }
    const amount = Number(outflow.amount)
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error('Outflow amounts must be non-negative finite numbers.')
    }
    if (amount === 0) continue
    flows.push({
      yearFraction: yearFractionEqualMonths(outflow.monthIndex),
      amount: -amount
    })
  }

  return flows
}
