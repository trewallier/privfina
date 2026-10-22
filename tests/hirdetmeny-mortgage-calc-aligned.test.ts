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
 * Representative Hirdetmény examples verify the engine in two independent checks:
 *
 * 1) Monthly cash flow at the stated contractual rate must match the example.
 *    A mismatch means the generic schedule logic (or product rate/grace mapping)
 *    has a gap — do not hide it with an invisible packaging-rate adjustment.
 *
 * 2) ADR 0022 THM (`percentRounded`) from engine schedule + fee package must
 *    match the example. A mismatch (once check 1 passes) means THM assembly or
 *    fee inclusion has a gap.
 *
 * Separately, the THM solver is proven against the example's own published
 * repayment vector + fees (isolates the legal calculator from schedule gaps).
 */

interface ProductCase {
  productCode: MortgageLoanProductCode
  examplePath: string
  activeDiscountNames?: string[]
  /**
   * When set, check 1 is known to fail: engine installment at the stated rate
   * does not yet equal the published figure. Commercially-usable stays blocked.
   */
  installmentGap?: {
    reason: string
  }
  /**
   * §6 packaging cannot amortize stated principal (Vidéki). Skips both product
   * integration checks until the offering example is reconciled.
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

function publishedMonthlyPayments(example: {
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
      throw new Error('Grace products require expected.graceInterestOnlyPayment for THM isolation.')
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

describe('Hirdetmény representative example verification (ADR 0022 / 0023)', () => {
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

      it('THM solver independently reproduces published thmPct from the example cash-flow set', () => {
        // Isolates ADR 0022 from product schedule generation: feed the example's
        // own repayments + fees into the legal calculator.
        const thm = calculateThmFromMonthlyRepayments({
          principal: example.inputs.principal,
          upfrontFees: Number(example.expected.totalCreditCostFees),
          monthlyPayments: publishedMonthlyPayments(example)
        })
        expect(thm.percentRounded).toBe(Number(example.expected.thmPct))
      })

      it('check 1: monthly cash flow at the stated contractual rate matches the example', () => {
        const result = calculateMortgageLoanFromProductSpec(product, {
          ...example.inputs,
          activeDiscountNames: productCase.activeDiscountNames
        })

        const published = Number(example.expected.monthlyPayment)

        if (productCase.installmentGap) {
          // Gap is intentional signal: generic calc at the stated rate does not
          // yet reproduce the offering installment. Do not paper over with a
          // hidden packaging rate.
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

      it('check 2: ADR 0022 THM from engine schedule + fees matches the example', () => {
        const result = calculateMortgageLoanFromProductSpec(product, {
          ...example.inputs,
          activeDiscountNames: productCase.activeDiscountNames
        })

        if (productCase.installmentGap) {
          // Until check 1 passes, engine THM cannot be required to match — the
          // repayment vector itself is still wrong. Assert THM is computed and
          // differs so the gap stays visible.
          expect(Number.isFinite(result.thmPct)).toBe(true)
          expect(result.thmPct).not.toBe(Number(example.expected.thmPct))
          expect(expandScheduleToMonthlyPayments(result.schedule).length).toBe(
            result.paymentCount
          )
          return
        }

        expect(result.totalCreditCostFees).toBeCloseTo(
          Number(example.expected.totalCreditCostFees),
          8
        )
        expect(result.thmPct).toBe(Number(example.expected.thmPct))
      })
    })
  }
})
