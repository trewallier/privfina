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
 *    reproduce the offering monthly payment. Checks the engine.
 *
 * 2) THM from offering numbers — ADR 0022 percentRounded from the offering’s own
 *    repayment vector + fee total must equal stated thmPct. Checks THM logic and
 *    fee gaps, independent of engine schedule generation.
 *
 * 3) THM from engine payments — ADR 0022 percentRounded from engine-calculated
 *    monthly payments + engine fee package must equal stated thmPct. Checks
 *    global system wiring (schedule fidelity AND fee-package fidelity).
 *
 * While a check is not yet green, pin the current engine outputs so regressions
 * fail the suite, and keep published deltas visible.
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
  /** Stated-rate engine outputs to pin (regression guard). */
  enginePins: EnginePins
  installmentGap?: {
    reason: string
  }
  feePackageGap?: {
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
      monthlyPayment: 100298.13848711438,
      totalCreditCostFees: 168765,
      thmPctRounded: 8.5,
      paymentCount: 240
    },
    installmentGap: {
      reason:
        'Bare level-payment annuity at 7.99% yields ~100 298 Ft vs published 101 128 Ft; root cause not yet modeled in shared loan primitives.'
    },
    feePackageGap: {
      reason: 'Engine representative fees 168 765 Ft vs published 193 965 Ft (Δ −25 200).'
    }
  },
  {
    productCode: 'otp-zold',
    examplePath:
      'docs/product-specs/products/loans/otp-zold/examples/hirdetmeny-representative-new-home.yaml',
    activeDiscountNames: ['otp-zold-folyositasi-dij-elengedes'],
    enginePins: {
      monthlyPayment: 100298.13848711438,
      totalCreditCostFees: 78765,
      thmPctRounded: 8.4,
      paymentCount: 240
    },
    installmentGap: {
      reason:
        'Same annuity gap as OTP 1x1 at 7.99% customer rate (~100 298 vs 101 128 Ft).'
    },
    feePackageGap: {
      reason: 'Engine representative fees 78 765 Ft vs published 89 365 Ft (Δ −10 600).'
    }
  },
  {
    productCode: 'vegig-fix',
    examplePath:
      'docs/product-specs/products/loans/vegig-fix/examples/hirdetmeny-representative-used-home.yaml',
    enginePins: {
      monthlyPayment: 104062.85064980926,
      totalCreditCostFees: 168765,
      thmPctRounded: 9.0,
      paymentCount: 240
    },
    installmentGap: {
      reason:
        'Bare level-payment annuity at 8.49% yields ~104 063 Ft vs published 104 960 Ft.'
    },
    feePackageGap: {
      reason: 'Engine representative fees 168 765 Ft vs published 193 965 Ft (Δ −25 200).'
    }
  },
  {
    productCode: 'csok-plusz',
    examplePath:
      'docs/product-specs/products/loans/csok-plusz/examples/hirdetmeny-representative-home-purchase.yaml',
    enginePins: {
      monthlyPayment: 69112.93407683661,
      totalCreditCostFees: 168765,
      thmPctRounded: 3.2,
      paymentCount: 240,
      graceInterestOnlyPayment: 30000
    },
    installmentGap: {
      reason:
        'After 12-month interest-only grace, bare annuity at 3% yields ~69 113 Ft vs published 69 362 Ft; published grace 30 416 Ft vs engine 30 000 Ft.'
    },
    feePackageGap: {
      reason:
        'Engine representative fees 168 765 Ft vs published 193 965 Ft (Δ −25 200); fee gap alone blocks check 3 even with published installments.'
    }
  },
  {
    productCode: 'falusi-csok',
    examplePath:
      'docs/product-specs/products/loans/falusi-csok/examples/hirdetmeny-representative-used-home.yaml',
    enginePins: {
      monthlyPayment: 66551.71174247048,
      totalCreditCostFees: 198765,
      thmPctRounded: 3.2,
      paymentCount: 240
    },
    installmentGap: {
      reason:
        'Bare level-payment annuity at 3% yields ~66 552 Ft vs published 66 802 Ft.'
    },
    feePackageGap: {
      reason:
        'Engine representative fees 198 765 Ft vs published 223 965 Ft (Δ −25 200); aligning fees alone would already round THM to 3.3.'
    }
  },
  {
    productCode: 'otthon-start',
    examplePath:
      'docs/product-specs/products/loans/otthon-start/examples/hirdetmeny-representative-home-purchase.yaml',
    enginePins: {
      monthlyPayment: 69112.93407683661,
      totalCreditCostFees: 108765,
      thmPctRounded: 3.1,
      paymentCount: 240,
      graceInterestOnlyPayment: 30000
    },
    installmentGap: {
      reason:
        'Same grace/annuity gap pattern as CSOK Plusz at 3% customer rate.'
    },
    feePackageGap: {
      reason:
        'Engine representative fees 108 765 Ft vs published 133 965 Ft (Δ −25 200); aligning fees alone would already round THM to 3.2.'
    }
  },
  {
    productCode: 'videki-otthonfelujitasi',
    examplePath:
      'docs/product-specs/products/loans/videki-otthonfelujitasi/examples/hirdetmeny-representative-renovation.yaml',
    packagingQuarantined: true,
    enginePins: {
      monthlyPayment: 126517.46675141586,
      totalCreditCostFees: 168765,
      thmPctRounded: 5.3,
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
  expect(result.monthlyPayment).toBeCloseTo(pins.monthlyPayment, 8)
  expect(result.totalCreditCostFees).toBe(pins.totalCreditCostFees)
  expect(result.thmPct).toBe(pins.thmPctRounded)
  if (pins.graceInterestOnlyPayment !== undefined) {
    expect(result.graceInterestOnlyPayment).toBeCloseTo(pins.graceInterestOnlyPayment, 8)
  }
}

describe('Hirdetmény representative example verification (ADR 0024)', () => {
  const productSchema = JSON.parse(readRepoFile(DEFAULT_PRODUCT_SCHEMA_PATH))

  for (const productCase of CASES) {
    describe(productCase.productCode, () => {
      const productPath = `docs/product-specs/products/loans/${productCase.productCode}/product.yaml`
      const product = loadMortgageLoanProductSpec(readRepoFile(productPath), productSchema)
      const example = loadExample(productCase.examplePath)

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

        // Always pin stated-rate engine math so regressions fail even while gapped.
        expect(result.monthlyPayment).toBeCloseTo(productCase.enginePins.monthlyPayment, 8)
        expect(result.paymentCount).toBe(productCase.enginePins.paymentCount)
        if (productCase.enginePins.graceInterestOnlyPayment !== undefined) {
          expect(result.graceInterestOnlyPayment).toBeCloseTo(
            productCase.enginePins.graceInterestOnlyPayment,
            8
          )
        }

        if (productCase.installmentGap) {
          expect(result.monthlyPayment).not.toBeCloseTo(published, 0)
          expect(productCase.installmentGap.reason.length).toBeGreaterThan(20)
          if (example.expected.graceInterestOnlyPayment !== undefined) {
            expect(result.graceInterestOnlyPayment!).not.toBeCloseTo(
              Number(example.expected.graceInterestOnlyPayment),
              0
            )
          }
          return
        }

        expect(result.monthlyPayment).toBeCloseTo(published, 5)
        if (example.expected.graceInterestOnlyPayment !== undefined) {
          expect(result.graceInterestOnlyPayment).toBeCloseTo(
            Number(example.expected.graceInterestOnlyPayment),
            5
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

        expect(result.totalCreditCostFees).toBeCloseTo(publishedFees, 8)
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
        if (productCase.installmentGap || productCase.feePackageGap) {
          // Check 3 needs both schedule fidelity and fee-package fidelity.
          expect(thm.percentRounded).not.toBe(publishedThm)
          return
        }

        expect(result.totalCreditCostFees).toBeCloseTo(
          Number(example.expected.totalCreditCostFees),
          8
        )
        expect(thm.percentRounded).toBe(publishedThm)
      })
    })
  }
})
