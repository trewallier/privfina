/**
 * Rounding-direction theory vs 4x10 residuals (see
 * docs/dev-notes/ebkm-rounding-theory-compare.md).
 *
 * Engine already uses half-up away from zero. Residuals are not on *.xx5;
 * algebraic half-up matches engine on locked YAML starts; always-ceil regresses.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import YAML from 'yaml'
import {
  calculateEbkmFromHomeSavingsInstrument,
  loadHomeSavingsProductSpec,
  mapHomeSavingsSpecInputsToInstrumentInput,
  roundEbkmPercent
} from '../src/finance_engine/engine'
import { DEFAULT_PRODUCT_SCHEMA_PATH } from '../src/finance_engine/product_specs/loader'

function readRepo(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function roundAlgebraicHalfUp(percent: number): number {
  return Math.floor(percent * 100 + 0.5) / 100
}

function roundAlwaysAway(percent: number): number {
  if (percent === 0) return 0
  const sign = percent < 0 ? -1 : 1
  const hundredths = Math.abs(percent) * 100
  if (Math.abs(hundredths - Math.round(hundredths)) < 1e-9) {
    return (sign * Math.round(hundredths)) / 100
  }
  return (sign * Math.ceil(hundredths - 1e-12)) / 100
}

describe('EBKM rounding theory vs residuals', () => {
  it('engine half-up is away-from-zero (negatives go further from zero at *.xx5)', () => {
    expect(roundEbkmPercent(-0.575)).toBe(-0.58)
    expect(roundAlgebraicHalfUp(-0.575)).toBe(-0.57)
    expect(roundEbkmPercent(-1.035)).toBe(-1.04)
    expect(roundAlgebraicHalfUp(-1.035)).toBe(-1.03)
  })

  it('residual raw rates are short of the half-up edge; always-away matches pub but is non-statutory', () => {
    const schema = JSON.parse(readRepo(DEFAULT_PRODUCT_SCHEMA_PATH))
    const residuals = [
      {
        product: 'docs/product-specs/products/home-savings/premium-4x10/product.yaml',
        example: 'docs/product-specs/products/home-savings/premium-4x10/examples/ebkm-standard-20000.yaml',
        published: -1.04,
        halfEdge: 1.035
      },
      {
        product: 'docs/product-specs/products/home-savings/premium-plusz-4x10/product.yaml',
        example:
          'docs/product-specs/products/home-savings/premium-plusz-4x10/examples/ebkm-standard-100000.yaml',
        published: -0.98,
        halfEdge: 0.975
      }
    ]

    for (const cell of residuals) {
      const product = loadHomeSavingsProductSpec(readRepo(cell.product), schema)
      const inputs = YAML.parse(readRepo(cell.example)).inputs
      const instrument = mapHomeSavingsSpecInputsToInstrumentInput(product, {
        ...inputs,
        housingPurpose: false
      })
      const raw = calculateEbkmFromHomeSavingsInstrument(instrument).rate * 100
      expect(Math.abs(raw)).toBeLessThan(cell.halfEdge)
      expect(roundEbkmPercent(raw)).toBe(roundAlgebraicHalfUp(raw))
      expect(roundEbkmPercent(raw)).not.toBe(cell.published)
      expect(roundAlwaysAway(raw)).toBe(cell.published)
    }
  })

  it('always-away regresses a known green positive cell (plus-10x30 promo-20k with)', () => {
    const schema = JSON.parse(readRepo(DEFAULT_PRODUCT_SCHEMA_PATH))
    const product = loadHomeSavingsProductSpec(
      readRepo('docs/product-specs/products/home-savings/premium-plusz-10x30/product.yaml'),
      schema
    )
    const inputs = YAML.parse(
      readRepo(
        'docs/product-specs/products/home-savings/premium-plusz-10x30/examples/ebkm-promo-20000.yaml'
      )
    ).inputs
    const instrument = mapHomeSavingsSpecInputsToInstrumentInput(product, {
      ...inputs,
      housingPurpose: true
    })
    const raw = calculateEbkmFromHomeSavingsInstrument(instrument).rate * 100
    expect(roundEbkmPercent(raw)).toBe(4.35)
    expect(roundAlwaysAway(raw)).toBe(4.36)
  })
})
