import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import YAML from 'yaml'
import {
  COMMERCIAL_LOAN_PRODUCTS,
  findCommercialLoanProduct
} from '../public/controller/commercial-loan-product-metadata.js'
import { getCommercialLoanCommercialBlocks } from '../public/controller/commercial-loan-commercial-blocks.js'
import {
  calculateCommercialLoanPackage,
  mapCommercialLoanSpecInputsToLegacyLoanBundleInput
} from '../public/controller/commercial-loan-calculation-adapter.js'
import { mapFormDataToCommercialLoanSpecInputs } from '../public/controller/commercial-loan-form.js'
import { createLoanRepaymentPreview, generateLoanInstrumentBundle } from '../public/instruments.js'

const ELIGIBLE_CODES = [
  'otp-1x1',
  'otp-zold',
  'vegig-fix',
  'csok-plusz',
  'falusi-csok',
  'otthon-start'
] as const

const EXAMPLE_PATHS: Record<string, string> = {
  'otp-1x1':
    'docs/product-specs/products/loans/otp-1x1/examples/hirdetmeny-representative-used-home.yaml',
  'otp-zold':
    'docs/product-specs/products/loans/otp-zold/examples/hirdetmeny-representative-new-home.yaml',
  'vegig-fix':
    'docs/product-specs/products/loans/vegig-fix/examples/hirdetmeny-representative-used-home.yaml',
  'csok-plusz':
    'docs/product-specs/products/loans/csok-plusz/examples/hirdetmeny-representative-home-purchase.yaml',
  'falusi-csok':
    'docs/product-specs/products/loans/falusi-csok/examples/hirdetmeny-representative-used-home.yaml',
  'otthon-start':
    'docs/product-specs/products/loans/otthon-start/examples/hirdetmeny-representative-home-purchase.yaml'
}

const DEFAULT_ACTIVE: Record<string, string[]> = {
  'otp-zold': ['otp-zold-folyositasi-dij-elengedes']
}

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

function loadYaml(relativePath: string): Record<string, unknown> {
  return YAML.parse(readRepoFile(relativePath)) as Record<string, unknown>
}

describe('commercial loan composer parity (§5b commercially-usable gate)', () => {
  it('marks the six non-quarantined products commercially-usable and keeps Vidéki blocked', () => {
    for (const code of ELIGIBLE_CODES) {
      const product = findCommercialLoanProduct(code)
      expect(product?.migrationStatus).toBe('commercially-usable')
      expect(product?.commerciallyBlockedReason).toBeNull()
    }
    const videki = findCommercialLoanProduct('videki-otthonfelujitasi')
    expect(videki?.migrationStatus).toBe('schedule-usable')
    expect(videki?.commerciallyBlockedReason).toMatch(/THM match|reconciled/i)
  })

  it.each(ELIGIBLE_CODES)(
    '%s: composer package reproduces published example thmPct and fee total',
    (productCode) => {
      const example = loadYaml(EXAMPLE_PATHS[productCode]) as {
        inputs: {
          principal: number
          annualInterestRatePct: number
          termMonths: number
          startDate: string
          loanPurpose?: string
          gracePeriodMonths?: number
        }
        expected: { thmPct: number; totalCreditCostFees: number; monthlyPayment: number }
      }
      const product = findCommercialLoanProduct(productCode)!
      const packaged = calculateCommercialLoanPackage(
        {
          productCode,
          principal: example.inputs.principal,
          annualInterestRatePct: example.inputs.annualInterestRatePct,
          termMonths: example.inputs.termMonths,
          startDate: example.inputs.startDate,
          loanPurpose: example.inputs.loanPurpose,
          gracePeriodMonths:
            example.inputs.gracePeriodMonths ?? product.defaultGracePeriodMonths,
          activeDiscountNames: DEFAULT_ACTIVE[productCode] ?? []
        },
        { createLoanRepaymentPreview }
      )

      expect(packaged.monthlyPayment).toBe(example.expected.monthlyPayment)
      expect(packaged.totalCreditCostFees).toBe(example.expected.totalCreditCostFees)
      expect(packaged.thmPct).toBe(example.expected.thmPct)
    }
  )

  it.each(COMMERCIAL_LOAN_PRODUCTS.map((entry) => entry.productCode))(
    '%s: commercial-block upfront fees and selectable discounts match product YAML',
    (productCode) => {
      const yaml = loadYaml(
        `docs/product-specs/products/loans/${productCode}/product.yaml`
      ) as {
        fees?: Array<Record<string, unknown>>
        discounts?: Array<Record<string, unknown>>
      }
      const blocks = getCommercialLoanCommercialBlocks(productCode)

      const yamlFees = (yaml.fees || [])
        .filter((fee) => (fee.timing ?? 'upfront') === 'upfront')
        .map((fee) => ({
          name: fee.name,
          type: fee.type,
          value: fee.value,
          unit: fee.unit,
          maxAmount: fee.maxAmount,
          timing: fee.timing ?? 'upfront'
        }))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)))

      const blockFees = blocks.fees
        .map((fee: Record<string, unknown>) => ({
          name: fee.name,
          type: fee.type,
          value: fee.value,
          unit: fee.unit,
          maxAmount: fee.maxAmount,
          timing: fee.timing ?? 'upfront'
        }))
        .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name))

      expect(blockFees).toEqual(yamlFees)

      const yamlDiscounts = (yaml.discounts || [])
        .filter((discount) => discount.type === 'fee-waiver' || discount.type === 'rate-discount')
        .map((discount) => ({
          name: discount.name,
          type: discount.type,
          value: discount.value,
          unit: discount.unit,
          appliesToFeeNames: discount.appliesToFeeNames
        }))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)))

      const blockDiscounts = blocks.discounts
        .map((discount: Record<string, unknown>) => ({
          name: discount.name,
          type: discount.type,
          value: discount.value,
          unit: discount.unit,
          appliesToFeeNames: discount.appliesToFeeNames
        }))
        .sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name))

      expect(blockDiscounts).toEqual(yamlDiscounts)
    }
  )

  it.each(ELIGIBLE_CODES)(
    '%s: form → adapter → bundle stamps productId and commercial packaging fields',
    (productCode) => {
      const product = findCommercialLoanProduct(productCode)!
      const example = loadYaml(EXAMPLE_PATHS[productCode]) as {
        inputs: {
          principal: number
          annualInterestRatePct: number
          termMonths: number
          startDate: string
          loanPurpose?: string
          gracePeriodMonths?: number
        }
      }

      const formData = {
        get(name: string) {
          const entries: Record<string, string> = {
            principal: String(example.inputs.principal),
            annualRate: String(example.inputs.annualInterestRatePct),
            termMonths: String(example.inputs.termMonths),
            startDate: example.inputs.startDate,
            gracePeriodMonths: String(
              example.inputs.gracePeriodMonths ?? product.defaultGracePeriodMonths
            ),
            loanPurpose: example.inputs.loanPurpose || '',
            commercialPackagingReady: '1'
          }
          return Object.prototype.hasOwnProperty.call(entries, name) ? entries[name] : null
        },
        getAll(name: string) {
          if (name === 'activeDiscountNames') {
            return DEFAULT_ACTIVE[productCode] ?? []
          }
          if (name === 'includeOptionalFeeNames') {
            return []
          }
          return []
        }
      } as FormData

      const specInputs = mapFormDataToCommercialLoanSpecInputs(formData, product)
      const legacy = mapCommercialLoanSpecInputsToLegacyLoanBundleInput(specInputs, {
        label: product.displayName,
        repaymentDayOfMonth: 1,
        includeDisbursement: true
      })
      const bundle = generateLoanInstrumentBundle(legacy)

      expect(bundle.productId).toBe(product.productId)
      expect(bundle.productSpecVersion).toBe('v2alpha1')
      expect(bundle.config.commercialProductCode).toBe(productCode)
      expect(bundle.config.loanPurpose).toBe(example.inputs.loanPurpose)
      expect(bundle.config.activeDiscountNames).toEqual(DEFAULT_ACTIVE[productCode] ?? [])
      expect(bundle.generatedFlows.length).toBeGreaterThan(0)
    }
  )

  it('keeps metadata productIds aligned with YAML product id / productCode', () => {
    for (const entry of COMMERCIAL_LOAN_PRODUCTS) {
      const yaml = loadYaml(
        `docs/product-specs/products/loans/${entry.productCode}/product.yaml`
      ) as { id: string; productCode: string; loanPurposes?: string[] }
      expect(entry.productId).toBe(yaml.id)
      expect(entry.productCode).toBe(yaml.productCode)
      if (Array.isArray(yaml.loanPurposes) && yaml.loanPurposes.length > 0) {
        expect(entry.loanPurposes).toEqual(yaml.loanPurposes)
      }
    }
  })
})
