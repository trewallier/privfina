import { daysInMonthUtc, formatIsoDate, parseIsoDate, rollBusinessDay } from './date_utils'
import type {
  SalaryInstrumentInput,
  StatefulSimulationSpec,
  SubscriptionInstrumentInput,
  SimulationEvent,
  SimulationStep
} from './interfaces'
import type { CashFlow } from './models'
import { CashFlowDirection } from './models'
import { generateRecurringCashFlows } from './recurring'

function ensurePositiveAmount(amount: number): number {
  const normalized = Number(amount)
  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new Error('Amount must be a non-negative finite number.')
  }
  return normalized
}

function assertBoundedHorizon(endDate?: string, occurrences?: number): void {
  const hasEndDate = typeof endDate === 'string' && endDate.length > 0
  const hasOccurrences = typeof occurrences === 'number'

  if (!hasEndDate && !hasOccurrences) {
    throw new Error('Instrument generation requires endDate or occurrences to stay finite.')
  }

  if (hasOccurrences && (!Number.isInteger(occurrences) || (occurrences as number) <= 0)) {
    throw new Error('Occurrences must be a positive integer.')
  }
}

export function generateSalaryInstrumentCashFlows(input: SalaryInstrumentInput): CashFlow[] {
  const amount = ensurePositiveAmount(input.amount)
  const scheduleMode = input.scheduleMode ?? 'custom-monthly-working-day'
  assertBoundedHorizon(input.endDate, input.occurrences)

  if (scheduleMode === 'cron-like') {
    if (!input.cronPeriod) {
      throw new Error('Salary cron-like mode requires cronPeriod.')
    }

    return generateRecurringCashFlows({
      period: input.cronPeriod,
      startDate: input.startDate,
      endDate: input.endDate,
      occurrences: input.occurrences,
      amount,
      direction: CashFlowDirection.Inflow,
      category: input.category ?? 'salary',
      description: input.description
    })
  }

  const startDate = parseIsoDate(input.startDate)
  const endDate = input.endDate ? parseIsoDate(input.endDate) : undefined
  if (endDate && endDate.getTime() < startDate.getTime()) {
    throw new Error('endDate must be on or after startDate.')
  }

  const targetDayOfMonth = input.customMonthlyRule?.targetDayOfMonth ?? 10
  if (!Number.isInteger(targetDayOfMonth) || targetDayOfMonth < 1 || targetDayOfMonth > 31) {
    throw new Error('Salary targetDayOfMonth must be an integer between 1 and 31.')
  }

  const businessDayConvention = input.customMonthlyRule?.businessDayConvention ?? 'preceding'
  const holidays = input.customMonthlyRule?.holidays ?? []
  const maxOccurrences = input.occurrences ?? Number.MAX_SAFE_INTEGER

  const generated: CashFlow[] = []
  let year = startDate.getUTCFullYear()
  let month = startDate.getUTCMonth()

  while (generated.length < maxOccurrences) {
    const monthDay = Math.min(targetDayOfMonth, daysInMonthUtc(year, month))
    const targetIso = formatIsoDate(new Date(Date.UTC(year, month, monthDay)))
    const payoutIso = rollBusinessDay(targetIso, businessDayConvention, holidays)
    const payoutDate = parseIsoDate(payoutIso)

    if (payoutDate.getTime() >= startDate.getTime()) {
      if (endDate && payoutDate.getTime() > endDate.getTime()) {
        break
      }

      generated.push({
        date: payoutIso,
        amount,
        direction: CashFlowDirection.Inflow,
        category: input.category ?? 'salary',
        description: input.description
      })
    }

    month += 1
    if (month > 11) {
      month = 0
      year += 1
    }

    if (endDate) {
      const firstOfNextMonth = new Date(Date.UTC(year, month, 1))
      if (firstOfNextMonth.getTime() > endDate.getTime()) {
        break
      }
    }
  }

  return generated
}

export function generateSubscriptionInstrumentCashFlows(input: SubscriptionInstrumentInput): CashFlow[] {
  const amount = ensurePositiveAmount(input.amount)
  assertBoundedHorizon(input.endDate, input.occurrences)

  return generateRecurringCashFlows({
    period: input.period,
    startDate: input.startDate,
    endDate: input.endDate,
    occurrences: input.occurrences,
    amount,
    direction: CashFlowDirection.Outflow,
    category: input.category ?? 'subscription',
    description: input.description
  })
}

export interface StatefulSimulationResult<TState, TEvent extends SimulationEvent> {
  finalState: TState
  steps: Array<SimulationStep<TState, TEvent>>
}

export function runStatefulSimulation<TState, TEvent extends SimulationEvent>(
  spec: StatefulSimulationSpec<TState, TEvent>
): StatefulSimulationResult<TState, TEvent> {
  const sortedEvents = [...spec.events].sort((a, b) => a.date.localeCompare(b.date))
  let state = spec.initialState

  const steps: Array<SimulationStep<TState, TEvent>> = []
  for (const event of sortedEvents) {
    state = spec.transition(state, event)
    steps.push({
      event,
      state
    })
  }

  return {
    finalState: state,
    steps
  }
}

export interface LoanAmortizationStep {
  installmentIndex: number
  interestPortion: number
  principalPortion: number
  installmentAmount: number
  remainingPrincipal: number
}

export function calculateLoanMonthlyInstallment(
  principal: number,
  annualRate: number,
  termMonths: number
): number {
  if (!Number.isFinite(principal) || principal <= 0) {
    throw new Error('Principal must be a positive finite number.')
  }

  if (!Number.isInteger(termMonths) || termMonths <= 0) {
    throw new Error('Term months must be a positive integer.')
  }

  if (!Number.isFinite(annualRate) || annualRate < 0) {
    throw new Error('Annual rate must be a non-negative finite number.')
  }

  const monthlyRate = annualRate / 12
  if (monthlyRate === 0) {
    return principal / termMonths
  }

  const factor = Math.pow(1 + monthlyRate, termMonths)
  return (principal * monthlyRate * factor) / (factor - 1)
}

export function simulateLoanAmortization(
  principal: number,
  annualRate: number,
  termMonths: number
): LoanAmortizationStep[] {
  const installmentAmount = calculateLoanMonthlyInstallment(principal, annualRate, termMonths)
  const indices = Array.from({ length: termMonths }, (_, index) => index + 1)

  const simulation = runStatefulSimulation({
    initialState: {
      remainingPrincipal: principal,
      detail: undefined as LoanAmortizationStep | undefined
    },
    events: indices.map((index) => ({
      date: String(index).padStart(4, '0'),
      type: 'loan-installment',
      payload: {
        installmentIndex: index
      }
    })),
    transition: (state, event) => {
      const interestPortion = state.remainingPrincipal * (annualRate / 12)
      const principalPortion = Math.min(installmentAmount - interestPortion, state.remainingPrincipal)
      const remainingPrincipal = Math.max(0, state.remainingPrincipal - principalPortion)

      return {
        remainingPrincipal,
        detail: {
          installmentIndex: (event.payload as { installmentIndex: number }).installmentIndex,
          interestPortion,
          principalPortion,
          installmentAmount,
          remainingPrincipal
        }
      }
    }
  })

  return simulation.steps
    .map((step) => step.state.detail)
    .filter((detail): detail is LoanAmortizationStep => detail !== undefined)
}
