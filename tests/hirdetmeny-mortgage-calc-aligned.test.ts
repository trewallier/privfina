import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import YAML from 'yaml'
import {
  calculateMortgageLoanFromProductSpec,
  computeThmPct,
  expandScheduleToMonthlyPayments,
  loadMortgageLoanProductSpec,
  type MortgageLoanProductCode,
  type MortgageLoanSpecInputs
} from '../src/finance_engine/engine'
import { DEFAULT_PRODUCT_SCHEMA_PATH } from '../src/finance_engine/product_specs/loader'

interface EngineLaneGoldens {
  monthlyPayment: number
  totalCreditCostFees: number
  thmPct: number
  paymentCount: number
}

interface ProductCase {
  productCode: MortgageLoanProductCode
  examplePath: string
  /** Optional discounts active for the representative engine fee package. */
  activeDiscountNames?: string[]
  /** Pinned engine-lane outputs (not §6 packaging fixtures). */
  engineGoldens: EngineLaneGoldens
  /**
   * When true, §6 packaging is quarantined (cannot amortize stated principal).
   * Engine goldens remain authoritative.
   */
  packagingQuarantined?: boolean
}

const CASES: ProductCase[] = [
  {
    productCode: 'otp-1x1',
    examplePath:
      'docs/product-specs/products/loans/otp-1x1/examples/hirdetmeny-representative-used-home.yaml',
    engineGoldens: {
      monthlyPayment: 100298.13848711438,
      totalCreditCostFees: 168765,
      thmPct: 8.494844805898637,
      paymentCount: 240
    }
  },
  {
    productCode: 'otp-zold',
    examplePath:
      'docs/product-specs/products/loans/otp-zold/examples/hirdetmeny-representative-new-home.yaml',
    // Zöld representative packaging waives folyósítási díj under the green fee action.
    activeDiscountNames: ['otp-zold-folyositasi-dij-elengedes'],
    engineGoldens: {
      monthlyPayment: 100298.13848711438,
      totalCreditCostFees: 78765,
      thmPct: 8.384571470360779,
      paymentCount: 240
    }
  },
  {
    productCode: 'vegig-fix',
    examplePath:
      'docs/product-specs/products/loans/vegig-fix/examples/hirdetmeny-representative-used-home.yaml',
    engineGoldens: {
      monthlyPayment: 104062.85064980926,
      totalCreditCostFees: 168765,
      thmPct: 9.039071874579484,
      paymentCount: 240
    }
  },
  {
    productCode: 'csok-plusz',
    examplePath:
      'docs/product-specs/products/loans/csok-plusz/examples/hirdetmeny-representative-home-purchase.yaml',
    engineGoldens: {
      monthlyPayment: 69112.93407683661,
      totalCreditCostFees: 168765,
      thmPct: 3.1977566158446047,
      paymentCount: 240
    }
  },
  {
    productCode: 'falusi-csok',
    examplePath:
      'docs/product-specs/products/loans/falusi-csok/examples/hirdetmeny-representative-used-home.yaml',
    engineGoldens: {
      monthlyPayment: 66551.71174247048,
      totalCreditCostFees: 198765,
      thmPct: 3.2326065418559313,
      paymentCount: 240
    }
  },
  {
    productCode: 'otthon-start',
    examplePath:
      'docs/product-specs/products/loans/otthon-start/examples/hirdetmeny-representative-home-purchase.yaml',
    engineGoldens: {
      monthlyPayment: 69112.93407683661,
      totalCreditCostFees: 108765,
      thmPct: 3.141866492091938,
      paymentCount: 240
    }
  },
  {
    productCode: 'videki-otthonfelujitasi',
    examplePath:
      'docs/product-specs/products/loans/videki-otthonfelujitasi/examples/hirdetmeny-representative-renovation.yaml',
    // §6 installment×term cannot amortize stated principal — packaging quarantined.
    packagingQuarantined: true,
    engineGoldens: {
      monthlyPayment: 126517.46675141586,
      totalCreditCostFees: 168765,
      thmPct: 5.302123678584936,
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

      it('pins engine-lane schedule, fees, and THM goldens (dual-lane vs §6 fixtures)', () => {
        const result = calculateMortgageLoanFromProductSpec(product, {
          ...example.inputs,
          activeDiscountNames: productCase.activeDiscountNames
        })
        const goldens = productCase.engineGoldens

        expect(result.productCode).toBe(productCase.productCode)
        expect(result.paymentCount).toBe(goldens.paymentCount)
        expect(result.paymentCount).toBe(example.expected.paymentCount)
        expect(result.monthlyPayment).toBeCloseTo(goldens.monthlyPayment, 8)
        expect(result.schedule.monthlyInstallment).toBeCloseTo(result.monthlyPayment, 8)
        expect(result.totalCreditCostFees).toBeCloseTo(goldens.totalCreditCostFees, 8)
        expect(result.thmPct).toBeCloseTo(goldens.thmPct, 8)
        expect(result.totalPaid).toBeCloseTo(
          result.totalRepayment + result.totalCreditCostFees,
          6
        )

        // Dual-lane: published §6 figures remain fixtures and may differ from engine.
        expect(Number(example.expected.monthlyPayment)).toBeGreaterThan(0)
        expect(Number(example.expected.totalCreditCostFees)).toBeGreaterThan(0)
        expect(Number(example.expected.thmPct)).toBeGreaterThan(0)
      })

      it('keeps fee-inclusive THM above the zero-fee EAR floor for the same schedule', () => {
        const result = calculateMortgageLoanFromProductSpec(product, {
          ...example.inputs,
          activeDiscountNames: productCase.activeDiscountNames
        })
        const zeroFeeThm = computeThmPct({
          principal: example.inputs.principal,
          upfrontFees: 0,
          monthlyPayments: expandScheduleToMonthlyPayments(result.schedule)
        })

        expect(result.thmPct).toBeGreaterThan(zeroFeeThm.thmPct)
        expect(Number.isFinite(result.thmPct)).toBe(true)
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
        expect(result.totalCreditCostFees).toBeCloseTo(
          result.feePackage.lines.reduce((sum, line) => sum + line.amount, 0),
          8
        )
      })

      if (productCase.packagingQuarantined) {
        it('documents quarantined §6 packaging that cannot amortize stated principal', () => {
          const publishedInstallment = Number(example.expected.monthlyPayment)
          const paymentCount = Number(example.expected.paymentCount)
          const principal = Number(example.inputs.principal)
          const packagingPrincipalCapacity = publishedInstallment * paymentCount

          expect(packagingPrincipalCapacity).toBeLessThan(principal)
          expect(readRepoFile(productCase.examplePath)).toMatch(/QUARANTINED packaging fixture/i)
        })
      }

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
