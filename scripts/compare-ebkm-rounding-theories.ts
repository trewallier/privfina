/**
 * Compare Annex 3 EBKM publication rounding theories against Hirdetmény goldens.
 *
 * Engine today: round-half **away from zero** (symmetric) — 6. § style in
 * `roundEbkmPercent`. Alternative: half toward **+∞** / larger algebraic value
 * (`Math.floor(x*100+0.5)/100` without abs). Also report "always away" (ceil
 * magnitude) as a non-statutory extreme.
 *
 * Run: npx tsx scripts/compare-ebkm-rounding-theories.ts
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import YAML from 'yaml'
import {
  calculateEbkmFromHomeSavingsInstrument,
  loadHomeSavingsProductSpec,
  mapHomeSavingsSpecInputsToInstrumentInput,
  roundEbkmPercent,
  type HomeSavingsSpecInputs
} from '../src/finance_engine/engine'
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

/** Engine / statutory: half away from zero. */
function roundAwayFromZero(percent: number): number {
  return roundEbkmPercent(percent)
}

/**
 * Half toward +∞ (larger algebraic value) — no abs.
 * At exact *.xx5 negatives this goes toward zero (e.g. −1.035 → −1.03),
 * whereas away-from-zero goes to −1.04.
 */
function roundAlgebraicHalfUp(percent: number): number {
  if (!Number.isFinite(percent)) throw new Error('bad percent')
  // Avoid float-edge nudge on the negative side (would flip *.xx5 the wrong way).
  return Math.floor(percent * 100 + 0.5) / 100
}

/** Non-statutory extreme: always round magnitude up (ceil abs). */
function roundAlwaysAway(percent: number): number {
  if (!Number.isFinite(percent)) throw new Error('bad percent')
  if (percent === 0) return 0
  const sign = percent < 0 ? -1 : 1
  const hundredths = Math.abs(percent) * 100
  // exact hundredth stays; else ceil magnitude
  if (Math.abs(hundredths - Math.round(hundredths)) < 1e-9) {
    return (sign * Math.round(hundredths)) / 100
  }
  return (sign * Math.ceil(hundredths - 1e-12)) / 100
}

function readRepo(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function distToHalfBoundary(rawPct: number): { nearestHalf: number; delta: number } {
  // Distance of |raw|*100 fractional part to 0.5
  const hundredths = Math.abs(rawPct) * 100
  const frac = hundredths - Math.floor(hundredths)
  const toHalf = Math.min(Math.abs(frac - 0.5), Math.abs(frac))
  // nearer tick boundary in percent space
  const lo = Math.floor(hundredths) / 100
  const hi = Math.ceil(hundredths) / 100
  const mid = (Math.floor(hundredths) + 0.5) / 100
  const signedLo = rawPct < 0 ? -hi : lo
  const signedHi = rawPct < 0 ? -lo : hi
  const signedMid = rawPct < 0 ? -mid : mid
  let nearest = signedMid
  let delta = Math.abs(rawPct - signedMid)
  for (const t of [signedLo, signedHi, signedMid]) {
    const d = Math.abs(rawPct - t)
    if (d < delta) {
      delta = d
      nearest = t
    }
  }
  return { nearestHalf: nearest, delta }
}

function main(): void {
  const schema = JSON.parse(readRepo(DEFAULT_PRODUCT_SCHEMA_PATH))
  console.log(
    'label | side | raw | eng/away | algebraic | alwaysAway | published | awayOK | algOK | alwaysOK | |raw|−*.x5'
  )

  let awayGreen = 0
  let algGreen = 0
  let alwaysGreen = 0
  let total = 0
  const regressionsIfSwitchToAlgebraic: string[] = []
  const residualDetail: string[] = []

  for (const cell of CELLS) {
    const product = loadHomeSavingsProductSpec(readRepo(cell.product), schema)
    const base = YAML.parse(readRepo(cell.example)).inputs as HomeSavingsSpecInputs
    for (const housingPurpose of [true, false]) {
      total += 1
      const published = housingPurpose ? cell.published.with : cell.published.without
      const instrument = mapHomeSavingsSpecInputsToInstrumentInput(product, {
        ...base,
        housingPurpose
      })
      const result = calculateEbkmFromHomeSavingsInstrument(instrument)
      const raw = result.rate * 100
      const away = roundAwayFromZero(raw)
      const alg = roundAlgebraicHalfUp(raw)
      const always = roundAlwaysAway(raw)
      const side = housingPurpose ? 'with' : 'without'
      const awayOK = away === published
      const algOK = alg === published
      const alwaysOK = always === published
      if (awayOK) awayGreen += 1
      if (algOK) algGreen += 1
      if (alwaysOK) alwaysGreen += 1

      const hundredths = Math.abs(raw) * 100
      const frac = hundredths - Math.floor(hundredths)
      const distHalf = (frac - 0.5).toFixed(4)

      if (awayOK && !algOK) {
        regressionsIfSwitchToAlgebraic.push(
          `${cell.label} ${side}: raw=${raw.toFixed(6)} away=${away} alg=${alg} pub=${published}`
        )
      }
      if (cell.residual && !housingPurpose) {
        residualDetail.push(
          `${cell.label}: raw=${raw.toFixed(8)} away=${away} alg=${alg} always=${always} pub=${published} fracPart=${frac.toFixed(6)} (need |raw|≥${(Math.floor(hundredths) + 0.5) / 100} for half-up tick flip)`
        )
      }

      console.log(
        `${cell.label} | ${side} | ${raw.toFixed(6)} | ${away} | ${alg} | ${always} | ${published} | ${
          awayOK ? 'Y' : 'n'
        } | ${algOK ? 'Y' : 'n'} | ${alwaysOK ? 'Y' : 'n'} | dHalf=${distHalf}`
      )
    }
  }

  console.log('\n=== Score vs Hirdetmény (YAML startDate, ADR 0031 flows) ===')
  console.log(`away-from-zero half-up (engine): ${awayGreen}/${total}`)
  console.log(`algebraic half-up (toward +∞):   ${algGreen}/${total}`)
  console.log(`always-away (ceil |x|):          ${alwaysGreen}/${total}`)

  console.log('\n=== Residual without-Premium detail ===')
  for (const line of residualDetail) console.log(line)

  console.log('\n=== Cells that would REGRESS if engine switched away→algebraic ===')
  if (regressionsIfSwitchToAlgebraic.length === 0) {
    console.log('(none at YAML startDates — no cell sits on a negative *.xx5 boundary)')
  } else {
    for (const line of regressionsIfSwitchToAlgebraic) console.log(line)
  }

  // Demonstrate the theoretical .5 boundary difference on synthetic values
  console.log('\n=== Synthetic .5 boundary (where theories disagree) ===')
  for (const x of [4.345, -0.575, -1.035, -0.975, 3.225, -1.031]) {
    console.log(
      `raw=${x} away=${roundAwayFromZero(x)} alg=${roundAlgebraicHalfUp(x)} always=${roundAlwaysAway(x)}`
    )
  }
}

main()
