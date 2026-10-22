export { generateSalaryInstrumentCashFlows } from './instruments/salary'
export { generateSubscriptionInstrumentCashFlows } from './instruments/subscription'
export type { StatefulSimulationResult } from './instruments/simulation'
export { runStatefulSimulation } from './instruments/simulation'
export type {
  InterestDayCountConvention,
  LoanAmortizationStep,
  LoanPaymentRounding,
  LoanScheduleRateOptions,
  ResolvedLoanSchedule
} from './instruments/loan'
export {
  ACT_360_YEAR_DAYS,
  ACT_365_YEAR_DAYS,
  ACT_366_YEAR_DAYS,
  EQUAL_MONTH_DAYS_LEAP,
  EQUAL_MONTH_DAYS_NON_LEAP,
  calculateLoanMonthlyInstallment,
  monthlyInterestRateFromAnnual,
  resolveLoanSchedule,
  simulateLoanAmortization,
  createLoanRepaymentPreview,
  generateLoanInstrumentCashFlows,
  createLoanInstrumentBundle
} from './instruments/loan'
export type {
  AppliedFeeLine,
  CreditCostPackage,
  FeeApplicationOptions,
  ProductDiscountDefinition,
  ProductFeeDefinition
} from './instruments/loan_fees'
export {
  applyFeesAndDiscounts,
  DEFAULT_REPRESENTATIVE_EXCLUDED_FEE_NAMES
} from './instruments/loan_fees'
export type {
  MortgageRateResolutionInput,
  ProductSubsidyDefinition,
  ResolvedMortgageCustomerRate
} from './instruments/loan_subsidy'
export { resolveMortgageCustomerRate } from './instruments/loan_subsidy'
export type {
  ThmCashFlow,
  ThmComputationInput,
  ThmComputationResult,
  ThmFlow,
  ThmCalculationResult
} from './instruments/thm'
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
export {
  createInvestmentMaturityPreview,
  generateInvestmentInstrumentCashFlows,
  createInvestmentInstrumentBundle
} from './instruments/investment'
export type { BmapRateOutputs, BmapSpecInputs } from './instruments/bmap'
export {
  deriveBmapMaturityDate,
  deriveBmapRateOutputs,
  deriveBmapAccruedInterestAmount,
  generateBmapQuarterlyCouponFlows
} from './instruments/bmap'
