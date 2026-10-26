import type { CashFlow } from './models'
import { CashFlowDirection } from './models'
import type { CalculationEngine, CumulativePoint, OneTimeCashFlowInput } from './interfaces'
import {
  generateSalaryInstrumentCashFlows,
  generateSubscriptionInstrumentCashFlows,
  runStatefulSimulation,
  calculateLoanMonthlyInstallment,
  monthlyInterestRateFromAnnual,
  resolveLoanSchedule,
  simulateLoanAmortization,
  createLoanRepaymentPreview,
  generateLoanInstrumentCashFlows,
  createLoanInstrumentBundle,
  createInvestmentMaturityPreview,
  generateInvestmentInstrumentCashFlows,
  createInvestmentInstrumentBundle
} from './instruments'
export type {
  DateRange,
  CashFlowDefinition,
  CalculationEngine,
  OneTimeCashFlowInput,
  RecurringCashFlowInput,
  CumulativePoint,
  BusinessDayConvention,
  SalaryCustomMonthlyRule,
  SalaryInstrumentInput,
  SubscriptionInstrumentInput,
  LoanInstrumentInput,
  LoanRepaymentPreview,
  InvestmentSubtype,
  InvestmentInstrumentInput,
  InvestmentMaturityPreview,
  SimulationEvent,
  SimulationStep,
  StatefulSimulationSpec
} from './interfaces'
export type { InstrumentType, GeneratedCashFlow, InstrumentBundle } from './models'
export { generateRecurringCashFlows, evaluateRecurring } from './recurring'
export {
  EvalResultCache,
  fingerprintRecurringDefinition,
  buildRecurringEvaluateCacheKey,
  buildRecurringExpandCacheKey,
  buildInstrumentRangeCacheKey,
  sharedEvalResultCache,
  evaluateRecurringWithCache
} from './eval_cache'
export type { EvalCacheKind, EvalCacheStats } from './eval_cache'
export {
  generateSalaryInstrumentCashFlows,
  generateSubscriptionInstrumentCashFlows,
  runStatefulSimulation,
  calculateLoanMonthlyInstallment,
  monthlyInterestRateFromAnnual,
  resolveLoanSchedule,
  simulateLoanAmortization,
  createLoanRepaymentPreview,
  generateLoanInstrumentCashFlows,
  createLoanInstrumentBundle,
  createInvestmentMaturityPreview,
  generateInvestmentInstrumentCashFlows,
  createInvestmentInstrumentBundle,
  DEFAULT_HOME_SAVINGS_DEPOSIT_INTEREST_ANNUAL_RATE_PCT,
  DEFAULT_HOME_SAVINGS_MAX_CONTRACT_AMOUNT,
  DEFAULT_HOME_SAVINGS_MIN_CONTRACT_AMOUNT,
  DEFAULT_HOME_SAVINGS_PREMIUM_TIERS,
  DEFAULT_HOME_SAVINGS_SAVINGS_RATE_PERMILLE,
  calculateHomeSavingsDepositInterest,
  ceilToTenForint,
  createHomeSavingsInstrumentBundle,
  generateHomeSavingsInstrumentCashFlows,
  HOME_SAVINGS_KIUTALASI_PERIOD_MONTHS,
  resolveContractAmountFromMonthlyDeposit,
  resolveHomeSavingsMaturityPayoutDate,
  resolveHomeSavingsPremiumRatePct,
  resolveHomeSavingsSchedule,
  resolveMonthlyDepositFromContractAmount
} from './instruments'
export type {
  HomeSavingsBundleInput,
  HomeSavingsInstrumentInput,
  HomeSavingsPremiumTiers,
  HomeSavingsScheduleSummary
} from './instruments'
export {
  parseFixedRateLoanProductSpecYaml,
  validateFixedRateLoanProductSpec,
  loadFixedRateLoanProductSpec,
  mapFixedRateLoanSpecInputsToLoanInstrumentInput,
  generateLoanInstrumentCashFlowsFromFixedRateProductSpec
} from './product_specs/fixed_rate_loan'
export {
  parseMortgageLoanProductSpecYaml,
  validateMortgageLoanProductSpec,
  loadMortgageLoanProductSpec,
  mapMortgageLoanSpecInputsToLoanInstrumentInput,
  calculateMortgageLoanFromProductSpec,
  calculateThmFromMonthlyRepayments,
  generateLoanInstrumentCashFlowsFromMortgageLoanProductSpec
} from './product_specs/mortgage_loan'
export type {
  MortgageLoanProductSpec,
  MortgageLoanSpecInputs,
  MortgageLoanEngineOutputs
} from './product_specs/mortgage_loan'
export {
  parseHomeSavingsProductSpecYaml,
  validateHomeSavingsProductSpec,
  loadHomeSavingsProductSpec,
  resolveHomeSavingsAccountFeeMonthly,
  resolveHomeSavingsContractAmount,
  resolveHomeSavingsOpeningFee,
  mapHomeSavingsSpecInputsToInstrumentInput,
  calculateHomeSavingsFromProductSpec,
  generateCashFlowsFromHomeSavingsProductSpec,
  resolvePremiumRateForTerm
} from './product_specs/home_savings'
export type {
  HomeSavingsOpeningFeeMode,
  HomeSavingsProductSpec,
  HomeSavingsSpecInputs,
  HomeSavingsEngineOutputs
} from './product_specs/home_savings'
export {
  DEFAULT_FIXED_RATE_LOAN_PRODUCT_SPEC_PATH,
  DEFAULT_PRODUCT_SCHEMA_PATH,
  MORTGAGE_LOAN_PRODUCT_SPEC_PATHS,
  HOME_SAVINGS_PRODUCT_SPEC_PATHS,
  loadFixedRateLoanProductSpecFromFiles,
  loadMortgageLoanProductSpecFromFiles,
  loadHomeSavingsProductSpecFromFiles
} from './product_specs/loader'
export type { MortgageLoanProductCode, HomeSavingsProductCode } from './product_specs/loader'
export {
  applyFeesAndDiscounts,
  DEFAULT_REPRESENTATIVE_EXCLUDED_FEE_NAMES
} from './instruments/loan_fees'
export { resolveMortgageCustomerRate } from './instruments/loan_subsidy'
export {
  yearFractionEqualMonths,
  yearFractionActualDays,
  netDrawdownWithUpfrontCosts,
  roundThmPercent,
  thmPresentValue,
  calculateThm,
  buildThmFlowsFromMonthly,
  computeThmPct,
  expandScheduleToMonthlyPayments
} from './instruments/thm'
export type {
  ThmCashFlow,
  ThmComputationInput,
  ThmComputationResult,
  ThmFlow,
  ThmCalculationResult
} from './instruments/thm'
export {
  calendarDaysBetween,
  ebkmYearFraction,
  roundEbkmPercent,
  buildEbkmFlowsFromLegs,
  ebkmPresentValue,
  calculateEbkm,
  calculateEbkmFromLegs,
  buildEbkmLegsFromHomeSavingsCashFlows,
  calculateEbkmFromHomeSavingsCashFlows
} from './instruments/ebkm'
export type { EbkmCalculationResult, EbkmDatedFlow, EbkmLeg } from './instruments/ebkm'
export type { BmapRateOutputs, BmapSpecInputs } from './instruments/bmap'
export {
  deriveBmapMaturityDate,
  deriveBmapRateOutputs,
  deriveBmapAccruedInterestAmount,
  generateBmapQuarterlyCouponFlows
} from './instruments/bmap'

function signedAmount(cashFlow: CashFlow): number {
  return cashFlow.direction === CashFlowDirection.Inflow ? cashFlow.amount : -cashFlow.amount
}

export function createOneTimeCashFlow(input: OneTimeCashFlowInput): CashFlow {
  const amount = Number(input.amount)
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('Amount must be a non-negative finite number.')
  }

  return {
    date: input.date,
    amount,
    direction: input.direction,
    category: input.category ?? 'general',
    description: input.description
  }
}

export function calculateCumulativeSeries(
  cashFlows: ReadonlyArray<CashFlow>,
  startDate: string,
  endDate: string
): CumulativePoint[] {
  const filteredAndSorted = [...cashFlows]
    .filter((cashFlow) => cashFlow.date >= startDate && cashFlow.date <= endDate)
    .sort((a, b) => a.date.localeCompare(b.date))

  const series: CumulativePoint[] = []
  let runningTotal = 0

  for (const cashFlow of filteredAndSorted) {
    runningTotal += signedAmount(cashFlow)
    series.push({
      date: cashFlow.date,
      cumulativeTotal: runningTotal
    })
  }

  return series
}

export function createCalculationEngine(): CalculationEngine {
  return {
    summarizeCashFlows: () => []
  }
}
