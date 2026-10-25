/**
 * Browser entry for EBKM primitives (ADR 0031 / 0032).
 * Math owned by `src/finance_engine/instruments/ebkm.ts`.
 */
export {
  calendarDaysBetween,
  ebkmYearFraction,
  roundEbkmPercent,
  calculateEbkm,
  calculateEbkmFromLegs,
  calculateEbkmFromHomeSavingsCashFlows
} from '@finance_engine/instruments/ebkm'
