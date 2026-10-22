import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import YAML from 'yaml'
import {
  calculateMortgageLoanFromProductSpec,
  calculateThmFromMonthlyRepayments,
  expandScheduleToMonthlyPayments,
  loadMortgageLoanProductSpec,
  type MortgageLoanProductCode,
  type MortgageLoanSpecInputs
} from '../src/finance_engine/engine'
import { DEFAULT_PRODUCT_SCHEMA_PATH } from '../src/finance_engine/product_specs/loader'

/**
 * Representative Hirdetmény examples verify products with three checks (ADR 0024):
 *
 * 1) Engine installment — principal, term, stated interest rate (and grace) must
 *    reproduce the offering monthly payment via ADR 0025 ACT/360 equal-month
 *    (r × (365/12) / 360) + forint rounding.
 *
 * 2) THM from offering numbers — ADR 0022 percentRounded from the offering’s own
 *    repayment vector + fee total must equal stated thmPct.
 *
 * 3) THM from engine payments — ADR 0022 percentRounded from engine-calculated
 *    monthly payments + engine fee package must equal stated thmPct.
 *
 * Fee-package totals must match published `totalCreditCostFees` for non-quarantined
 * offerings (land-registry lines in product YAML). Asserted independently of check 1/3.
 */

interface EnginePins {
  monthlyPayment: number
  totalCreditCostFees: number
  /** ADR 0022 percentRounded from engine schedule + engine fees. */
  thmPctRounded: number
  paymentCount: number
  graceInterestOnlyPayment?: number
}

interface ProductCase {
  productCode: MortgageLoanProductCode
  examplePath: string
  activeDiscountNames?: string[]
  enginePins: EnginePins
  /** When set, check 1 is not yet expected green (should be rare after ADR 0025). */
  installmentGap?: {
    reason: string
  }
  feePackageGap?: {
    reason: string
  }
  /** When set, check 3 THM from engine payments is not yet expected green. */
  check3Gap?: {
    reason: string
  }
  packagingQuarantined?: boolean
}

const CASES: ProductCase[] = [
  {
    productCode: 'otp-1x1',
    examplePath:
      'docs/product-specs/products/loans/otp-1x1/examples/hirdetmeny-representative-used-home.yaml',
    enginePins: {
      monthlyPayment: 101128,
      totalCreditCostFees: 193965,
      thmPctRounded: 8.6,
      paymentCount: 240
    }
  },
  {
    productCode: 'otp-zold',
    examplePath:
      'docs/product-specs/products/loans/otp-zold/examples/hirdetmeny-representative-new-home.yaml',
    activeDiscountNames: ['otp-zold-folyositasi-dij-elengedes'],
    enginePins: {
      monthlyPayment: 101128,
      totalCreditCostFees: 89365,
      thmPctRounded: 8.5,
      paymentCount: 240
    }
  },
  {
    productCode: 'vegig-fix',
    examplePath:
      'docs/product-specs/products/loans/vegig-fix/examples/hirdetmeny-representative-used-home.yaml',
    enginePins: {
      monthlyPayment: 104960,
      totalCreditCostFees: 193965,
      thmPctRounded: 9.2,
      paymentCount: 240
    }
  },
  {
    productCode: 'csok-plusz',
    examplePath:
      'docs/product-specs/products/loans/csok-plusz/examples/hirdetmeny-representative-home-purchase.yaml',
    enginePins: {
      monthlyPayment: 69362,
      totalCreditCostFees: 193965,
      thmPctRounded: 3.3,
      paymentCount: 240,
      graceInterestOnlyPayment: 30416
    }
  },
  {
    productCode: 'falusi-csok',
    examplePath:
      'docs/product-specs/products/loans/falusi-csok/examples/hirdetmeny-representative-used-home.yaml',
    enginePins: {
      monthlyPayment: 66802,
      totalCreditCostFees: 223965,
      thmPctRounded: 3.3,
      paymentCount: 240
    }
  },
  {
    productCode: 'otthon-start',
    examplePath:
      'docs/product-specs/products/loans/otthon-start/examples/hirdetmeny-representative-home-purchase.yaml',
    enginePins: {
      monthlyPayment: 69362,
      totalCreditCostFees: 133965,
      thmPctRounded: 3.2,
      paymentCount: 240,
      graceInterestOnlyPayment: 30416
    }
  },
  {
    productCode: 'videki-otthonfelujitasi',
    examplePath:
      'docs/product-specs/products/loans/videki-otthonfelujitasi/examples/hirdetmeny-representative-renovation.yaml',
    packagingQuarantined: true,
    enginePins: {
      monthlyPayment: 126913,
      totalCreditCostFees: 168765,
      thmPctRounded: 5.4,
      paymentCount: 120
    }
  }
]

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

function loadExample(examplePath: string): {
  inputs: MortgageLoanSpecInputs
  expected: Record<string, number | string>
} {
  return YAML.parse(readRepoFile(examplePath)) as {
    inputs: MortgageLoanSpecInputs
    expected: Record<string, number | string>
  }
}

function offeringMonthlyPayments(example: {
  inputs: MortgageLoanSpecInputs
  expected: Record<string, number | string>
}): number[] {
  const paymentCount = Number(example.expected.paymentCount)
  const monthlyPayment = Number(example.expected.monthlyPayment)
  const graceMonths = Number(example.inputs.gracePeriodMonths ?? 0)
  const gracePayment =
    example.expected.graceInterestOnlyPayment !== undefined
      ? Number(example.expected.graceInterestOnlyPayment)
      : undefined

  const payments: number[] = []
  if (graceMonths > 0) {
    if (gracePayment === undefined) {
      throw new Error('Grace products require expected.graceInterestOnlyPayment for check 2.')
    }
    for (let i = 0; i < graceMonths; i += 1) {
      payments.push(gracePayment)
    }
  }
  for (let i = payments.length; i < paymentCount; i += 1) {
    payments.push(monthlyPayment)
  }
  return payments
}

function expectEnginePins(
  result: ReturnType<typeof calculateMortgageLoanFromProductSpec>,
  pins: EnginePins
): void {
  expect(result.paymentCount).toBe(pins.paymentCount)
  expect(result.monthlyPayment).toBe(pins.monthlyPayment)
  expect(result.totalCreditCostFees).toBe(pins.totalCreditCostFees)
  expect(result.thmPct).toBe(pins.thmPctRounded)
  if (pins.graceInterestOnlyPayment !== undefined) {
    expect(result.graceInterestOnlyPayment).toBe(pins.graceInterestOnlyPayment)
  }
}

describe('Hirdetmény representative example verification (ADR 0024)', () => {
  const productSchema = JSON.parse(readRepoFile(DEFAULT_PRODUCT_SCHEMA_PATH))

  for (const productCase of CASES) {
    describe(productCase.productCode, () => {
      const productPath = `docs/product-specs/products/loans/${productCase.productCode}/product.yaml`
      const product = loadMortgageLoanProductSpec(readRepoFile(productPath), productSchema)
      const example = loadExample(productCase.examplePath)

      it('uses ADR 0025 ACT/360 equal-month day-count and forint payment rounding', () => {
        expect(product.engine.interestDayCountConvention).toBe('act/360')
        expect(product.engine.paymentRounding).toBe('forint')
      })

      if (productCase.packagingQuarantined) {
        it('quarantines inconsistent §6 packaging (installment×term < principal)', () => {
          const publishedInstallment = Number(example.expected.monthlyPayment)
          const paymentCount = Number(example.expected.paymentCount)
          const principal = Number(example.inputs.principal)
          expect(publishedInstallment * paymentCount).toBeLessThan(principal)
          expect(readRepoFile(productCase.examplePath)).toMatch(/QUARANTINED packaging fixture/i)
        })

        it('pins stated-rate engine schedule and fees beside packaging quarantine', () => {
          const result = calculateMortgageLoanFromProductSpec(product, {
            ...example.inputs,
            activeDiscountNames: productCase.activeDiscountNames
          })
          expectEnginePins(result, productCase.enginePins)
        })
        return
      }

      it('check 1: engine reproduces offering installment from amount, term, and interest rate', () => {
        const result = calculateMortgageLoanFromProductSpec(product, {
          ...example.inputs,
          activeDiscountNames: productCase.activeDiscountNames
        })
        const published = Number(example.expected.monthlyPayment)

        expect(result.monthlyPayment).toBe(productCase.enginePins.monthlyPayment)
        expect(result.paymentCount).toBe(productCase.enginePins.paymentCount)
        if (productCase.enginePins.graceInterestOnlyPayment !== undefined) {
          expect(result.graceInterestOnlyPayment).toBe(
            productCase.enginePins.graceInterestOnlyPayment
          )
        }

        if (productCase.installmentGap) {
          expect(result.monthlyPayment).not.toBe(published)
          expect(productCase.installmentGap.reason.length).toBeGreaterThan(20)
          return
        }

        expect(result.monthlyPayment).toBe(published)
        if (example.expected.graceInterestOnlyPayment !== undefined) {
          expect(result.graceInterestOnlyPayment).toBe(
            Number(example.expected.graceInterestOnlyPayment)
          )
        }
      })

      it('check 2: law-based THM reproduces stated thmPct from offering numbers', () => {
        const thm = calculateThmFromMonthlyRepayments({
          principal: example.inputs.principal,
          upfrontFees: Number(example.expected.totalCreditCostFees),
          monthlyPayments: offeringMonthlyPayments(example)
        })
        expect(thm.percentRounded).toBe(Number(example.expected.thmPct))
      })

      it('documents engine vs published fee-package delta independently', () => {
        const result = calculateMortgageLoanFromProductSpec(product, {
          ...example.inputs,
          activeDiscountNames: productCase.activeDiscountNames
        })
        const publishedFees = Number(example.expected.totalCreditCostFees)

        expect(result.totalCreditCostFees).toBe(productCase.enginePins.totalCreditCostFees)

        if (productCase.feePackageGap) {
          expect(result.totalCreditCostFees).not.toBe(publishedFees)
          expect(productCase.feePackageGap.reason.length).toBeGreaterThan(20)
          return
        }

        expect(result.totalCreditCostFees).toBe(publishedFees)
      })

      it('check 3: law-based THM reproduces stated thmPct from engine monthly payments', () => {
        const result = calculateMortgageLoanFromProductSpec(product, {
          ...example.inputs,
          activeDiscountNames: productCase.activeDiscountNames
        })
        const enginePayments = expandScheduleToMonthlyPayments(result.schedule)
        const thm = calculateThmFromMonthlyRepayments({
          principal: example.inputs.principal,
          upfrontFees: result.totalCreditCostFees,
          monthlyPayments: enginePayments
        })

        expect(result.thmPct).toBe(thm.percentRounded)
        expect(result.thmPct).toBe(productCase.enginePins.thmPctRounded)

        const publishedThm = Number(example.expected.thmPct)
        if (productCase.installmentGap || productCase.check3Gap) {
          expect(productCase.check3Gap?.reason.length ?? productCase.installmentGap?.reason.length ?? 0).toBeGreaterThan(
            20
          )
          expect(thm.percentRounded).not.toBe(publishedThm)
          return
        }

        // Check 3 is THM identity; fee totals are asserted separately (may still gap).
        expect(thm.percentRounded).toBe(publishedThm)
      })
    })
  }
})
