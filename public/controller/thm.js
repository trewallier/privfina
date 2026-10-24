/**
 * Browser entry for THM primitives (ADR 0032).
 * Math owned by `src/finance_engine/instruments/thm.ts`.
 */
export {
  yearFractionEqualMonths,
  netDrawdownWithUpfrontCosts,
  roundThmPercent,
  calculateThm,
  calculateThmFromMonthlyRepayments,
  expandScheduleToMonthlyPayments,
  buildThmFlowsFromMonthly
} from '@finance_engine/instruments/thm'
