/**
 * StartDate witness search for withdrawn home-savings EBKM goldens.
 *
 * Finding (see docs/dev-notes/ebkm-4x10-interest-invariance-probe.md):
 * capitalization and ÁSZF/OTP payout markers are month day-1, while deposits
 * follow the contract start day-of-month — so rounded EBKM is startDate-sensitive.
 * Hirdetmény publishes one figure with no start day; a coherent verification
 * policy may accept a cell if **some** startDate inside saleWindow matches under
 * fixed ADR 0031 ÁSZF packaging.
 *
 * Empirically, residual 4x10 without-Premium cells have **zero** ÁSZF witnesses
 * in the full sale window — date tuning alone cannot close them. Non-residual
 * cells have many witnesses; the example YAML startDate must be one of them.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import YAML from 'yaml'
import {
  calculateHomeSavingsFromProductSpec,
  loadHomeSavingsProductSpec,
  type HomeSavingsProductSpec,
  type HomeSavingsSpecInputs
} from '../src/finance_engine/engine'
import { daysInMonthUtc, formatIsoDate, parseIsoDate } from '../src/finance_engine/date_utils'
import { DEFAULT_PRODUCT_SCHEMA_PATH } from '../src/finance_engine/product_specs/loader'

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

function loadProduct(relativeYamlPath: string): HomeSavingsProductSpec {
  const schema = JSON.parse(readRepoFile(DEFAULT_PRODUCT_SCHEMA_PATH))
  return loadHomeSavingsProductSpec(readRepoFile(relativeYamlPath), schema)
}

function* eachDayInclusive(fromIso: string, toIso: string): Generator<string> {
  let cursor = parseIsoDate(fromIso)
  const end = parseIsoDate(toIso)
  while (cursor.getTime() <= end.getTime()) {
    yield formatIsoDate(cursor)
    cursor = new Date(
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate() + 1)
    )
  }
}

function saleWindowEnd(product: HomeSavingsProductSpec): string {
  const to = product.saleWindow?.to
  if (typeof to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(to)) return to
  // Open-ended offerings: search a bounded horizon from `from` (not used for withdrawn).
  const from = parseIsoDate(product.saleWindow.from)
  return formatIsoDate(
    new Date(Date.UTC(from.getUTCFullYear() + 1, from.getUTCMonth(), from.getUTCDate()))
  )
}

function matchesPublished(
  product: HomeSavingsProductSpec,
  baseInputs: HomeSavingsSpecInputs,
  startDate: string,
  published: { withPremium: number; withoutPremium: number }
): boolean {
  const withPremium = calculateHomeSavingsFromProductSpec(product, {
    ...baseInputs,
    startDate,
    housingPurpose: true
  }).ebkmPct
  const withoutPremium = calculateHomeSavingsFromProductSpec(product, {
    ...baseInputs,
    startDate,
    housingPurpose: false
  }).ebkmPct
  return withPremium === published.withPremium && withoutPremium === published.withoutPremium
}

function findWitnesses(
  product: HomeSavingsProductSpec,
  baseInputs: HomeSavingsSpecInputs,
  published: { withPremium: number; withoutPremium: number },
  options: { limit?: number } = {}
): string[] {
  const from = product.saleWindow.from
  const to = saleWindowEnd(product)
  const hits: string[] = []
  const limit = options.limit ?? Number.POSITIVE_INFINITY
  for (const startDate of eachDayInclusive(from, to)) {
    if (matchesPublished(product, baseInputs, startDate, published)) {
      hits.push(startDate)
      if (hits.length >= limit) break
    }
  }
  return hits
}

type CellCase = {
  code: string
  productYaml: string
  examplePath: string
  published: { withPremium: number; withoutPremium: number }
  /** Residual under shared ÁSZF packaging: expect zero saleWindow witnesses. */
  aszfResidual: boolean
}

const CELLS: CellCase[] = [
  {
    code: 'premium-4x10',
    productYaml: 'docs/product-specs/products/home-savings/premium-4x10/product.yaml',
    examplePath:
      'docs/product-specs/products/home-savings/premium-4x10/examples/ebkm-standard-20000.yaml',
    published: { withPremium: 3.23, withoutPremium: -1.04 },
    aszfResidual: true
  },
  {
    code: 'premium-4x10',
    productYaml: 'docs/product-specs/products/home-savings/premium-4x10/product.yaml',
    examplePath:
      'docs/product-specs/products/home-savings/premium-4x10/examples/ebkm-standard-50000.yaml',
    published: { withPremium: 3.44, withoutPremium: -0.83 },
    aszfResidual: false
  },
  {
    code: 'premium-plusz-4x10',
    productYaml: 'docs/product-specs/products/home-savings/premium-plusz-4x10/product.yaml',
    examplePath:
      'docs/product-specs/products/home-savings/premium-plusz-4x10/examples/ebkm-standard-100000.yaml',
    published: { withPremium: 3.27, withoutPremium: -0.98 },
    aszfResidual: true
  },
  {
    code: 'premium-plusz-4x10',
    productYaml: 'docs/product-specs/products/home-savings/premium-plusz-4x10/product.yaml',
    examplePath:
      'docs/product-specs/products/home-savings/premium-plusz-4x10/examples/ebkm-standard-20000.yaml',
    published: { withPremium: 2.64, withoutPremium: -1.6 },
    aszfResidual: false
  },
  {
    code: 'premium-8x30',
    productYaml: 'docs/product-specs/products/home-savings/premium-8x30/product.yaml',
    examplePath:
      'docs/product-specs/products/home-savings/premium-8x30/examples/ebkm-standard-20000.yaml',
    published: { withPremium: 5.54, withoutPremium: -0.56 },
    aszfResidual: false
  }
]

describe('home-savings EBKM startDate witnesses (ADR 0031 ÁSZF packaging)', () => {
  it('documents that month lengths differ (start-month sensitivity is real)', () => {
    expect(daysInMonthUtc(2025, 1)).toBe(28) // February 2025
    expect(daysInMonthUtc(2025, 6)).toBe(31) // July 2025
  })

  for (const cell of CELLS) {
    const exampleFile = cell.examplePath.split('/').pop()!
    describe(`${cell.code}/${exampleFile}`, () => {
      const product = loadProduct(cell.productYaml)
      const parsed = YAML.parse(readRepoFile(cell.examplePath))
      const baseInputs = parsed.inputs as HomeSavingsSpecInputs

      if (cell.aszfResidual) {
        it('has zero ÁSZF witnesses in the full saleWindow (date tuning cannot close)', () => {
          const witnesses = findWitnesses(product, baseInputs, cell.published)
          expect(witnesses).toEqual([])
        }, 120_000)
      } else {
        it('example startDate is an ÁSZF witness; saleWindow contains ≥1 witness', () => {
          // Locked YAML startDate must itself satisfy published EBKM (mandatory date choice).
          expect(
            matchesPublished(product, baseInputs, baseInputs.startDate, cell.published)
          ).toBe(true)
          const firstWitness = findWitnesses(product, baseInputs, cell.published, { limit: 1 })
          expect(firstWitness.length).toBe(1)
        }, 120_000)
      }
    })
  }
})
