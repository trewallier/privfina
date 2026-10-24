import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import Ajv2020 from 'ajv/dist/2020'
import YAML from 'yaml'

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

function collectProductYamlPaths(): string[] {
  const roots = [
    'docs/product-specs/products/loans',
    'docs/product-specs/products/government-securities',
    'docs/product-specs/products/home-savings'
  ]
  const paths: string[] = []

  for (const root of roots) {
    const absoluteRoot = resolve(process.cwd(), root)
    for (const entry of readdirSync(absoluteRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const productPath = join(absoluteRoot, entry.name, 'product.yaml')
      try {
        readFileSync(productPath)
        paths.push(productPath)
      } catch {
        // nested family folders (loans has product dirs directly; gov has product dirs)
      }
      // also one level deeper under government-securities already covered; loans same
    }
  }

  return paths
}

describe('product specification schema v2', () => {
  const productSchema = JSON.parse(readRepoFile('docs/product-specs/schema/v2/product.schema.json'))
  const exampleSchema = JSON.parse(readRepoFile('docs/product-specs/schema/v2/example.schema.json'))
  const ajv = new Ajv2020({ allErrors: true, strict: false })
  const validateProduct = ajv.compile(productSchema)
  const validateExample = ajv.compile(exampleSchema)

  it('validates every catalog product.yaml against schema v2', () => {
    const productPaths = collectProductYamlPaths()
    expect(productPaths.length).toBeGreaterThanOrEqual(5)

    for (const productPath of productPaths) {
      const spec = YAML.parse(readFileSync(productPath, 'utf8'))
      const valid = validateProduct(spec)
      expect(valid, `${productPath}: ${JSON.stringify(validateProduct.errors)}`).toBe(true)
      expect(spec.specVersion).toBe('v2alpha1')
      expect(typeof spec.productCode).toBe('string')
      expect(spec.productCode.length).toBeGreaterThan(0)
    }
  })

  it('validates mortgage pilot under mortgage-loan family with loan engine primitives', () => {
    const spec = YAML.parse(
      readRepoFile('docs/product-specs/products/loans/fixed-rate-mortgage/product.yaml')
    )

    expect(validateProduct(spec)).toBe(true)
    expect(spec.family).toBe('mortgage-loan')
    expect(spec.engine.instrumentType).toBe('loan')
    expect(spec.loanPurposes).toContain('used-home-purchase')
  })

  it('validates home-savings PRÉMIUM PLUSZ 10x30 under home-savings family', () => {
    const spec = YAML.parse(
      readRepoFile(
        'docs/product-specs/products/home-savings/premium-plusz-10x30/product.yaml'
      )
    )

    expect(validateProduct(spec), JSON.stringify(validateProduct.errors)).toBe(true)
    expect(spec.family).toBe('home-savings')
    expect(spec.productCode).toBe('premium-plusz-10x30')
    expect(spec.engine.instrumentType).toBe('home-savings')
  })

  it('accepts expandable mortgage commercial constructs used by future products', () => {
    const draft = {
      specVersion: 'v2alpha1',
      kind: 'financial-product',
      id: 'mortgage-loan.csok-plusz.draft',
      family: 'mortgage-loan',
      variant: 'csok-plusz',
      productCode: 'csok-plusz',
      displayName: 'CSOK Plus (schema draft)',
      engine: {
        instrumentType: 'loan',
        rateType: 'state-subsidized',
        amortizationType: 'interest-only-then-annuity',
        paymentFrequency: 'monthly',
        gracePeriodMonths: 12,
        interestPeriodMonths: 60
      },
      subsidy: {
        type: 'state-interest-subsidy',
        customerRate: 0.03,
        subsidyDurationMonths: 300
      },
      loanPurposes: ['new-home-purchase', 'construction'],
      discounts: [
        {
          name: 'loyalty',
          type: 'rate-discount',
          value: 25,
          unit: 'bp',
          conditions: ['active-payroll-account']
        }
      ],
      fees: [
        {
          name: 'disbursement',
          type: 'disbursement',
          value: 1,
          unit: 'percent',
          timing: 'upfront'
        },
        {
          name: 'appraisal',
          type: 'appraisal',
          value: 50000,
          unit: 'amount',
          timing: 'upfront'
        }
      ],
      eligibilityRules: ['first-home-buyer-or-family-support-program'],
      pricing: {
        notes: ['Rates and THM differ by loan purpose']
      },
      inputs: [
        {
          name: 'principal',
          type: 'number',
          label: 'Principal',
          required: true
        }
      ],
      outputs: [
        {
          name: 'monthlyPayment',
          type: 'number',
          label: 'Monthly Payment',
          required: true
        }
      ],
      ui: {
        formTitle: 'CSOK Plus',
        sections: [{ id: 'core', title: 'Core', fieldNames: ['principal'] }]
      }
    }

    expect(validateProduct(draft), JSON.stringify(validateProduct.errors)).toBe(true)
  })

  it('validates catalog worked examples against example schema v2', () => {
    const productPaths = collectProductYamlPaths()

    for (const productPath of productPaths) {
      const examplesDir = join(dirname(productPath), 'examples')
      let exampleFiles: string[] = []
      try {
        exampleFiles = readdirSync(examplesDir).filter((name) => name.endsWith('.yaml'))
      } catch {
        continue
      }

      for (const fileName of exampleFiles) {
        const examplePath = join(examplesDir, fileName)
        const example = YAML.parse(readFileSync(examplePath, 'utf8'))
        const valid = validateExample(example)
        expect(valid, `${examplePath}: ${JSON.stringify(validateExample.errors)}`).toBe(true)
        expect(example.specVersion).toBe('v2alpha1')
      }
    }
  })
})
