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
export {
  createInvestmentMaturityPreview,
  generateInvestmentInstrumentCashFlows,
  createInvestmentInstrumentBundle
} from './instruments/investment'
