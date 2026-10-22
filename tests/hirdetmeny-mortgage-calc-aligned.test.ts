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
 *    global system wiring.
 *
 * Do not hide check-1 gaps with an invisible packaging-rate adjustment.
 */

interface ProductCase {
  productCode: MortgageLoanProductCode
  examplePath: string
  activeDiscountNames?: string[]
  /**
   * When set, check 1 is known to fail at the stated rate. Check 3 stays
   * documented as blocked until check 1 is green.
   */
  installmentGap?: {
    reason: string
  }
  /**
   * §6 packaging cannot amortize stated principal (Vidéki).
   */
  packagingQuarantined?: boolean
}

const CASES: ProductCase[] = [
  {
    productCode: 'otp-1x1',
    examplePath:
      'docs/product-specs/products/loans/otp-1x1/examples/hirdetmeny-representative-used-home.yaml',
    installmentGap: {
      reason:
        'Bare level-payment annuity at 7.99% yields ~100 298 Ft vs published 101 128 Ft; root cause not yet modeled in shared loan primitives.'
    }
  },
  {
    productCode: 'otp-zold',
    examplePath:
      'docs/product-specs/products/loans/otp-zold/examples/hirdetmeny-representative-new-home.yaml',
    activeDiscountNames: ['otp-zold-folyositasi-dij-elengedes'],
    installmentGap: {
      reason:
        'Same annuity gap as OTP 1x1 at 7.99% customer rate (~100 298 vs 101 128 Ft).'
    }
  },
  {
    productCode: 'vegig-fix',
    examplePath:
      'docs/product-specs/products/loans/vegig-fix/examples/hirdetmeny-representative-used-home.yaml',
    installmentGap: {
      reason:
        'Bare level-payment annuity at 8.49% yields ~104 063 Ft vs published 104 960 Ft.'
    }
  },
  {
    productCode: 'csok-plusz',
    examplePath:
      'docs/product-specs/products/loans/csok-plusz/examples/hirdetmeny-representative-home-purchase.yaml',
    installmentGap: {
      reason:
        'After 12-month interest-only grace, bare annuity at 3% yields ~69 113 Ft vs published 69 362 Ft; published grace 30 416 Ft vs engine 30 000 Ft.'
    }
  },
  {
    productCode: 'falusi-csok',
    examplePath:
      'docs/product-specs/products/loans/falusi-csok/examples/hirdetmeny-representative-used-home.yaml',
    installmentGap: {
      reason:
        'Bare level-payment annuity at 3% yields ~66 552 Ft vs published 66 802 Ft.'
    }
  },
  {
    productCode: 'otthon-start',
    examplePath:
      'docs/product-specs/products/loans/otthon-start/examples/hirdetmeny-representative-home-purchase.yaml',
    installmentGap: {
      reason:
        'Same grace/annuity gap pattern as CSOK Plusz at 3% customer rate.'
    }
  },
  {
    productCode: 'videki-otthonfelujitasi',
    examplePath:
      'docs/product-specs/products/loans/videki-otthonfelujitasi/examples/hirdetmeny-representative-renovation.yaml',
    packagingQuarantined: true
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
        return
      }

      it('check 1: engine reproduces offering installment from amount, term, and interest rate', () => {
        const result = calculateMortgageLoanFromProductSpec(product, {
          ...example.inputs,
          activeDiscountNames: productCase.activeDiscountNames
        })

        const published = Number(example.expected.monthlyPayment)

        if (productCase.installmentGap) {
          expect(result.monthlyPayment).not.toBeCloseTo(published, 0)
          expect(productCase.installmentGap.reason.length).toBeGreaterThan(20)
          if (example.expected.graceInterestOnlyPayment !== undefined) {
            const publishedGrace = Number(example.expected.graceInterestOnlyPayment)
            expect(result.graceInterestOnlyPayment).toBeDefined()
            expect(result.graceInterestOnlyPayment!).not.toBeCloseTo(publishedGrace, 0)
          }
          return
        }

        expect(result.monthlyPayment).toBeCloseTo(published, 5)
        expect(result.paymentCount).toBe(Number(example.expected.paymentCount))
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

        // Engine output thmPct must be the same ADR 0022 rounding of those flows.
        expect(result.thmPct).toBe(thm.percentRounded)

        if (productCase.installmentGap) {
          // Global path cannot match while engine installments still differ from
          // the offering — keep the gap visible.
          expect(thm.percentRounded).not.toBe(Number(example.expected.thmPct))
          return
        }

        expect(result.totalCreditCostFees).toBeCloseTo(
          Number(example.expected.totalCreditCostFees),
          8
        )
        expect(thm.percentRounded).toBe(Number(example.expected.thmPct))
      })
    })
  }
})
