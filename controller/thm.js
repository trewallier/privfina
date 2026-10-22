/**
 * Browser dual-surface of the ADR 0022 monthly→Annex THM path used by
 * `calculateThmFromMonthlyRepayments` (src/finance_engine/instruments/thm.ts).
 * Keep aligned with TypeScript until bundler convergence (ADR 0017).
 */

function yearFractionEqualMonths(months) {
  if (!Number.isFinite(months) || months < 0) {
    throw new Error('Month count must be a non-negative finite number.')
  }
  return months / 12
}

function netDrawdownWithUpfrontCosts(drawdown, upfrontCosts) {
  if (!Number.isFinite(drawdown) || drawdown < 0) {
    throw new Error('Drawdown must be a non-negative finite number.')
  }
  if (!Number.isFinite(upfrontCosts) || upfrontCosts < 0) {
    throw new Error('Upfront costs must be a non-negative finite number.')
  }
  return drawdown - upfrontCosts
}

function roundThmPercent(percent) {
  if (!Number.isFinite(percent)) {
    throw new Error('THM percent must be finite.')
  }
  if (percent >= 0) {
    return Math.floor(percent * 10 + 0.5) / 10
  }
  return -Math.floor(-percent * 10 + 0.5) / 10
}

function thmPresentValue(rate, flows) {
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

function assertValidFlows(flows) {
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

function calculateThm(flows) {
  assertValidFlows(flows)

  const pv = (rate) => thmPresentValue(rate, flows)

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
    if (value > 0) {
      high = mid
    } else {
      low = mid
    }
  }

  const rate = mid
  return { rate, percentRounded: roundThmPercent(rate * 100) }
}

function buildThmFlowsFromMonthly(input) {
  const upfrontFees = input.upfrontFees ?? 0
  const net = netDrawdownWithUpfrontCosts(input.principal, upfrontFees)
  const flows = [{ yearFraction: 0, amount: net }]

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

function calculateThmFromMonthlyRepayments(input) {
  const flows = buildThmFlowsFromMonthly({
    principal: input.principal,
    upfrontFees: input.upfrontFees,
    monthlyOutflows: input.monthlyPayments.map((amount, index) => ({
      monthIndex: index + 1,
      amount
    }))
  })
  return calculateThm(flows)
}

function expandScheduleToMonthlyPayments(schedule) {
  const payments = []
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

export {
  yearFractionEqualMonths,
  netDrawdownWithUpfrontCosts,
  roundThmPercent,
  calculateThm,
  calculateThmFromMonthlyRepayments,
  expandScheduleToMonthlyPayments
}
