/**
 * Browser dual-surface of `src/finance_engine/instruments/loan_fees.ts` (ADR 0017 / 0021).
 * Keep behavior aligned with the TypeScript primitive until bundler convergence.
 */

const DEFAULT_REPRESENTATIVE_EXCLUDED_FEE_NAMES = [
  'azonnali-ertekbecsles',
  'egyszeri-kamatcsokkentes-dij'
]

function ensureNonNegativeFinite(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative finite number.`)
  }
  return value
}

function evaluateGrossFeeAmount(fee, principal) {
  const value = fee.value
  if (value === undefined || value === null) {
    return 0
  }

  const unit = fee.unit ?? 'amount'
  let amount
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

function resolveWaiverPercent(fee, discounts, activeDiscountNames) {
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

function sumRateDiscountBp(discounts, activeDiscountNames) {
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
function applyFeesAndDiscounts(fees, discounts, options) {
  const principal = ensureNonNegativeFinite(options.principal, 'principal')
  const activeDiscountNames = new Set(options.activeDiscountNames ?? [])
  const excluded = new Set(options.excludeFeeNames ?? DEFAULT_REPRESENTATIVE_EXCLUDED_FEE_NAMES)
  const upfrontOnly = options.upfrontOnly !== false

  const lines = []

  for (const fee of fees) {
    const timing = fee.timing ?? 'upfront'
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

export { DEFAULT_REPRESENTATIVE_EXCLUDED_FEE_NAMES, applyFeesAndDiscounts }
