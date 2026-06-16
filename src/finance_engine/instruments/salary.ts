import { daysInMonthUtc, parseIsoDate, rollBusinessDay } from '../date_utils'
import type { SalaryInstrumentInput } from '../interfaces'
import type { CashFlow } from '../models'
import { CashFlowDirection } from '../models'
import { generateRecurringCashFlows } from '../recurring'
import { assertBoundedHorizon, createCashFlow, ensurePositiveAmount, incrementYearMonth, toIsoDate, validateDayOfMonth } from './common'

const DEFAULT_SALARY_TARGET_DAY = 10

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

  const targetDayOfMonth = input.customMonthlyRule?.targetDayOfMonth ?? DEFAULT_SALARY_TARGET_DAY
  validateDayOfMonth(targetDayOfMonth, 'Salary targetDayOfMonth')

  const businessDayConvention = input.customMonthlyRule?.businessDayConvention ?? 'preceding'
  const holidays = input.customMonthlyRule?.holidays ?? []
  const maxOccurrences = input.occurrences ?? Number.MAX_SAFE_INTEGER

  const generated: CashFlow[] = []
  let year = startDate.getUTCFullYear()
  let month = startDate.getUTCMonth()

  while (generated.length < maxOccurrences) {
    const monthDay = Math.min(targetDayOfMonth, daysInMonthUtc(year, month))
    const targetIso = toIsoDate(new Date(Date.UTC(year, month, monthDay)))
    const payoutIso = rollBusinessDay(targetIso, businessDayConvention, holidays)
    const payoutDate = parseIsoDate(payoutIso)

    if (payoutDate.getTime() >= startDate.getTime()) {
      if (endDate && payoutDate.getTime() > endDate.getTime()) {
        break
      }

      generated.push(
        createCashFlow(
          payoutIso,
          amount,
          CashFlowDirection.Inflow,
          input.category ?? 'salary',
          input.description
        )
      )
    }

    const next = incrementYearMonth(year, month)
    year = next.year
    month = next.month

    if (endDate) {
      const firstOfNextMonth = new Date(Date.UTC(year, month, 1))
      if (firstOfNextMonth.getTime() > endDate.getTime()) {
        break
      }
    }
  }

  return generated
}
