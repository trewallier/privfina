import { daysInMonthUtc, formatIsoDate, parseIsoDate } from '../date_utils'
import type { CashFlow, InstrumentBundle } from '../models'
import { CashFlowDirection } from '../models'
import { generateRecurringCashFlows } from '../recurring'
import {
  assertBoundedHorizon,
  createCashFlow,
  ensurePositiveAmount,
  sortCashFlowsByDate
} from './common'

/** Default OTP Lakástakarék Prémium tiers (PRÉMIUM PLUSZ 10x30 Hirdetmény / USZ). */
export const DEFAULT_HOME_SAVINGS_PREMIUM_TIERS = {
  months49to96: 10,
  months97to120: 20,
  maturityFrom120: 30
} as const

/** USZ Melléklet 2026-08-03 — PRÉMIUM PLUSZ 10x30. */
export const DEFAULT_HOME_SAVINGS_DEPOSIT_INTEREST_ANNUAL_RATE_PCT = 0.1
export const DEFAULT_HOME_SAVINGS_SAVINGS_RATE_PERMILLE = 3.846
export const DEFAULT_HOME_SAVINGS_MIN_CONTRACT_AMOUNT = 2_600_000
export const DEFAULT_HOME_SAVINGS_MAX_CONTRACT_AMOUNT = 26_000_000

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
   * Annual deposit rate (percent). Defaults to USZ Melléklet 0.10% when omitted
   * on the product-spec path; pass explicitly `0` to disable interest.
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
  productCode?: string
  productSpecVersion?: string
  /** Opening-fee mode for edit round-trips (commercial composer). */
  openingFeeMode?: string
  /** Resolved or explicit szerződéses összeg for edit round-trips. */
  contractAmount?: number
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

function addMonthsUtc(date: Date, months: number): Date {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth() + months
  const targetYear = year + Math.floor(month / 12)
  const targetMonth = ((month % 12) + 12) % 12
  const day = Math.min(date.getUTCDate(), daysInMonthUtc(targetYear, targetMonth))
  return new Date(Date.UTC(targetYear, targetMonth, day))
}

function shiftUtcDays(date: Date, days: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days))
}

export function ceilToTenForint(amount: number): number {
  return Math.ceil(amount / 10) * 10
}

/**
 * Havi betét = szerződéses összeg × ‰ / 1000, rounded up to 10 Ft (USZ/ÁSZF).
 */
export function resolveMonthlyDepositFromContractAmount(input: {
  contractAmount: number
  savingsRatePermille?: number
}): number {
  const contractAmount = Number(input.contractAmount)
  if (!Number.isFinite(contractAmount) || contractAmount <= 0) {
    throw new Error('contractAmount must be a positive finite number.')
  }
  const permille = Number(input.savingsRatePermille ?? DEFAULT_HOME_SAVINGS_SAVINGS_RATE_PERMILLE)
  if (!Number.isFinite(permille) || permille <= 0) {
    throw new Error('savingsRatePermille must be a positive finite number.')
  }
  return ceilToTenForint((contractAmount * permille) / 1000)
}

/**
 * Invert the ‰ rule to a 10 000 Ft multiple in the módozat contract bounds.
 */
export function resolveContractAmountFromMonthlyDeposit(input: {
  monthlyDeposit: number
  savingsRatePermille?: number
  minContractAmount?: number
  maxContractAmount?: number
}): number {
  const monthlyDeposit = ensurePositiveAmount(input.monthlyDeposit)
  const permille = Number(input.savingsRatePermille ?? DEFAULT_HOME_SAVINGS_SAVINGS_RATE_PERMILLE)
  const minContract = Number(input.minContractAmount ?? DEFAULT_HOME_SAVINGS_MIN_CONTRACT_AMOUNT)
  const maxContract = Number(input.maxContractAmount ?? DEFAULT_HOME_SAVINGS_MAX_CONTRACT_AMOUNT)

  if (!Number.isFinite(permille) || permille <= 0) {
    throw new Error('savingsRatePermille must be a positive finite number.')
  }

  const approx = (monthlyDeposit * 1000) / permille
  const start = Math.round(approx / 10_000) * 10_000
  for (let delta = 0; delta <= 50; delta += 1) {
    for (const candidate of delta === 0 ? [start] : [start - delta * 10_000, start + delta * 10_000]) {
      if (candidate < minContract || candidate > maxContract) continue
      if (resolveMonthlyDepositFromContractAmount({ contractAmount: candidate, savingsRatePermille: permille }) === monthlyDeposit) {
        return candidate
      }
    }
  }

  throw new Error(
    `No contract amount in [${minContract}, ${maxContract}] maps to monthlyDeposit ${monthlyDeposit} at ${permille}‰.`
  )
}

/**
 * ÁSZF/USZ deposit interest: ACT/360 daily
 * (`tőke × kamatláb × napok / (360 × 100)`), yearly capitalization on the first
 * day after each megtakarítási év, accrual from credit day through the day
 * before payout. Returns whole-forint interest (nearest).
 *
 * Payout horizon quarantine: `payoutDate` is currently the last deposit date.
 * OTP product-page calculator maturity (authoritative) implies ~two further
 * months of accrual toward the first of that month (see
 * `web-calculator-maturity-*.yaml` engineTerminalPayoutDeltaFt). Do not fit a
 * lag here without ÁSZF-sourced dating — home-savings calc-aligned is blocked.
 */
export function calculateHomeSavingsDepositInterest(input: {
  monthlyDeposit: number
  termMonths: number
  startDate: string
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

  const start = parseIsoDate(input.startDate)
  const depositDates = new Map<string, number>()
  for (let i = 0; i < termMonths; i += 1) {
    const depositDate = addMonthsUtc(start, i)
    const key = formatIsoDate(depositDate)
    depositDates.set(key, (depositDates.get(key) ?? 0) + monthlyDeposit)
  }

  const yearStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))
  const capDates = new Set<string>()
  for (let yearIndex = 1; yearIndex <= Math.ceil(termMonths / 12) + 1; yearIndex += 1) {
    capDates.add(formatIsoDate(addMonthsUtc(yearStart, yearIndex * 12)))
  }

  const lastDeposit = addMonthsUtc(start, termMonths - 1)
  const payoutDate = lastDeposit
  let balance = 0
  let pendingInterest = 0
  let totalInterest = 0
  let cursor = new Date(start.getTime())

  while (cursor.getTime() <= payoutDate.getTime()) {
    const key = formatIsoDate(cursor)

    if (capDates.has(key) && pendingInterest > 0) {
      const capitalized = Math.round(pendingInterest)
      balance += capitalized
      totalInterest += capitalized
      pendingInterest = 0
    }

    const deposit = depositDates.get(key)
    if (deposit) {
      balance += deposit
    }

    // Interest ends on the day before payout (ÁSZF/USZ).
    if (cursor.getTime() < payoutDate.getTime()) {
      pendingInterest += (balance * annualRatePct) / (360 * 100)
    }

    cursor = shiftUtcDays(cursor, 1)
  }

  if (pendingInterest > 0) {
    totalInterest += Math.round(pendingInterest)
  }

  return totalInterest
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
    startDate: input.startDate,
    annualRatePct: input.depositInterestAnnualRatePct
  })
  // Premium % applies to contractual deposits only (USZ §10); interest is additive.
  const premiumBase = totalDeposits
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
  const terminalPayout = totalDeposits + depositInterest + premiumAmount

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
  // Fixed flow label — `input.description` is free-text notes on the bundle/config only.
  const depositDescription = 'Monthly deposit'
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
      description: depositDescription
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

  const depositFlows = flows.filter((flow) => flow.description === depositDescription)
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
      productCode: input.productCode,
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
      openingFeeMode: input.openingFeeMode,
      contractAmount: input.contractAmount,
      category: input.category ?? 'home-savings',
      description: input.description
    },
    preview: schedule,
    generatedFlows: stampedFlows,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now
  }
}
