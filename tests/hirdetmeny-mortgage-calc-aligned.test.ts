import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import YAML from 'yaml'
import {
  calculateMortgageLoanFromProductSpec,
  loadMortgageLoanProductSpec,
  type MortgageLoanProductCode,
  type MortgageLoanSpecInputs
} from '../src/finance_engine/engine'
import { DEFAULT_PRODUCT_SCHEMA_PATH } from '../src/finance_engine/product_specs/loader'

interface ProductCase {
  productCode: MortgageLoanProductCode
  examplePath: string
  /** Optional discounts active for the representative engine fee package. */
  activeDiscountNames?: string[]
  /**
   * When true, §6 packaging is quarantined (cannot amortize stated principal).
   * Offering packaging is not applied; commercially-usable stays blocked.
   */
  packagingQuarantined?: boolean
}

const CASES: ProductCase[] = [
  {
    productCode: 'otp-1x1',
    examplePath:
      'docs/product-specs/products/loans/otp-1x1/examples/hirdetmeny-representative-used-home.yaml'
  },
  {
    productCode: 'otp-zold',
    examplePath:
      'docs/product-specs/products/loans/otp-zold/examples/hirdetmeny-representative-new-home.yaml',
    activeDiscountNames: ['otp-zold-folyositasi-dij-elengedes']
  },
  {
    productCode: 'vegig-fix',
    examplePath:
      'docs/product-specs/products/loans/vegig-fix/examples/hirdetmeny-representative-used-home.yaml'
  },
  {
    productCode: 'csok-plusz',
    examplePath:
      'docs/product-specs/products/loans/csok-plusz/examples/hirdetmeny-representative-home-purchase.yaml'
  },
  {
    productCode: 'falusi-csok',
    examplePath:
      'docs/product-specs/products/loans/falusi-csok/examples/hirdetmeny-representative-used-home.yaml'
  },
  {
    productCode: 'otthon-start',
    examplePath:
      'docs/product-specs/products/loans/otthon-start/examples/hirdetmeny-representative-home-purchase.yaml'
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
  const example = YAML.parse(readRepoFile(examplePath)) as {
    inputs: MortgageLoanSpecInputs
    expected: Record<string, number | string>
  }
  return example
}

describe('Hirdetmény mortgage products offering-faithful packaging (ADR 0023 / §5b)', () => {
  const productSchema = JSON.parse(readRepoFile(DEFAULT_PRODUCT_SCHEMA_PATH))

  for (const productCase of CASES) {
    describe(productCase.productCode, () => {
      const productPath = `docs/product-specs/products/loans/${productCase.productCode}/product.yaml`
      const product = loadMortgageLoanProductSpec(readRepoFile(productPath), productSchema)
      const example = loadExample(productCase.examplePath)

      if (productCase.packagingQuarantined) {
        it('stays quarantined: no offeringPackaging until §6 installment reconciles', () => {
          expect(product.pricing?.offeringPackaging).toBeUndefined()
          const publishedInstallment = Number(example.expected.monthlyPayment)
          const paymentCount = Number(example.expected.paymentCount)
          const principal = Number(example.inputs.principal)
          expect(publishedInstallment * paymentCount).toBeLessThan(principal)
          expect(readRepoFile(productCase.examplePath)).toMatch(/QUARANTINED packaging fixture/i)
        })

        it('still computes a customer-rate engine schedule and fee package', () => {
          const result = calculateMortgageLoanFromProductSpec(product, {
            ...example.inputs,
            activeDiscountNames: productCase.activeDiscountNames
          })
          expect(result.paymentCount).toBe(Number(example.expected.paymentCount))
          expect(result.totalCreditCostFees).toBeGreaterThan(0)
          expect(result.monthlyPayment).toBeGreaterThan(0)
        })
        return
      }

      it('matches published installment, fees, and ADR 0022 percentRounded THM', () => {
        expect(product.pricing?.offeringPackaging).toBeDefined()

        const result = calculateMortgageLoanFromProductSpec(product, {
          ...example.inputs,
          activeDiscountNames: productCase.activeDiscountNames
        })

        expect(result.productCode).toBe(productCase.productCode)
        expect(result.paymentCount).toBe(Number(example.expected.paymentCount))
        expect(result.monthlyPayment).toBeCloseTo(Number(example.expected.monthlyPayment), 5)
        expect(result.totalCreditCostFees).toBeCloseTo(
          Number(example.expected.totalCreditCostFees),
          8
        )
        expect(result.thmPct).toBe(Number(example.expected.thmPct))
        expect(result.packagingAnnualRatePct).toBeGreaterThan(result.annualInterestRatePct)
        expect(result.totalPaid).toBeCloseTo(
          result.totalRepayment + result.totalCreditCostFees,
          6
        )
      })

      it('computes an upfront fee package from product-spec fees', () => {
        const result = calculateMortgageLoanFromProductSpec(product, {
          ...example.inputs,
          activeDiscountNames: productCase.activeDiscountNames
        })

        expect(result.feePackage.lines.length).toBeGreaterThan(0)
        expect(result.totalCreditCostFees).toBeGreaterThan(0)
        expect(result.feePackage.lines.every((line) => line.timing === 'upfront')).toBe(true)
        expect(result.totalCreditCostFees).toBeCloseTo(
          result.feePackage.lines.reduce((sum, line) => sum + line.amount, 0),
          8
        )
      })

      if (productCase.productCode === 'csok-plusz' || productCase.productCode === 'otthon-start') {
        it('emits offering-packaged grace then amortizing payments', () => {
          const result = calculateMortgageLoanFromProductSpec(product, {
            ...example.inputs,
            activeDiscountNames: productCase.activeDiscountNames
          })

          expect(result.graceInterestOnlyPayment).toBe(
            Number(example.expected.graceInterestOnlyPayment)
          )
          expect(result.monthlyPayment).toBeCloseTo(Number(example.expected.monthlyPayment), 5)
          expect(result.schedule.gracePeriodMonths).toBe(12)
        })
      }
    })
  }
})
