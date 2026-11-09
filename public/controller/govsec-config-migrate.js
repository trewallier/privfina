/**
 * One-shot migration for government-security instrument configs saved under the
 * pre-ADR-0038 / pre-v2alpha2 input contract (base+premium, optional maturity).
 *
 * New commercial contract: effective annualCouponRatePct + required maturityDate.
 */

function toFiniteNumber(value) {
  if (value === undefined || value === null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * Compose legacy BMÁP rate inputs into effective annualCouponRatePct.
 * Prefers an already-present annualCouponRatePct.
 */
export function migrateBmapConfigForEdit(config = {}) {
  const next = { ...config }
  const existing = toFiniteNumber(next.annualCouponRatePct)
  if (existing != null) {
    next.annualCouponRatePct = existing
  } else {
    const base = toFiniteNumber(next.dkjBaseYieldPct)
    const premium = toFiniteNumber(next.interestPremiumPct)
    if (base != null || premium != null) {
      next.annualCouponRatePct = (base ?? 0) + (premium ?? 0)
    }
  }
  delete next.dkjBaseYieldPct
  delete next.interestPremiumPct
  // Maturity must come from the saved config or series autofill — never invent +6y.
  next.maturityDate = next.maturityDate || next.dueDate || ''
  delete next.startDate
  return next
}

/**
 * Compose legacy PMÁP rate inputs into effective annualCouponRatePct.
 * Supports inflation + premium when that was the stored shape.
 */
export function migratePmapConfigForEdit(config = {}) {
  const next = { ...config }
  const existing = toFiniteNumber(next.annualCouponRatePct)
  if (existing != null) {
    next.annualCouponRatePct = existing
  } else {
    const inflation = toFiniteNumber(
      next.previousYearAverageInflationPct ?? next.inflationPct ?? next.yearlyInflation
    )
    const premium = toFiniteNumber(next.interestPremiumPct ?? next.spreadRate)
    if (inflation != null || premium != null) {
      next.annualCouponRatePct = (inflation ?? 0) + (premium ?? 0)
    }
  }
  delete next.previousYearAverageInflationPct
  delete next.inflationPct
  delete next.interestPremiumPct
  next.maturityDate = next.maturityDate || next.dueDate || ''
  delete next.startDate
  return next
}

/**
 * Normalize FixMÁP configs for edit (ADR 0038 effective rate + maturity).
 * FixMÁP never used inflation+premium storage; keep annualCouponRatePct as-is.
 */
export function migrateFixmapConfigForEdit(config = {}) {
  const next = { ...config }
  const existing = toFiniteNumber(next.annualCouponRatePct)
  if (existing != null) {
    next.annualCouponRatePct = existing
  }
  next.maturityDate = next.maturityDate || next.dueDate || ''
  delete next.startDate
  return next
}

/**
 * Normalize MÁP Plusz configs for edit (ADR 0038 effective rate + maturity).
 * MÁP Plusz never used inflation+premium storage; keep annualCouponRatePct as-is.
 */
export function migrateMappConfigForEdit(config = {}) {
  const next = { ...config }
  const existing = toFiniteNumber(next.annualCouponRatePct)
  if (existing != null) {
    next.annualCouponRatePct = existing
  }
  next.maturityDate = next.maturityDate || next.dueDate || ''
  delete next.startDate
  return next
}
