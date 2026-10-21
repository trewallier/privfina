export { generateSalaryInstrumentCashFlows } from './instruments/salary'
export { generateSubscriptionInstrumentCashFlows } from './instruments/subscription'
export type { StatefulSimulationResult } from './instruments/simulation'
export { runStatefulSimulation } from './instruments/simulation'
export type { LoanAmortizationStep, ResolvedLoanSchedule } from './instruments/loan'
export {
  calculateLoanMonthlyInstallment,
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
