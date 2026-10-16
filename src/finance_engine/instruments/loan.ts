import { daysInMonthUtc, parseIsoDate } from '../date_utils'
import type { LoanInstrumentInput, LoanRepaymentPreview } from '../interfaces'
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
  monthlyRate: number
  amortizingPrincipal: number
  graceInterestOnlyPayment: number
  monthlyInstallment: number
  paymentCount: number
  totalRepayment: number
  totalInterest: number
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

export function resolveLoanSchedule(input: {
  principal: number
  annualRate: number
  termMonths: number
  gracePeriodMonths?: number
  capitalizeInterestAtGraceEnd?: boolean
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
  const monthlyRate = annualRate / MONTHS_PER_YEAR

  let amortizingPrincipal = principal
  let graceInterestOnlyPayment = 0
  let graceCashTotal = 0

  if (gracePeriodMonths > 0) {
    if (capitalizeInterestAtGraceEnd) {
      amortizingPrincipal = principal * Math.pow(1 + monthlyRate, gracePeriodMonths)
    } else {
      graceInterestOnlyPayment = principal * monthlyRate
      graceCashTotal = graceInterestOnlyPayment * gracePeriodMonths
    }
  }

  const monthlyInstallment = calculateLoanMonthlyInstallment(
    amortizingPrincipal,
    annualRate,
    amortizationMonths
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

  const monthlyRate = annualRate / MONTHS_PER_YEAR
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
      const interestPortion = state.remainingPrincipal * (annualRate / MONTHS_PER_YEAR)
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
    'principal' | 'annualRate' | 'termMonths' | 'gracePeriodMonths' | 'capitalizeInterestAtGraceEnd'
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
