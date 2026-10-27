/**
 * One-shot: revalidate all catalog home-savings EBKM cells under current engine
 * (first deposit ÁSZF-exempt; subsequent ≤12) — YAML startDate fit + full
 * saleWindow witness counts, with 4x10 residual deltas called out.
 *
 * Run: npx tsx scripts/revalidate-home-savings-ebkm-witnesses.ts
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import YAML from 'yaml'
import {
  calculateHomeSavingsFromProductSpec,
  loadHomeSavingsProductSpec,
  type HomeSavingsProductSpec,
  type HomeSavingsSpecInputs
} from '../src/finance_engine/engine'
import { formatIsoDate, parseIsoDate } from '../src/finance_engine/date_utils'
import { DEFAULT_PRODUCT_SCHEMA_PATH } from '../src/finance_engine/product_specs/loader'

type Cell = {
  label: string
  product: string
  example: string
  published: { with: number; without: number }
  residual?: boolean
}

const CELLS: Cell[] = [
  {
    label: 'premium-4x10/20k',
    product: 'docs/product-specs/products/home-savings/premium-4x10/product.yaml',
    example: 'docs/product-specs/products/home-savings/premium-4x10/examples/ebkm-standard-20000.yaml',
    published: { with: 3.23, without: -1.04 },
    residual: true
  },
  {
    label: 'premium-4x10/50k',
    product: 'docs/product-specs/products/home-savings/premium-4x10/product.yaml',
    example: 'docs/product-specs/products/home-savings/premium-4x10/examples/ebkm-standard-50000.yaml',
    published: { with: 3.44, without: -0.83 }
  },
  {
    label: 'plus-4x10/20k',
    product: 'docs/product-specs/products/home-savings/premium-plusz-4x10/product.yaml',
    example: 'docs/product-specs/products/home-savings/premium-plusz-4x10/examples/ebkm-standard-20000.yaml',
    published: { with: 2.64, without: -1.6 }
  },
  {
    label: 'plus-4x10/100k',
    product: 'docs/product-specs/products/home-savings/premium-plusz-4x10/product.yaml',
    example: 'docs/product-specs/products/home-savings/premium-plusz-4x10/examples/ebkm-standard-100000.yaml',
    published: { with: 3.27, without: -0.98 },
    residual: true
  },
  {
    label: 'plus-4x10/promo-20k',
    product: 'docs/product-specs/products/home-savings/premium-plusz-4x10/product.yaml',
    example: 'docs/product-specs/products/home-savings/premium-plusz-4x10/examples/ebkm-promo-20000.yaml',
    published: { with: 3.12, without: -1.17 }
  },
  {
    label: 'plus-4x10/promo-100k',
    product: 'docs/product-specs/products/home-savings/premium-plusz-4x10/product.yaml',
    example: 'docs/product-specs/products/home-savings/premium-plusz-4x10/examples/ebkm-promo-100000.yaml',
    published: { with: 4.02, without: -0.3 }
  },
  {
    label: 'premium-8x30/20k',
    product: 'docs/product-specs/products/home-savings/premium-8x30/product.yaml',
    example: 'docs/product-specs/products/home-savings/premium-8x30/examples/ebkm-standard-20000.yaml',
    published: { with: 5.54, without: -0.56 }
  },
  {
    label: 'premium-8x30/50k',
    product: 'docs/product-specs/products/home-savings/premium-8x30/product.yaml',
    example: 'docs/product-specs/products/home-savings/premium-8x30/examples/ebkm-standard-50000.yaml',
    published: { with: 5.64, without: -0.46 }
  },
  {
    label: 'plus-8x30/20k',
    product: 'docs/product-specs/products/home-savings/premium-plusz-8x30/product.yaml',
    example: 'docs/product-specs/products/home-savings/premium-plusz-8x30/examples/ebkm-standard-20000.yaml',
    published: { with: 5.31, without: -0.79 }
  },
  {
    label: 'plus-8x30/100k',
    product: 'docs/product-specs/products/home-savings/premium-plusz-8x30/product.yaml',
    example: 'docs/product-specs/products/home-savings/premium-plusz-8x30/examples/ebkm-standard-100000.yaml',
    published: { with: 5.62, without: -0.47 }
  },
  {
    label: 'plus-8x30/promo-20k',
    product: 'docs/product-specs/products/home-savings/premium-plusz-8x30/product.yaml',
    example: 'docs/product-specs/products/home-savings/premium-plusz-8x30/examples/ebkm-promo-20000.yaml',
    published: { with: 5.59, without: -0.56 }
  },
  {
    label: 'plus-8x30/promo-100k',
    product: 'docs/product-specs/products/home-savings/premium-plusz-8x30/product.yaml',
    example: 'docs/product-specs/products/home-savings/premium-plusz-8x30/examples/ebkm-promo-100000.yaml',
    published: { with: 6.07, without: -0.11 }
  },
  {
    label: 'plus-10x30/20k',
    product: 'docs/product-specs/products/home-savings/premium-plusz-10x30/product.yaml',
    example: 'docs/product-specs/products/home-savings/premium-plusz-10x30/examples/ebkm-standard-20000.yaml',
    published: { with: 4.12, without: -0.77 }
  },
  {
    label: 'plus-10x30/100k',
    product: 'docs/product-specs/products/home-savings/premium-plusz-10x30/product.yaml',
    example: 'docs/product-specs/products/home-savings/premium-plusz-10x30/examples/ebkm-standard-100000.yaml',
    published: { with: 4.48, without: -0.4 }
  },
  {
    label: 'plus-10x30/promo-20k',
    product: 'docs/product-specs/products/home-savings/premium-plusz-10x30/product.yaml',
    example: 'docs/product-specs/products/home-savings/premium-plusz-10x30/examples/ebkm-promo-20000.yaml',
    published: { with: 4.35, without: -0.58 }
  },
  {
    label: 'plus-10x30/promo-100k',
    product: 'docs/product-specs/products/home-savings/premium-plusz-10x30/product.yaml',
    example: 'docs/product-specs/products/home-savings/premium-plusz-10x30/examples/ebkm-promo-100000.yaml',
    published: { with: 4.84, without: -0.1 }
  }
]

function readRepo(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function loadProduct(rel: string): HomeSavingsProductSpec {
  const schema = JSON.parse(readRepo(DEFAULT_PRODUCT_SCHEMA_PATH))
  return loadHomeSavingsProductSpec(readRepo(rel), schema)
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
  const from = parseIsoDate(product.saleWindow!.from)
  // Live offerings: bound search to ±60 days around example start (not full open window).
  return formatIsoDate(
    new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + 120))
  )
}

function main(): void {
  console.log(
    'label | yamlStart | engine W/WO | published W/WO | ΔWO | yamlOK | witnesses (≤12/>12) | firstWitness | note'
  )
  for (const cell of CELLS) {
    const product = loadProduct(cell.product)
    const example = YAML.parse(readRepo(cell.example))
    const base = example.inputs as HomeSavingsSpecInputs
    const start = base.startDate
    const withP = calculateHomeSavingsFromProductSpec(product, {
      ...base,
      startDate: start,
      housingPurpose: true
    }).ebkmPct
    const withoutP = calculateHomeSavingsFromProductSpec(product, {
      ...base,
      startDate: start,
      housingPurpose: false
    }).ebkmPct
    const yamlOK = withP === cell.published.with && withoutP === cell.published.without
    const dWo = Number((withoutP - cell.published.without).toFixed(2))

    let witnesses = 0
    let dayLe12 = 0
    let dayGt12 = 0
    let first: string | null = null
    const from = product.saleWindow?.from
    if (!from) {
      console.log(
        `${cell.label} | ${start} | ${withP}/${withoutP} | ${cell.published.with}/${cell.published.without} | ${dWo} | ${yamlOK ? 'YES' : 'NO'} | n/a | - | no saleWindow`
      )
      continue
    }
    // For live 10x30, search a window around the example start (±45 days) for speed.
    const isLiveOpen = !product.saleWindow?.to
    const searchFrom = isLiveOpen
      ? formatIsoDate(
          new Date(
            Date.UTC(
              parseIsoDate(start).getUTCFullYear(),
              parseIsoDate(start).getUTCMonth(),
              parseIsoDate(start).getUTCDate() - 45
            )
          )
        )
      : from
    const searchTo = isLiveOpen
      ? formatIsoDate(
          new Date(
            Date.UTC(
              parseIsoDate(start).getUTCFullYear(),
              parseIsoDate(start).getUTCMonth(),
              parseIsoDate(start).getUTCDate() + 45
            )
          )
        )
      : saleWindowEnd(product)

    for (const d of eachDayInclusive(searchFrom < from ? from : searchFrom, searchTo)) {
      const w = calculateHomeSavingsFromProductSpec(product, {
        ...base,
        startDate: d,
        housingPurpose: true
      }).ebkmPct
      const wo = calculateHomeSavingsFromProductSpec(product, {
        ...base,
        startDate: d,
        housingPurpose: false
      }).ebkmPct
      if (w === cell.published.with && wo === cell.published.without) {
        witnesses += 1
        if (!first) first = d
        if (parseIsoDate(d).getUTCDate() <= 12) dayLe12 += 1
        else dayGt12 += 1
      }
    }

    console.log(
      `${cell.label} | ${start} | ${withP}/${withoutP} | ${cell.published.with}/${cell.published.without} | ${dWo} | ${
        yamlOK ? 'YES' : 'NO'
      } | ${witnesses} (${dayLe12}/${dayGt12}) | ${first ?? '-'} | ${
        cell.residual ? 'RESIDUAL' : isLiveOpen ? 'live±45d' : 'ok'
      }`
    )
  }
}

main()
