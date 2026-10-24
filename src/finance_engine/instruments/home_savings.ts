import type { CashFlow, InstrumentBundle } from '../models'
import { CashFlowDirection } from '../models'
import { generateRecurringCashFlows } from '../recurring'
import {
  assertBoundedHorizon,
  createCashFlow,
  ensurePositiveAmount,
  sortCashFlowsByDate
} from './common'

/** Default OTP Lakástakarék Prémium tiers (PRÉMIUM PLUSZ 10x30 Hirdetmény). */
export const DEFAULT_HOME_SAVINGS_PREMIUM_TIERS = {
  months49to96: 10,
  months97to120: 20,
  maturityFrom120: 30
} as const

export interface HomeSavingsPremiumTiers {
  months49to96: number
  months97to120: number
  maturityFrom120: number
}

export interface HomeSavingsInstrumentInput {
  monthlyDeposit: number
  termMonths: number
  startDate: string
  /** Day-of-month for deposits and account fees; defaults from startDate. */
  depositDayOfMonth?: number
  accountFeeMonthly: number
  accountOpeningFee: number
  housingPurpose: boolean
  /**
   * Optional ÁSZF annual deposit rate (percent). When omitted, interest is not
   * accrued (ADR 0029 — do not invent rates).
   */
  depositInterestAnnualRatePct?: number
  /** Override Premium percent; when omitted, resolve from term + tiers. */
  premiumRatePct?: number
  premiumTiers?: HomeSavingsPremiumTiers
  /** Early-exit scenario: savings month index (1-based) used for Premium band. */
  earlyExitMonth?: number
  category?: string
  description?: string
}

export interface HomeSavingsScheduleSummary {
  totalDeposits: number
  totalAccountFees: number
  accountOpeningFee: number
  accountFeeMonthly: number
  premiumRatePct: number
  /** Deposits (+ interest when ÁSZF rate supplied). */
  premiumBase: number
  premiumAmount: number
  /** Customer terminal inflow (premiumBase + premiumAmount). */
  terminalPayout: number
  /** Accrued deposit interest included in premiumBase; 0 when rate omitted. */
  depositInterest: number
  paymentCount: number
  termMonths: number
  housingPurpose: boolean
}

export interface HomeSavingsBundleInput extends HomeSavingsInstrumentInput {
  id?: string
  label?: string
  productId?: string
  productSpecVersion?: string
  createdAt?: string
  updatedAt?: string
}

function deriveDepositDayOfMonth(startDate: string): number {
  const day = Number(startDate.split('-')[2])
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new Error('Home-savings startDate must be in YYYY-MM-DD format.')
  }
  return day
}

function monthlyPeriod(dayOfMonth: number): string {
  return `0 0 ${dayOfMonth} * *`
}

/**
 * Resolve OTP Prémium percent from holding length and housing-purpose assumption.
 * Parameterized tiers — not productCode forks (ADR 0015).
 */
export function resolveHomeSavingsPremiumRatePct(input: {
  termMonths: number
  housingPurpose: boolean
  earlyExitMonth?: number
  tiers?: HomeSavingsPremiumTiers
}): number {
  if (!input.housingPurpose) {
    return 0
  }

  const tiers = input.tiers ?? DEFAULT_HOME_SAVINGS_PREMIUM_TIERS
  const holdingMonths =
    input.earlyExitMonth !== undefined && input.earlyExitMonth !== null
      ? Number(input.earlyExitMonth)
      : Number(input.termMonths)

  if (!Number.isInteger(holdingMonths) || holdingMonths <= 0) {
    throw new Error('Holding months for Premium resolution must be a positive integer.')
  }

  if (holdingMonths >= 120) {
    return tiers.maturityFrom120
  }
  if (holdingMonths >= 97) {
    return tiers.months97to120
  }
  if (holdingMonths >= 49) {
    return tiers.months49to96
  }
  return 0
}

/**
 * Simple equal-month compound interest on cumulative deposits when an ÁSZF rate
 * is provided. When rate is omitted, returns 0 (interest not modeled).
 */
export function calculateHomeSavingsDepositInterest(input: {
  monthlyDeposit: number
  termMonths: number
  annualRatePct?: number
}): number {
  const monthlyDeposit = ensurePositiveAmount(input.monthlyDeposit)
  const termMonths = Number(input.termMonths)
  if (!Number.isInteger(termMonths) || termMonths <= 0) {
    throw new Error('termMonths must be a positive integer.')
  }

  if (input.annualRatePct === undefined || input.annualRatePct === null) {
    return 0
  }

  const annualRatePct = Number(input.annualRatePct)
  if (!Number.isFinite(annualRatePct) || annualRatePct < 0) {
    throw new Error('depositInterestAnnualRatePct must be a non-negative finite number.')
  }

  if (annualRatePct === 0) {
    return 0
  }

  const monthlyRate = annualRatePct / 100 / 12
  let balance = 0
  for (let i = 0; i < termMonths; i += 1) {
    balance = balance * (1 + monthlyRate) + monthlyDeposit
  }
  const totalDeposits = monthlyDeposit * termMonths
  return balance - totalDeposits
}

export function resolveHomeSavingsSchedule(
  input: HomeSavingsInstrumentInput
): HomeSavingsScheduleSummary {
  const monthlyDeposit = ensurePositiveAmount(input.monthlyDeposit)
  const accountFeeMonthly = ensurePositiveAmount(input.accountFeeMonthly)
  const accountOpeningFee = ensurePositiveAmount(input.accountOpeningFee)
  const termMonths = Number(input.termMonths)

  if (!Number.isInteger(termMonths) || termMonths <= 0) {
    throw new Error('termMonths must be a positive integer.')
  }

  const totalDeposits = monthlyDeposit * termMonths
  const totalAccountFees = accountFeeMonthly * termMonths
  const depositInterest = calculateHomeSavingsDepositInterest({
    monthlyDeposit,
    termMonths,
    annualRatePct: input.depositInterestAnnualRatePct
  })
  const premiumBase = totalDeposits + depositInterest
  const premiumRatePct =
    input.premiumRatePct !== undefined && input.premiumRatePct !== null
      ? Number(input.premiumRatePct)
      : resolveHomeSavingsPremiumRatePct({
          termMonths,
          housingPurpose: input.housingPurpose,
          earlyExitMonth: input.earlyExitMonth,
          tiers: input.premiumTiers
        })

  if (!Number.isFinite(premiumRatePct) || premiumRatePct < 0) {
    throw new Error('premiumRatePct must be a non-negative finite number.')
  }

  const premiumAmount = (premiumBase * premiumRatePct) / 100
  const terminalPayout = premiumBase + premiumAmount

  return {
    totalDeposits,
    totalAccountFees,
    accountOpeningFee,
    accountFeeMonthly,
    premiumRatePct,
    premiumBase,
    premiumAmount,
    terminalPayout,
    depositInterest,
    paymentCount: termMonths,
    termMonths,
    housingPurpose: input.housingPurpose
  }
}

/**
 * Customer-perspective cash flows: opening fee, monthly deposits, monthly account
 * fees, terminal payout (deposits + optional interest + Premium).
 */
export function generateHomeSavingsInstrumentCashFlows(
  input: HomeSavingsInstrumentInput
): CashFlow[] {
  const monthlyDeposit = ensurePositiveAmount(input.monthlyDeposit)
  const accountFeeMonthly = ensurePositiveAmount(input.accountFeeMonthly)
  const accountOpeningFee = ensurePositiveAmount(input.accountOpeningFee)
  const termMonths = Number(input.termMonths)
  assertBoundedHorizon(undefined, termMonths)

  const dayOfMonth = input.depositDayOfMonth ?? deriveDepositDayOfMonth(input.startDate)
  const period = monthlyPeriod(dayOfMonth)
  const category = input.category ?? 'home-savings'
  const schedule = resolveHomeSavingsSchedule(input)

  const flows: CashFlow[] = []

  if (accountOpeningFee > 0) {
    flows.push(
      createCashFlow(
        input.startDate,
        accountOpeningFee,
        CashFlowDirection.Outflow,
        category,
        'Account opening fee'
      )
    )
  }

  flows.push(
    ...generateRecurringCashFlows({
      period,
      startDate: input.startDate,
      occurrences: termMonths,
      amount: monthlyDeposit,
      direction: CashFlowDirection.Outflow,
      category,
      description: input.description ?? 'Monthly deposit'
    })
  )

  if (accountFeeMonthly > 0) {
    flows.push(
      ...generateRecurringCashFlows({
        period,
        startDate: input.startDate,
        occurrences: termMonths,
        amount: accountFeeMonthly,
        direction: CashFlowDirection.Outflow,
        category,
        description: 'Account management fee'
      })
    )
  }

  const depositFlows = flows.filter((flow) => flow.description === (input.description ?? 'Monthly deposit'))
  const lastDepositDate =
    depositFlows.length > 0 ? depositFlows[depositFlows.length - 1].date : input.startDate

  if (schedule.terminalPayout > 0) {
    flows.push(
      createCashFlow(
        lastDepositDate,
        schedule.terminalPayout,
        CashFlowDirection.Inflow,
        category,
        'Home-savings terminal payout'
      )
    )
  }

  return sortCashFlowsByDate(flows)
}

export function createHomeSavingsInstrumentBundle(
  input: HomeSavingsBundleInput
): InstrumentBundle {
  const generatedFlows = generateHomeSavingsInstrumentCashFlows(input)
  const schedule = resolveHomeSavingsSchedule(input)
  const id = input.id || `home-savings-${Date.now()}`
  const instrumentType = 'home-savings' as const
  const now = new Date().toISOString()

  const stampedFlows = generatedFlows.map((flow, index) => ({
    ...flow,
    id: `${id}-flow-${index + 1}`,
    sourceInstrumentId: id,
    sourceInstrumentType: instrumentType
  }))

  return {
    id,
    instrumentType,
    label: input.label || 'Home savings',
    productId: input.productId,
    productSpecVersion: input.productSpecVersion,
    config: {
      productId: input.productId,
      productSpecVersion: input.productSpecVersion,
      monthlyDeposit: input.monthlyDeposit,
      termMonths: input.termMonths,
      startDate: input.startDate,
      depositDayOfMonth: input.depositDayOfMonth ?? deriveDepositDayOfMonth(input.startDate),
      accountFeeMonthly: input.accountFeeMonthly,
      accountOpeningFee: input.accountOpeningFee,
      housingPurpose: input.housingPurpose,
      depositInterestAnnualRatePct: input.depositInterestAnnualRatePct,
      premiumRatePct: schedule.premiumRatePct,
      earlyExitMonth: input.earlyExitMonth,
      category: input.category ?? 'home-savings',
      description: input.description
    },
    preview: schedule,
    generatedFlows: stampedFlows,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now
  }
}
