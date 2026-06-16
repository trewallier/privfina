import type { SubscriptionInstrumentInput } from '../interfaces'
import type { CashFlow } from '../models'
import { CashFlowDirection } from '../models'
import { generateRecurringCashFlows } from '../recurring'
import { assertBoundedHorizon, ensurePositiveAmount } from './common'

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
