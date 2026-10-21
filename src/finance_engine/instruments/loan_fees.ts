/**
 * Structured fee and discount application for loan / mortgage-loan product specs (ADR 0021).
 */

export type FeeUnit = 'amount' | 'percent' | 'bp'
export type FeeTiming = 'upfront' | 'periodic' | 'on-event'
export type DiscountType = 'rate-discount' | 'fee-waiver' | 'cashback'
export type DiscountUnit = 'bp' | 'percent' | 'amount'

export interface ProductFeeDefinition {
  name: string
  type: string
  value?: number
  unit?: FeeUnit
  maxAmount?: number
  timing?: FeeTiming
  description?: string
}

export interface ProductDiscountDefinition {
  name: string
  type: DiscountType
  value?: number
  unit?: DiscountUnit
  conditions?: string[]
  /**
   * For fee-waiver discounts: explicit fee names this waiver applies to.
   * When omitted, fee-waivers apply only to fees with type `disbursement`.
   */
  appliesToFeeNames?: string[]
}

export interface FeeApplicationOptions {
  principal: number
  /** Discount names whose fee-waiver / cashback effects should apply. */
  activeDiscountNames?: readonly string[]
  /**
   * Fee names to exclude from the package (default representative profile excludes
   * optional add-ons azonnali-ertekbecsles and egyszeri-kamatcsokkentes-dij).
   */
  excludeFeeNames?: readonly string[]
  /** When true, only timing=upfront fees are included (default true). */
  upfrontOnly?: boolean
}

export interface AppliedFeeLine {
  name: string
  type: string
  timing: FeeTiming
  grossAmount: number
  waiverPercent: number
  amount: number
}

export interface CreditCostPackage {
  lines: AppliedFeeLine[]
  totalCreditCostFees: number
  /** Sum of active rate-discount values in basis points. */
  totalRateDiscountBp: number
}

export const DEFAULT_REPRESENTATIVE_EXCLUDED_FEE_NAMES = [
  'azonnali-ertekbecsles',
  'egyszeri-kamatcsokkentes-dij'
] as const

function ensureNonNegativeFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative finite number.`)
  }
  return value
}

function evaluateGrossFeeAmount(fee: ProductFeeDefinition, principal: number): number {
  const value = fee.value
  if (value === undefined || value === null) {
    return 0
  }

  const unit = fee.unit ?? 'amount'
  let amount: number
  if (unit === 'amount') {
    amount = value
  } else if (unit === 'percent') {
    amount = (principal * value) / 100
  } else if (unit === 'bp') {
    amount = (principal * value) / 10_000
  } else {
    throw new Error(`Unsupported fee unit: ${unit}`)
  }

  if (fee.maxAmount !== undefined && fee.maxAmount !== null) {
    amount = Math.min(amount, ensureNonNegativeFinite(fee.maxAmount, `${fee.name}.maxAmount`))
  }

  return ensureNonNegativeFinite(amount, `${fee.name} amount`)
}

function resolveWaiverPercent(
  fee: ProductFeeDefinition,
  discounts: readonly ProductDiscountDefinition[],
  activeDiscountNames: ReadonlySet<string>
): number {
  let waiverPercent = 0
  for (const discount of discounts) {
    if (discount.type !== 'fee-waiver') {
      continue
    }
    if (!activeDiscountNames.has(discount.name)) {
      continue
    }
    const targetedNames = discount.appliesToFeeNames
    if (targetedNames !== undefined && targetedNames !== null) {
      if (!targetedNames.includes(fee.name)) {
        continue
      }
    } else if (fee.type !== 'disbursement') {
      // Default: unnamed fee-waivers apply only to disbursement fees.
      continue
    }
    const value = discount.value ?? 0
    const unit = discount.unit ?? 'percent'
    if (unit !== 'percent') {
      throw new Error(`Fee waiver ${discount.name} must use unit percent.`)
    }
    waiverPercent = Math.max(waiverPercent, ensureNonNegativeFinite(value, discount.name))
  }
  return Math.min(waiverPercent, 100)
}

function sumRateDiscountBp(
  discounts: readonly ProductDiscountDefinition[],
  activeDiscountNames: ReadonlySet<string>
): number {
  let totalBp = 0
  for (const discount of discounts) {
    if (discount.type !== 'rate-discount') {
      continue
    }
    if (!activeDiscountNames.has(discount.name)) {
      continue
    }
    const value = discount.value ?? 0
    const unit = discount.unit ?? 'bp'
    if (unit !== 'bp') {
      throw new Error(`Rate discount ${discount.name} must use unit bp.`)
    }
    totalBp += ensureNonNegativeFinite(value, discount.name)
  }
  return totalBp
}

/**
 * Apply product-spec fees and selected discounts into an upfront credit-cost package.
 */
export function applyFeesAndDiscounts(
  fees: readonly ProductFeeDefinition[],
  discounts: readonly ProductDiscountDefinition[],
  options: FeeApplicationOptions
): CreditCostPackage {
  const principal = ensureNonNegativeFinite(options.principal, 'principal')
  const activeDiscountNames = new Set(options.activeDiscountNames ?? [])
  const excluded = new Set(
    options.excludeFeeNames ?? DEFAULT_REPRESENTATIVE_EXCLUDED_FEE_NAMES
  )
  const upfrontOnly = options.upfrontOnly !== false

  const lines: AppliedFeeLine[] = []

  for (const fee of fees) {
    const timing: FeeTiming = fee.timing ?? 'upfront'
    if (upfrontOnly && timing !== 'upfront') {
      continue
    }
    if (excluded.has(fee.name)) {
      continue
    }

    const grossAmount = evaluateGrossFeeAmount(fee, principal)
    const waiverPercent = resolveWaiverPercent(fee, discounts, activeDiscountNames)
    const amount = grossAmount * (1 - waiverPercent / 100)

    lines.push({
      name: fee.name,
      type: fee.type,
      timing,
      grossAmount,
      waiverPercent,
      amount
    })
  }

  const totalCreditCostFees = lines.reduce((sum, line) => sum + line.amount, 0)

  return {
    lines,
    totalCreditCostFees,
    totalRateDiscountBp: sumRateDiscountBp(discounts, activeDiscountNames)
  }
}
