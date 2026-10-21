/**
 * Fee-inclusive THM (APR) approximation for mortgage-loan products (ADR 0021).
 *
 * Model: monthly IRR of the cash-flow series where the borrower receives net
 * proceeds at t=0 and pays scheduled installments (and any remaining upfront
 * costs treated as t=0 outflows). Annualized as ((1 + r_month)^12 - 1) * 100.
 */

export interface ThmCashFlow {
  /** Month index from disbursement (0 = start). */
  monthIndex: number
  /** Signed amount from the borrower's perspective: +inflow (proceeds), -outflow (payments/fees). */
  amount: number
}

export interface ThmComputationInput {
  /** Principal disbursed to the borrower (gross). */
  principal: number
  /** Upfront credit-cost fees paid by the borrower (reduce net proceeds). */
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

function npv(monthlyRate: number, flows: readonly ThmCashFlow[]): number {
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

  const netProceeds = principal - upfrontFees
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
 * Solve for the monthly rate where NPV of borrower flows is ~0, then annualize.
 */
export function computeThmPct(input: ThmComputationInput): ThmComputationResult {
  const flows = buildBorrowerFlows(input)
  const netProceeds = flows[0].amount
  const paymentCount = input.monthlyPayments.length

  if (paymentCount === 0) {
    throw new Error('THM requires at least one monthly payment.')
  }

  // If fees consume the entire principal, THM is undefined / infinite — clamp high.
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

  // At low rates NPV is negative (undiscounted payments exceed principal);
  // at high rates discounted payments shrink and NPV turns positive.
  for (let i = 0; i < 80; i += 1) {
    mid = (low + high) / 2
    const value = npv(mid, flows)
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
