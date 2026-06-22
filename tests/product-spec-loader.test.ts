import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  loadFixedRateLoanProductSpecFromFiles,
  DEFAULT_FIXED_RATE_LOAN_PRODUCT_SPEC_PATH,
  DEFAULT_PRODUCT_SCHEMA_PATH
} from '../src/finance_engine/engine'

describe('fixed-rate loan product spec loader seam', () => {
  it('loads and validates fixed-rate-loan product spec from repository files', () => {
    const spec = loadFixedRateLoanProductSpecFromFiles()

    expect(spec.specVersion).toBe('v1alpha1')
    expect(spec.id).toBe('loan.fixed-rate.standard')
    expect(spec.family).toBe('loan')
    expect(spec.variant).toBe('fixed-rate')
  })

  it('returns stable top-level fields for later frontend and adapter seams', () => {
    const spec = loadFixedRateLoanProductSpecFromFiles()

    expect(spec.displayName).toBe('Fixed Rate Loan')
    expect(Array.isArray(spec.inputs)).toBe(true)
    expect(Array.isArray(spec.outputs)).toBe(true)
    expect(spec.ui.formTitle).toBe('Fixed Rate Loan')
    expect(spec.ui.sections.length).toBeGreaterThan(0)
    expect(spec.engine.instrumentType).toBe('loan')
  })

  it('fails clearly when the fixed-rate spec is invalid against schema', () => {
    const tempDir = mkdtempSync(resolve(tmpdir(), 'privfina-invalid-spec-'))

    try {
      const invalidSpecPath = resolve(tempDir, 'invalid-product.yaml')
      const schemaPath = resolve(process.cwd(), DEFAULT_PRODUCT_SCHEMA_PATH)

      writeFileSync(
        invalidSpecPath,
        [
          'specVersion: v1alpha1',
          'kind: financial-product',
          'id: loan.fixed-rate.standard',
          'family: loan',
          'variant: fixed-rate',
          'displayName: Invalid Fixed Rate Loan',
          'engine:',
          '  instrumentType: loan',
          '  rateType: fixed',
          '  amortizationType: level-payment',
          '  paymentFrequency: monthly',
          'inputs: []',
          'outputs: []'
        ].join('\n'),
        'utf8'
      )

      expect(() =>
        loadFixedRateLoanProductSpecFromFiles({
          rootDir: process.cwd(),
          productSpecPath: invalidSpecPath,
          productSchemaPath: schemaPath
        })
      ).toThrow(/Failed to load fixed-rate loan product spec/)
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('uses repository defaults for spec and schema paths', () => {
    const productYamlText = readFileSync(resolve(process.cwd(), DEFAULT_FIXED_RATE_LOAN_PRODUCT_SPEC_PATH), 'utf8')

    expect(productYamlText.includes('id: loan.fixed-rate.standard')).toBe(true)
  })
})
