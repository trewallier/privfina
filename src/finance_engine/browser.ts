/**
 * Browser-safe finance-engine surface for the Vite SPA (ADR 0032 / ROADMAP §6a).
 * Re-exports instrument, eval, and date primitives only.
 * Do not re-export product_specs loaders that use Node fs/path.
 */

export type { CashFlow, GeneratedCashFlow, InstrumentBundle, InstrumentType } from './models'
export { CashFlowDirection } from './models'

export {
  parseIsoDate,
  formatIsoDate,
  daysInMonthUtc,
  isWeekendUtc,
  toHolidaySet,
  isBusinessDayUtc,
  rollBusinessDay,
  lastBusinessDayOnOrBefore
} from './date_utils'

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

export { generateRecurringCashFlows, evaluateRecurring } from './recurring'

export {
  applyFeesAndDiscounts,
  DEFAULT_REPRESENTATIVE_EXCLUDED_FEE_NAMES
} from './instruments/loan_fees'

export {
  yearFractionEqualMonths,
  yearFractionActualDays,
  netDrawdownWithUpfrontCosts,
  roundThmPercent,
  thmPresentValue,
  calculateThm,
  buildThmFlowsFromMonthly,
  computeThmPct,
  expandScheduleToMonthlyPayments,
  calculateThmFromMonthlyRepayments
} from './instruments/thm'

export {
  calendarDaysBetween,
  ebkmYearFraction,
  roundEbkmPercent,
  buildEbkmFlowsFromLegs,
  ebkmPresentValue,
  calculateEbkm,
  calculateEbkmFromLegs,
  resolveHomeSavingsEbkmPayoutDate,
  buildEbkmLegsFromHomeSavingsCashFlows,
  calculateEbkmFromHomeSavingsCashFlows
} from './instruments/ebkm'

export {
  calculateLoanMonthlyInstallment,
  monthlyInterestRateFromAnnual,
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

export {
  deriveBmapRateOutputs,
  deriveBmapAccruedInterestAmount,
  generateBmapQuarterlyCouponFlows
} from './instruments/bmap'

export {
  derivePmapRateOutputs,
  derivePmapAccruedInterestAmount,
  generatePmapAnnualCouponFlows
} from './instruments/pmap'

export {
  deriveFixmapRateOutputs,
  deriveFixmapAccruedInterestAmount,
  generateFixmapAnnualCouponFlows
} from './instruments/fixmap'
export type { FixmapRateOutputs, FixmapSpecInputs } from './instruments/fixmap'

export {
  deriveMappRateOutputs,
  deriveMappAccruedInterestAmount,
  generateMappSemiAnnualCouponFlows
} from './instruments/mapp'
export type { MappRateOutputs, MappSpecInputs } from './instruments/mapp'

export {
  accrueInterestAmount,
  annualizeDkjSimpleReturnPct,
  calendarDaysBetweenIso,
  dayCountDenominator,
  deriveDkjRemainingDays,
  normalizeDayCountConvention,
  resolveAccrualStartIso,
  resolveCouponRatePct,
  resolveCoveringCouponPeriod,
  DEFAULT_GOVERNMENT_SECURITY_DAY_COUNT
} from './instruments/day_count'
export type { CouponSchedulePeriod, DayCountConvention } from './instruments/day_count'

export { generateSalaryInstrumentCashFlows } from './instruments/salary'
export { generateSubscriptionInstrumentCashFlows } from './instruments/subscription'

export {
  DEFAULT_HOME_SAVINGS_DEPOSIT_INTEREST_ANNUAL_RATE_PCT,
  DEFAULT_HOME_SAVINGS_MAX_CONTRACT_AMOUNT,
  DEFAULT_HOME_SAVINGS_MIN_CONTRACT_AMOUNT,
  DEFAULT_HOME_SAVINGS_PREMIUM_TIERS,
  DEFAULT_HOME_SAVINGS_SAVINGS_RATE_PERMILLE,
  HOME_SAVINGS_KIUTALASI_PERIOD_CUTOVER_DATE,
  HOME_SAVINGS_KIUTALASI_PERIOD_MONTHS,
  HOME_SAVINGS_KIUTALASI_PERIOD_MONTHS_BEFORE_CUTOVER,
  buildHomeSavingsAszfEbkmCashFlows,
  calculateEbkmFromHomeSavingsInstrument,
  ceilToTenForint,
  resolveKiutalasiPeriodMonths,
  resolveKiutalasiPeriodMonthsForContractStart,
  resolveMonthlyDepositFromContractAmount,
  resolveContractAmountFromMonthlyDeposit,
  resolveHomeSavingsMaturityPayoutDate,
  resolveHomeSavingsPremiumRatePct,
  calculateHomeSavingsDepositInterest,
  resolveHomeSavingsSchedule,
  generateHomeSavingsInstrumentCashFlows,
  createHomeSavingsInstrumentBundle
} from './instruments/home_savings'

