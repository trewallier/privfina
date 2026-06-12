import type { CashFlow } from './models'
import { CashFlowDirection } from './models'

export interface DateRange {
  startDate: string
  endDate: string
}

export interface CashFlowDefinition {
  expand(range: DateRange): CashFlow[]
  evaluate(
    range: DateRange,
    mode: 'expand' | 'aggregate' | 'npv',
    opts?: { discountRate?: number; baseDate?: string }
  ): number | CashFlow[]
}

export interface CalculationEngine {
  summarizeCashFlows(cashFlows: ReadonlyArray<CashFlow>): Array<{ period: string; total: number }>
}

export interface OneTimeCashFlowInput {
  date: string
  amount: number
  direction: CashFlowDirection
  category?: string
  description?: string
}

export interface RecurringCashFlowInput {
  period: string
  startDate: string
  endDate?: string
  occurrences?: number
  amount: number
  direction: CashFlowDirection
  category?: string
  description?: string
}

export interface CumulativePoint {
  date: string
  cumulativeTotal: number
}