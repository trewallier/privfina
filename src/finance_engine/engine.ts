import type { CashFlow } from './models'
import { CashFlowDirection } from './models'
import type { CalculationEngine, CumulativePoint, OneTimeCashFlowInput } from './interfaces'
import {
  generateSalaryInstrumentCashFlows,
  generateSubscriptionInstrumentCashFlows,
  runStatefulSimulation,
  calculateLoanMonthlyInstallment,
  simulateLoanAmortization
} from './instruments'

export type {
  DateRange,
  CashFlowDefinition,
  CalculationEngine,
  OneTimeCashFlowInput,
  RecurringCashFlowInput,
  CumulativePoint,
  BusinessDayConvention,
  SalaryCustomMonthlyRule,
  SalaryInstrumentInput,
  SubscriptionInstrumentInput,
  LoanInstrumentInput,
  InvestmentSubtype,
  InvestmentInstrumentInput,
  SimulationEvent,
  SimulationStep,
  StatefulSimulationSpec
} from './interfaces'
export { generateRecurringCashFlows, evaluateRecurring } from './recurring'
export {
  generateSalaryInstrumentCashFlows,
  generateSubscriptionInstrumentCashFlows,
  runStatefulSimulation,
  calculateLoanMonthlyInstallment,
  simulateLoanAmortization
} from './instruments'

function signedAmount(cashFlow: CashFlow): number {
  return cashFlow.direction === CashFlowDirection.Inflow ? cashFlow.amount : -cashFlow.amount
}

export function createOneTimeCashFlow(input: OneTimeCashFlowInput): CashFlow {
  const amount = Number(input.amount)
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('Amount must be a non-negative finite number.')
  }

  return {
    date: input.date,
    amount,
    direction: input.direction,
    category: input.category ?? 'general',
    description: input.description
  }
}

export function calculateCumulativeSeries(
  cashFlows: ReadonlyArray<CashFlow>,
  startDate: string,
  endDate: string
): CumulativePoint[] {
  const filteredAndSorted = [...cashFlows]
    .filter((cashFlow) => cashFlow.date >= startDate && cashFlow.date <= endDate)
    .sort((a, b) => a.date.localeCompare(b.date))

  const series: CumulativePoint[] = []
  let runningTotal = 0

  for (const cashFlow of filteredAndSorted) {
    runningTotal += signedAmount(cashFlow)
    series.push({
      date: cashFlow.date,
      cumulativeTotal: runningTotal
    })
  }

  return series
}

export function createCalculationEngine(): CalculationEngine {
  return {
    summarizeCashFlows: () => []
  }
}
