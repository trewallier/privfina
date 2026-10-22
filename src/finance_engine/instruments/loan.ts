import { daysInMonthUtc, parseIsoDate } from '../date_utils'
import type {
  InterestDayCountConvention,
  LoanInstrumentInput,
  LoanPaymentRounding,
  LoanRepaymentPreview
} from '../interfaces'
import type { CashFlow } from '../models'
import { CashFlowDirection } from '../models'
import {
  LoanBundleInput,
  MONTHS_PER_YEAR,
  createCashFlow,
  ensurePositiveAmount,
  incrementYearMonth,
  sortCashFlowsByDate,
  toIsoDate,
  validateDayOfMonth
} from './common'
import { runStatefulSimulation } from './simulation'

export type { InterestDayCountConvention, LoanPaymentRounding }

export interface LoanAmortizationStep {
  installmentIndex: number
  interestPortion: number
  principalPortion: number
  installmentAmount: number
  remainingPrincipal: number
}

export interface ResolvedLoanSchedule {
  principal: number
  annualRate: number
  termMonths: number
  gracePeriodMonths: number
  capitalizeInterestAtGraceEnd: boolean
  amortizationMonths: number
  interestDayCountConvention: InterestDayCountConvention
  paymentRounding: LoanPaymentRounding
  monthlyRate: number
  amortizingPrincipal: number
  graceInterestOnlyPayment: number
  monthlyInstallment: number
  paymentCount: number
  totalRepayment: number
  totalInterest: number
}

export interface LoanScheduleRateOptions {
  interestDayCountConvention?: InterestDayCountConvention
  paymentRounding?: LoanPaymentRounding
}

function normalizeGracePeriodMonths(value: unknown, termMonths: number): number {
  if (value === undefined || value === null || value === '') {
    return 0
  }

  const gracePeriodMonths = Number(value)
  if (!Number.isInteger(gracePeriodMonths) || gracePeriodMonths < 0) {
    throw new Error('Grace period months must be a non-negative integer.')
  }

  if (gracePeriodMonths >= termMonths) {
    throw new Error('Grace period months must be less than the loan term.')
  }

  return gracePeriodMonths
}

/** 83/2010. (III. 25.) Korm. rendelet 5. § (2) d — equal month length (non-leap). */
export const EQUAL_MONTH_DAYS_NON_LEAP = 365 / MONTHS_PER_YEAR
/** Equal month length when a product states ACT/366 leap-year basis. */
export const EQUAL_MONTH_DAYS_LEAP = 366 / MONTHS_PER_YEAR
export const ACT_360_YEAR_DAYS = 360
export const ACT_365_YEAR_DAYS = 365
export const ACT_366_YEAR_DAYS = 366

const INTEREST_DAY_COUNT_CONVENTIONS: readonly InterestDayCountConvention[] = [
  '30/360',
  'act/360',
  'act/365',
  'act/366'
]

function normalizeInterestDayCountConvention(
  value: InterestDayCountConvention | undefined
): InterestDayCountConvention {
  if (value === undefined) {
    return '30/360'
  }
  if ((INTEREST_DAY_COUNT_CONVENTIONS as readonly string[]).includes(value)) {
    return value
  }
  throw new Error(
    'interestDayCountConvention must be one of 30/360, act/360, act/365, act/366.'
  )
}

function normalizePaymentRounding(value: LoanPaymentRounding | undefined): LoanPaymentRounding {
  if (value === undefined || value === 'none') {
    return 'none'
  }
  if (value === 'forint') {
    return 'forint'
  }
  throw new Error('paymentRounding must be none or forint.')
}

/**
 * Monthly interest factor from annual contractual rate for equal installments (ADR 0025).
 *
 * - `30/360`: r/12
 * - `act/360`: r × (365/12) / 360  (OTP: kamat = tőke × r × (365/12) / 360)
 * - `act/365`: r × (365/12) / 365  (= r/12 under equal months)
 * - `act/366`: r × (366/12) / 366  (= r/12 under equal months)
 */
export function monthlyInterestRateFromAnnual(
  annualRate: number,
  convention: InterestDayCountConvention = '30/360'
): number {
  const normalized = normalizeInterestDayCountConvention(convention)
  switch (normalized) {
    case 'act/360':
      return (annualRate * EQUAL_MONTH_DAYS_NON_LEAP) / ACT_360_YEAR_DAYS
    case 'act/365':
      return (annualRate * EQUAL_MONTH_DAYS_NON_LEAP) / ACT_365_YEAR_DAYS
    case 'act/366':
      return (annualRate * EQUAL_MONTH_DAYS_LEAP) / ACT_366_YEAR_DAYS
    case '30/360':
      return annualRate / MONTHS_PER_YEAR
  }
}

function roundLevelInstallment(amount: number, rounding: LoanPaymentRounding): number {
  return rounding === 'forint' ? Math.round(amount) : amount
}

function roundGraceInterestOnly(amount: number, rounding: LoanPaymentRounding): number {
  return rounding === 'forint' ? Math.floor(amount) : amount
}

export function resolveLoanSchedule(input: {
  principal: number
  annualRate: number
  termMonths: number
  gracePeriodMonths?: number
  capitalizeInterestAtGraceEnd?: boolean
  interestDayCountConvention?: InterestDayCountConvention
  paymentRounding?: LoanPaymentRounding
}): ResolvedLoanSchedule {
  const principal = ensurePositiveAmount(input.principal)
  const annualRate = Number(input.annualRate)
  const termMonths = Number(input.termMonths)

  if (!Number.isFinite(annualRate) || annualRate < 0) {
    throw new Error('Annual rate must be a non-negative finite number.')
  }

  if (!Number.isInteger(termMonths) || termMonths <= 0) {
    throw new Error('Term months must be a positive integer.')
  }

  const gracePeriodMonths = normalizeGracePeriodMonths(input.gracePeriodMonths, termMonths)
  const capitalizeInterestAtGraceEnd =
    gracePeriodMonths > 0 && input.capitalizeInterestAtGraceEnd === true
  const amortizationMonths = termMonths - gracePeriodMonths
  const interestDayCountConvention = normalizeInterestDayCountConvention(
    input.interestDayCountConvention
  )
  const paymentRounding = normalizePaymentRounding(input.paymentRounding)
  const monthlyRate = monthlyInterestRateFromAnnual(annualRate, interestDayCountConvention)

  let amortizingPrincipal = principal
  let graceInterestOnlyPayment = 0
  let graceCashTotal = 0

  if (gracePeriodMonths > 0) {
    if (capitalizeInterestAtGraceEnd) {
      amortizingPrincipal = principal * Math.pow(1 + monthlyRate, gracePeriodMonths)
    } else {
      graceInterestOnlyPayment = roundGraceInterestOnly(principal * monthlyRate, paymentRounding)
      graceCashTotal = graceInterestOnlyPayment * gracePeriodMonths
    }
  }

  const monthlyInstallment = calculateLoanMonthlyInstallment(
    amortizingPrincipal,
    annualRate,
    amortizationMonths,
    { interestDayCountConvention, paymentRounding }
  )
  const amortizationTotal = monthlyInstallment * amortizationMonths
  const totalRepayment = graceCashTotal + amortizationTotal
  const paymentCount = capitalizeInterestAtGraceEnd
    ? amortizationMonths
    : gracePeriodMonths + amortizationMonths

  return {
    principal,
    annualRate,
    termMonths,
    gracePeriodMonths,
    capitalizeInterestAtGraceEnd,
    amortizationMonths,
    interestDayCountConvention,
    paymentRounding,
    monthlyRate,
    amortizingPrincipal,
    graceInterestOnlyPayment,
    monthlyInstallment,
    paymentCount,
    totalRepayment,
    totalInterest: totalRepayment - principal
  }
}

export function calculateLoanMonthlyInstallment(
  principal: number,
  annualRate: number,
  termMonths: number,
  options: LoanScheduleRateOptions = {}
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

  const interestDayCountConvention = normalizeInterestDayCountConvention(
    options.interestDayCountConvention
  )
  const paymentRounding = normalizePaymentRounding(options.paymentRounding)
  const monthlyRate = monthlyInterestRateFromAnnual(annualRate, interestDayCountConvention)
  if (monthlyRate === 0) {
    return roundLevelInstallment(principal / termMonths, paymentRounding)
  }

  const factor = Math.pow(1 + monthlyRate, termMonths)
  const raw = (principal * monthlyRate * factor) / (factor - 1)
  return roundLevelInstallment(raw, paymentRounding)
}

export function simulateLoanAmortization(
  principal: number,
  annualRate: number,
  termMonths: number,
  options: LoanScheduleRateOptions = {}
): LoanAmortizationStep[] {
  const interestDayCountConvention = normalizeInterestDayCountConvention(
    options.interestDayCountConvention
  )
  const paymentRounding = normalizePaymentRounding(options.paymentRounding)
  const monthlyRate = monthlyInterestRateFromAnnual(annualRate, interestDayCountConvention)
  const installmentAmount = calculateLoanMonthlyInstallment(principal, annualRate, termMonths, {
    interestDayCountConvention,
    paymentRounding
  })
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
      const interestPortion = state.remainingPrincipal * monthlyRate
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

export function createLoanRepaymentPreview(
  input: Pick<
    LoanInstrumentInput,
    | 'principal'
    | 'annualRate'
    | 'termMonths'
    | 'gracePeriodMonths'
    | 'capitalizeInterestAtGraceEnd'
    | 'interestDayCountConvention'
    | 'paymentRounding'
  >
): LoanRepaymentPreview {
  const schedule = resolveLoanSchedule(input)
  return {
    monthlyInstallment: schedule.monthlyInstallment,
    totalRepayment: schedule.totalRepayment,
    totalInterest: schedule.totalInterest,
    termMonths: schedule.termMonths,
    paymentCount: schedule.paymentCount,
    gracePeriodMonths: schedule.gracePeriodMonths,
    amortizationMonths: schedule.amortizationMonths,
    graceInterestOnlyPayment: schedule.graceInterestOnlyPayment,
    amortizingPrincipal: schedule.amortizingPrincipal
  }
}

function advanceRepaymentCursor(
  year: number,
  month: number,
  repaymentDayOfMonth: number
): { year: number; month: number; paymentDate: Date } {
  const monthDays = daysInMonthUtc(year, month)
  const day = Math.min(repaymentDayOfMonth, monthDays)
  const paymentDate = new Date(Date.UTC(year, month, day))
  const next = incrementYearMonth(year, month)
  return { year: next.year, month: next.month, paymentDate }
}

export function generateLoanInstrumentCashFlows(input: LoanInstrumentInput): CashFlow[] {
  const schedule = resolveLoanSchedule(input)
  const repaymentDayOfMonth = Number(input.repaymentDayOfMonth)
  validateDayOfMonth(repaymentDayOfMonth, 'Repayment day')

  const startDate = parseIsoDate(input.startDate)
  const flows: CashFlow[] = []
  const category = input.category ?? 'loan'
  const description = input.description

  if (input.includeDisbursement !== false) {
    flows.push(
      createCashFlow(toIsoDate(startDate), schedule.principal, CashFlowDirection.Inflow, category, description)
    )
  }

  let year = startDate.getUTCFullYear()
  let month = startDate.getUTCMonth()
  const startDay = startDate.getUTCDate()
  if (repaymentDayOfMonth < startDay) {
    const next = incrementYearMonth(year, month)
    year = next.year
    month = next.month
  }

  if (schedule.gracePeriodMonths > 0 && !schedule.capitalizeInterestAtGraceEnd) {
    for (let index = 0; index < schedule.gracePeriodMonths; index += 1) {
      const cursor = advanceRepaymentCursor(year, month, repaymentDayOfMonth)
      year = cursor.year
      month = cursor.month
      flows.push(
        createCashFlow(
          toIsoDate(cursor.paymentDate),
          schedule.graceInterestOnlyPayment,
          CashFlowDirection.Outflow,
          category,
          description
        )
      )
    }
  } else if (schedule.gracePeriodMonths > 0 && schedule.capitalizeInterestAtGraceEnd) {
    for (let index = 0; index < schedule.gracePeriodMonths; index += 1) {
      const next = incrementYearMonth(year, month)
      year = next.year
      month = next.month
    }
  }

  let remainingPrincipal = schedule.amortizingPrincipal
  for (let index = 0; index < schedule.amortizationMonths; index += 1) {
    const cursor = advanceRepaymentCursor(year, month, repaymentDayOfMonth)
    year = cursor.year
    month = cursor.month

    const interestPortion = remainingPrincipal * schedule.monthlyRate
    const principalPortion = Math.min(
      schedule.monthlyInstallment - interestPortion,
      remainingPrincipal
    )
    remainingPrincipal = Math.max(0, remainingPrincipal - principalPortion)

    flows.push(
      createCashFlow(
        toIsoDate(cursor.paymentDate),
        schedule.monthlyInstallment,
        CashFlowDirection.Outflow,
        category,
        description
      )
    )
  }

  return sortCashFlowsByDate(flows)
}

export function createLoanInstrumentBundle(input: LoanBundleInput) {
  const generatedFlows = generateLoanInstrumentCashFlows(input)
  const preview = createLoanRepaymentPreview(input)
  const id = input.id || `loan-${Date.now()}`
  const instrumentType = 'loan' as const
  const productId = input.productId
  const productSpecVersion = input.productSpecVersion
  const gracePeriodMonths = preview.gracePeriodMonths
  const capitalizeInterestAtGraceEnd = input.capitalizeInterestAtGraceEnd === true && gracePeriodMonths > 0

  return {
    id,
    instrumentType,
    label: input.label || 'Loan',
    productId,
    productSpecVersion,
    config: {
      productId,
      productSpecVersion,
      principal: input.principal,
      annualRate: input.annualRate,
      termMonths: input.termMonths,
      startDate: input.startDate,
      repaymentDayOfMonth: input.repaymentDayOfMonth,
      gracePeriodMonths,
      capitalizeInterestAtGraceEnd,
      interestDayCountConvention: input.interestDayCountConvention ?? '30/360',
      paymentRounding: input.paymentRounding ?? 'none',
      includeDisbursement: input.includeDisbursement !== false,
      category: input.category ?? 'loan',
      description: input.description
    },
    preview,
    generatedFlows: generatedFlows.map((flow, index) => ({
      ...flow,
      id: `${id}-flow-${index}`,
      sourceInstrumentId: id,
      sourceInstrumentType: instrumentType
    })),
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
}
