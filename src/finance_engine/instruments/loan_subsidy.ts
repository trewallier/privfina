/**
 * Customer-rate resolution for state-subsidized and market mortgage products (ADR 0021).
 */

export type SubsidyType = 'none' | 'state-interest-subsidy'

export interface ProductSubsidyDefinition {
  type: SubsidyType
  /** Decimal customer rate during subsidy (for example 0.03 for 3%). */
  customerRate?: number
  subsidyDurationMonths?: number
}

export interface MortgageRateResolutionInput {
  /** Contractual / customer annual rate in percent (spec input annualInterestRatePct). */
  annualInterestRatePct: number
  /** Optional ügyleti / transactional rate in percent (retained for future split analytics). */
  transactionalAnnualRatePct?: number
  subsidy?: ProductSubsidyDefinition | null
  /** Additional rate discount in basis points to subtract from the customer percent rate. */
  rateDiscountBp?: number
}

export interface ResolvedMortgageCustomerRate {
  /** Decimal annual rate for loan schedule primitives. */
  annualRate: number
  /** Percent annual rate after discounts. */
  annualInterestRatePct: number
  /** Whether the product declares a state-interest subsidy block. */
  isStateSubsidized: boolean
  transactionalAnnualRatePct?: number
  subsidyDurationMonths?: number
  subsidyCustomerRatePct?: number
  rateDiscountBp: number
}

/** Absolute tolerance (percentage points) for subsidy customerRate vs input rate. */
export const SUBSIDY_CUSTOMER_RATE_TOLERANCE_PP = 1e-6

function ensureFiniteNumber(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`)
  }
  return value
}

/**
 * Resolve the customer annual rate used by loan amortization primitives.
 *
 * Schedule math uses the example/user `annualInterestRatePct` (after optional bp discounts).
 * When `subsidy.type === 'state-interest-subsidy'` and `subsidy.customerRate` is set, the
 * input percent rate must match `customerRate * 100` within
 * {@link SUBSIDY_CUSTOMER_RATE_TOLERANCE_PP} (checked before rate discounts).
 * Ügyleti / state cash-flow splits remain deferred.
 */
export function resolveMortgageCustomerRate(
  input: MortgageRateResolutionInput
): ResolvedMortgageCustomerRate {
  const rateDiscountBp = ensureFiniteNumber(input.rateDiscountBp ?? 0, 'rateDiscountBp')
  if (rateDiscountBp < 0) {
    throw new Error('rateDiscountBp must be non-negative.')
  }

  let annualInterestRatePct = ensureFiniteNumber(
    input.annualInterestRatePct,
    'annualInterestRatePct'
  )
  if (annualInterestRatePct < 0) {
    throw new Error('annualInterestRatePct must be non-negative.')
  }

  const subsidy = input.subsidy
  const isStateSubsidized = subsidy?.type === 'state-interest-subsidy'
  let subsidyCustomerRatePct: number | undefined

  if (isStateSubsidized && subsidy?.customerRate !== undefined) {
    subsidyCustomerRatePct =
      ensureFiniteNumber(subsidy.customerRate, 'subsidy.customerRate') * 100
    if (
      Math.abs(annualInterestRatePct - subsidyCustomerRatePct) >
      SUBSIDY_CUSTOMER_RATE_TOLERANCE_PP
    ) {
      throw new Error(
        `annualInterestRatePct (${annualInterestRatePct}) must match subsidy.customerRate ` +
          `(${subsidyCustomerRatePct}%) within ${SUBSIDY_CUSTOMER_RATE_TOLERANCE_PP} pp.`
      )
    }
  }

  annualInterestRatePct = Math.max(0, annualInterestRatePct - rateDiscountBp / 100)

  return {
    annualRate: annualInterestRatePct / 100,
    annualInterestRatePct,
    isStateSubsidized,
    transactionalAnnualRatePct: input.transactionalAnnualRatePct,
    subsidyDurationMonths: subsidy?.subsidyDurationMonths,
    subsidyCustomerRatePct,
    rateDiscountBp
  }
}
