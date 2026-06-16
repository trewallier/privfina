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

export function createLoanRepaymentPreview(input: LoanInstrumentInput): LoanRepaymentPreview {
  const monthlyInstallment = calculateLoanMonthlyInstallment(
    input.principal,
    input.annualRate,
    input.termMonths
  )
  return {
    monthlyInstallment,
    totalRepayment: monthlyInstallment * input.termMonths,
    totalInterest: monthlyInstallment * input.termMonths - input.principal,
    termMonths: input.termMonths
  }
}

export function generateLoanInstrumentCashFlows(input: LoanInstrumentInput): CashFlow[] {
  const principal = ensurePositiveAmount(input.principal)
  const annualRate = Number(input.annualRate)
  const termMonths = Number(input.termMonths)
  const repaymentDayOfMonth = Number(input.repaymentDayOfMonth)

  if (!Number.isFinite(annualRate) || annualRate < 0) {
    throw new Error('Annual rate must be a non-negative finite number.')
  }

  if (!Number.isInteger(termMonths) || termMonths <= 0) {
    throw new Error('Term months must be a positive integer.')
  }

  validateDayOfMonth(repaymentDayOfMonth, 'Repayment day')

  const startDate = parseIsoDate(input.startDate)
  const monthlyInstallment = calculateLoanMonthlyInstallment(principal, annualRate, termMonths)
  const monthlyRate = annualRate / MONTHS_PER_YEAR
  const flows: CashFlow[] = []
  const category = input.category ?? 'loan'
  const description = input.description

  if (input.includeDisbursement !== false) {
    flows.push(createCashFlow(toIsoDate(startDate), principal, CashFlowDirection.Inflow, category, description))
  }

  let remainingPrincipal = principal
  let year = startDate.getUTCFullYear()
  let month = startDate.getUTCMonth()
  const startDay = startDate.getUTCDate()
  if (repaymentDayOfMonth < startDay) {
    const next = incrementYearMonth(year, month)
    year = next.year
    month = next.month
  }

  for (let index = 0; index < termMonths; index += 1) {
    const monthDays = daysInMonthUtc(year, month)
    const day = Math.min(repaymentDayOfMonth, monthDays)
    const paymentDate = new Date(Date.UTC(year, month, day))
    const interestPortion = remainingPrincipal * monthlyRate
    const principalPortion = Math.min(monthlyInstallment - interestPortion, remainingPrincipal)
    remainingPrincipal = Math.max(0, remainingPrincipal - principalPortion)

    flows.push(
      createCashFlow(
        toIsoDate(paymentDate),
        monthlyInstallment,
        CashFlowDirection.Outflow,
        category,
        description
      )
    )

    const next = incrementYearMonth(year, month)
    year = next.year
    month = next.month
  }

  return sortCashFlowsByDate(flows)
}

export function createLoanInstrumentBundle(input: LoanBundleInput) {
  const generatedFlows = generateLoanInstrumentCashFlows(input)
  const preview = createLoanRepaymentPreview(input)

  return {
    id: input.id || `loan-${Date.now()}`,
    instrumentType: 'loan',
    label: input.label || 'Loan',
    config: {
      principal: input.principal,
      annualRate: input.annualRate,
      termMonths: input.termMonths,
      startDate: input.startDate,
      repaymentDayOfMonth: input.repaymentDayOfMonth,
      includeDisbursement: input.includeDisbursement !== false,
      category: input.category ?? 'loan',
      description: input.description
    },
    preview,
    generatedFlows,
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
}
