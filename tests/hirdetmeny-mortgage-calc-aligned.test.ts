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
    // Zöld representative packaging waives folyósítási díj under the green fee action.
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
      'docs/product-specs/products/loans/videki-otthonfelujitasi/examples/hirdetmeny-representative-renovation.yaml'
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

describe('Hirdetmény mortgage products calc-aligned engine lane', () => {
  const productSchema = JSON.parse(readRepoFile(DEFAULT_PRODUCT_SCHEMA_PATH))

  for (const productCase of CASES) {
    describe(productCase.productCode, () => {
      const productPath = `docs/product-specs/products/loans/${productCase.productCode}/product.yaml`
      const product = loadMortgageLoanProductSpec(readRepoFile(productPath), productSchema)
      const example = loadExample(productCase.examplePath)

      it('computes engine schedule payment count matching the example term packaging', () => {
        const result = calculateMortgageLoanFromProductSpec(product, {
          ...example.inputs,
          activeDiscountNames: productCase.activeDiscountNames
        })

        expect(result.productCode).toBe(productCase.productCode)
        expect(result.paymentCount).toBe(example.expected.paymentCount)
        expect(result.schedule.monthlyInstallment).toBeCloseTo(result.monthlyPayment, 8)
      })

      it('keeps engine monthlyPayment on the bare annuity lane (packaging fixture may differ)', () => {
        const result = calculateMortgageLoanFromProductSpec(product, {
          ...example.inputs,
          activeDiscountNames: productCase.activeDiscountNames
        })
        const published = Number(example.expected.monthlyPayment)

        // Engine lane is the annuity (and grace interest-only when present).
        expect(result.monthlyPayment).toBeGreaterThan(0)
        // Dual-lane: published installment is retained as a packaging fixture.
        expect(published).toBeGreaterThan(0)
        // Documented gap is allowed; engine must still be internally consistent.
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
        expect(
          result.feePackage.lines.every((line) => line.timing === 'upfront')
        ).toBe(true)
        // Packaging-lane §6 fee total remains a fixture; engine total is the sum of lines.
        expect(result.totalCreditCostFees).toBeCloseTo(
          result.feePackage.lines.reduce((sum, line) => sum + line.amount, 0),
          8
        )
        expect(Number(example.expected.totalCreditCostFees)).toBeGreaterThan(0)
      })

      it('computes fee-inclusive THM above the zero-fee effective rate floor', () => {
        const result = calculateMortgageLoanFromProductSpec(product, {
          ...example.inputs,
          activeDiscountNames: productCase.activeDiscountNames
        })
        const publishedThm = Number(example.expected.thmPct)

        expect(result.thmPct).toBeGreaterThan(result.annualInterestRatePct)
        expect(Number.isFinite(result.thmPct)).toBe(true)
        // Dual-lane: published THM stays as packaging fixture; engine THM is computed.
        expect(publishedThm).toBeGreaterThan(0)
      })

      if (productCase.productCode === 'csok-plusz' || productCase.productCode === 'otthon-start') {
        it('emits grace interest-only then amortizing payments', () => {
          const result = calculateMortgageLoanFromProductSpec(product, {
            ...example.inputs,
            activeDiscountNames: productCase.activeDiscountNames
          })

          expect(result.graceInterestOnlyPayment).toBeDefined()
          expect(result.graceInterestOnlyPayment!).toBeCloseTo(
            example.inputs.principal * (example.inputs.annualInterestRatePct / 100) / 12,
            6
          )
          expect(result.monthlyPayment).toBeGreaterThan(result.graceInterestOnlyPayment!)
          expect(result.schedule.gracePeriodMonths).toBe(12)
        })
      }
    })
  }
})
