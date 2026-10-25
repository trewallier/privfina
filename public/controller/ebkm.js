/**
 * Browser entry for EBKM primitives (ADR 0031 / 0032).
 * Math owned by `src/finance_engine/instruments/ebkm.ts`.
 */
export {
  HOME_SAVINGS_EBKM_PAYOUT_MONTH_INDEX,
  HOME_SAVINGS_EBKM_TERMINAL_ACCOUNT_FEE_NETTING,
  calendarDaysBetween,
  ebkmYearFraction,
  roundEbkmPercent,
  calculateEbkm,
  calculateEbkmFromLegs,
  calculateEbkmFromHomeSavingsCashFlows,
  calculateEbkmFromHomeSavingsPackage,
  buildHomeSavingsEbkmEqualMonthFlows
} from '@finance_engine/instruments/ebkm'
