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

export type BusinessDayConvention =
  | 'unadjusted'
  | 'following'
  | 'preceding'
  | 'modified-following'
  | 'modified-preceding'

export interface SalaryCustomMonthlyRule {
  targetDayOfMonth?: number
  businessDayConvention?: BusinessDayConvention
  holidays?: string[]
}

export interface SalaryInstrumentInput {
  startDate: string
  endDate?: string
  occurrences?: number
  amount: number
  category?: string
  description?: string
  scheduleMode?: 'custom-monthly-working-day' | 'cron-like'
  cronPeriod?: string
  customMonthlyRule?: SalaryCustomMonthlyRule
}

export interface SubscriptionInstrumentInput {
  period: string
  startDate: string
  endDate?: string
  occurrences?: number
  amount: number
  category?: string
  description?: string
}

export interface LoanInstrumentInput {
  principal: number
  annualRate: number
  termMonths: number
  startDate: string
  repaymentDayOfMonth: number
  /**
   * Optional months at the start of the term before amortizing repayments begin.
   * Defaults to 0 (no grace). Must be less than termMonths when set.
   */
  gracePeriodMonths?: number
  /**
   * When true with a positive grace period, unpaid grace interest is capitalized onto
   * principal at the end of the grace period (no cash outflows during grace).
   * When false with a positive grace period, interest-only payments are due during grace.
   * Ignored when gracePeriodMonths is 0.
   */
  capitalizeInterestAtGraceEnd?: boolean
  includeDisbursement?: boolean
  category?: string
  description?: string
}

export type InvestmentSubtype =
  | 'regular-bond'
  | 'discount-bond'
  | 'inflation-linked-bond'
  | 'custom-bond'

export interface InvestmentInstrumentInput {
  subtype: InvestmentSubtype
  purchaseDate: string
  maturityDate: string
  issueDate?: string
  transactionDate?: string
  dueDate?: string
  principal: number
  purchasePrice?: number
  annualRate?: number
  spreadRate?: number
  yearlyInflation?: Array<{ year: number; rate: number }>
  saleDate?: string
  saleValue?: number
  category?: string
  description?: string
}

export interface DiscountBondDerivedMetrics {
  daysRemaining: number
  currentValuePercent: number
  yieldPercent: number
}

export interface InflationLinkedDateMarkers {
  issueDate: string
  transactionDate: string
  dueDate: string
  firstMaturityDate: string
  firstTechnicalAccrualStartDate: string
}

export interface InflationLinkedAccrualPeriod {
  maturityDate: string
  effectiveAnnualRate: number
  accrualFactor: number
}

export interface LoanRepaymentPreview {
  monthlyInstallment: number
  totalRepayment: number
  totalInterest: number
  termMonths: number
  /** Number of cash outflow payments across the full lifecycle. */
  paymentCount: number
  gracePeriodMonths: number
  amortizationMonths: number
  /** Interest-only amount due each grace month when capitalization is off; otherwise 0. */
  graceInterestOnlyPayment: number
  /** Principal entering amortization (includes capitalized grace interest when enabled). */
  amortizingPrincipal: number
}

export interface InvestmentMaturityPreview {
  purchaseAmount: number
  maturityAmount: number
  gainAmount: number
  subtype: InvestmentSubtype
  discountMetrics?: DiscountBondDerivedMetrics
  inflationMetrics?: {
    dateMarkers: InflationLinkedDateMarkers
    annualMaturityDates: string[]
    accrualPeriods: InflationLinkedAccrualPeriod[]
  }
}

export interface SimulationEvent {
  date: string
  type: string
  payload?: unknown
}

export interface SimulationStep<TState, TEvent extends SimulationEvent> {
  event: TEvent
  state: TState
}

export interface StatefulSimulationSpec<TState, TEvent extends SimulationEvent> {
  initialState: TState
  events: ReadonlyArray<TEvent>
  transition: (state: TState, event: TEvent) => TState
}