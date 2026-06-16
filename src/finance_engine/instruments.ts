import { daysInMonthUtc, formatIsoDate, parseIsoDate, rollBusinessDay } from './date_utils'
import type {
  InvestmentInstrumentInput,
  InvestmentMaturityPreview,
  LoanInstrumentInput,
  LoanRepaymentPreview,
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

function monthsBetween(startDate: Date, endDate: Date): number {
  const years = endDate.getUTCFullYear() - startDate.getUTCFullYear()
  const months = endDate.getUTCMonth() - startDate.getUTCMonth()
  const dayAdjust = endDate.getUTCDate() < startDate.getUTCDate() ? -1 : 0
  return years * 12 + months + dayAdjust
}

function maturityDateFromInput(purchaseDate: string, maturityDate: string): { purchase: Date; maturity: Date; months: number } {
  const purchase = parseIsoDate(purchaseDate)
  const maturity = parseIsoDate(maturityDate)
  if (maturity.getTime() <= purchase.getTime()) {
    throw new Error('maturityDate must be after purchaseDate.')
  }

  const months = monthsBetween(purchase, maturity)
  if (months < 0) {
    throw new Error('maturityDate must be after purchaseDate.')
  }

  return { purchase, maturity, months }
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

  if (!Number.isInteger(repaymentDayOfMonth) || repaymentDayOfMonth < 1 || repaymentDayOfMonth > 31) {
    throw new Error('Repayment day must be an integer between 1 and 31.')
  }

  const startDate = parseIsoDate(input.startDate)
  const monthlyInstallment = calculateLoanMonthlyInstallment(principal, annualRate, termMonths)
  const monthlyRate = annualRate / 12
  const flows: CashFlow[] = []

  if (input.includeDisbursement !== false) {
    flows.push({
      date: formatIsoDate(startDate),
      amount: principal,
      direction: CashFlowDirection.Inflow,
      category: input.category ?? 'loan',
      description: input.description
    })
  }

  let remainingPrincipal = principal
  let year = startDate.getUTCFullYear()
  let month = startDate.getUTCMonth()
  const startDay = startDate.getUTCDate()
  if (repaymentDayOfMonth < startDay) {
    month += 1
    if (month > 11) {
      month = 0
      year += 1
    }
  }

  for (let index = 0; index < termMonths; index += 1) {
    const monthDays = daysInMonthUtc(year, month)
    const day = Math.min(repaymentDayOfMonth, monthDays)
    const paymentDate = new Date(Date.UTC(year, month, day))
    const interestPortion = remainingPrincipal * monthlyRate
    const principalPortion = Math.min(monthlyInstallment - interestPortion, remainingPrincipal)
    remainingPrincipal = Math.max(0, remainingPrincipal - principalPortion)

    flows.push({
      date: formatIsoDate(paymentDate),
      amount: monthlyInstallment,
      direction: CashFlowDirection.Outflow,
      category: input.category ?? 'loan',
      description: input.description
    })

    month += 1
    if (month > 11) {
      month = 0
      year += 1
    }
  }

  return flows.sort((a, b) => a.date.localeCompare(b.date))
}

export function createLoanInstrumentBundle(input: LoanInstrumentInput & { label?: string; id?: string; createdAt?: string }) {
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

function parseYearlyInflation(input: InvestmentInstrumentInput['yearlyInflation']): Map<number, number> {
  const mapping = new Map<number, number>()
  for (const entry of input || []) {
    if (!entry) {
      continue
    }
    if (Number.isInteger(entry.year) && Number.isFinite(entry.rate)) {
      mapping.set(entry.year, entry.rate)
    }
  }
  return mapping
}

function getInvestmentPurchaseAmount(input: InvestmentInstrumentInput): number {
  const purchasePrice = Number(input.purchasePrice)
  if (Number.isFinite(purchasePrice) && purchasePrice > 0) {
    return purchasePrice
  }
  return ensurePositiveAmount(input.principal)
}

export function createInvestmentMaturityPreview(input: InvestmentInstrumentInput): InvestmentMaturityPreview {
  const { purchase, maturity, months } = maturityDateFromInput(input.purchaseDate, input.maturityDate)
  const subtype = input.subtype
  const principal = ensurePositiveAmount(input.principal)
  const purchaseAmount = getInvestmentPurchaseAmount(input)
  const annualRate = Number(input.annualRate ?? 0)
  const spreadRate = Number(input.spreadRate ?? 0)
  const yearlyInflation = parseYearlyInflation(input.yearlyInflation)

  let maturityAmount = principal

  if (subtype === 'regular-bond') {
    const rate = Number.isFinite(annualRate) ? annualRate : 0
    maturityAmount = principal * Math.pow(1 + rate / 12, months)
  } else if (subtype === 'discount-bond') {
    maturityAmount = principal
  } else if (subtype === 'inflation-linked-bond') {
    let cursor = new Date(Date.UTC(purchase.getUTCFullYear(), purchase.getUTCMonth(), purchase.getUTCDate()))
    const periodCount = Math.max(months, 0)
    for (let index = 0; index < periodCount; index += 12) {
      const year = cursor.getUTCFullYear()
      const inflationRate = yearlyInflation.get(year) ?? 0
      maturityAmount *= 1 + inflationRate + spreadRate
      cursor = new Date(Date.UTC(year + 1, cursor.getUTCMonth(), cursor.getUTCDate()))
    }
  } else {
    maturityAmount = principal
  }

  return {
    purchaseAmount,
    maturityAmount,
    gainAmount: maturityAmount - purchaseAmount,
    subtype
  }
}

export function generateInvestmentInstrumentCashFlows(
  input: InvestmentInstrumentInput & { label?: string; id?: string; createdAt?: string; couponPeriod?: string }
): CashFlow[] {
  const { purchase, maturity, months } = maturityDateFromInput(input.purchaseDate, input.maturityDate)
  const principal = ensurePositiveAmount(input.principal)
  const purchaseAmount = getInvestmentPurchaseAmount(input)
  const annualRate = Number(input.annualRate ?? 0)
  const spreadRate = Number(input.spreadRate ?? 0)
  const yearlyInflation = parseYearlyInflation(input.yearlyInflation)
  const category = input.category ?? 'investment'
  const description = input.description
  const flows: CashFlow[] = []

  flows.push({
    date: formatIsoDate(purchase),
    amount: purchaseAmount,
    direction: CashFlowDirection.Outflow,
    category,
    description
  })

  if (input.subtype === 'regular-bond') {
    flows.push({
      date: formatIsoDate(maturity),
      amount: principal * Math.pow(1 + annualRate / 12, months),
      direction: CashFlowDirection.Inflow,
      category,
      description
    })
  } else if (input.subtype === 'discount-bond') {
    flows.push({
      date: formatIsoDate(maturity),
      amount: principal,
      direction: CashFlowDirection.Inflow,
      category,
      description
    })
  } else if (input.subtype === 'inflation-linked-bond') {
    let maturityAmount = principal
    let cursor = new Date(Date.UTC(purchase.getUTCFullYear(), purchase.getUTCMonth(), purchase.getUTCDate()))
    const yearsToSimulate = Math.max(Math.floor(months / 12), 1)
    for (let index = 0; index < yearsToSimulate; index += 1) {
      const year = cursor.getUTCFullYear()
      const inflationRate = yearlyInflation.get(year) ?? 0
      maturityAmount *= 1 + inflationRate + spreadRate
      cursor = new Date(Date.UTC(year + 1, cursor.getUTCMonth(), cursor.getUTCDate()))
    }

    flows.push({
      date: formatIsoDate(maturity),
      amount: maturityAmount,
      direction: CashFlowDirection.Inflow,
      category,
      description
    })
  } else {
    const couponPeriod = input.couponPeriod || '0 0 1 * *'
    const periodicCoupon = principal * (annualRate / 12)
    const couponFlows = generateRecurringCashFlows({
      period: couponPeriod,
      startDate: formatIsoDate(purchase),
      endDate: formatIsoDate(maturity),
      amount: periodicCoupon,
      direction: CashFlowDirection.Inflow,
      category,
      description
    })

    flows.push(...couponFlows)
    flows.push({
      date: formatIsoDate(maturity),
      amount: principal,
      direction: CashFlowDirection.Inflow,
      category,
      description
    })
  }

  return flows.sort((a, b) => a.date.localeCompare(b.date))
}

export function createInvestmentInstrumentBundle(
  input: InvestmentInstrumentInput & { label?: string; id?: string; createdAt?: string; couponPeriod?: string }
) {
  const generatedFlows = generateInvestmentInstrumentCashFlows(input)
  const preview = createInvestmentMaturityPreview(input)

  return {
    id: input.id || `investment-${Date.now()}`,
    instrumentType: 'investment',
    label: input.label || 'Investment',
    config: {
      subtype: input.subtype,
      purchaseDate: input.purchaseDate,
      maturityDate: input.maturityDate,
      principal: input.principal,
      purchasePrice: input.purchasePrice,
      annualRate: input.annualRate,
      spreadRate: input.spreadRate,
      yearlyInflation: input.yearlyInflation || [],
      couponPeriod: input.couponPeriod,
      category: input.category ?? 'investment',
      description: input.description
    },
    preview,
    generatedFlows,
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
}
