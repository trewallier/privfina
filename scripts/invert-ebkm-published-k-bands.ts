/**
 * Invert published Hirdetmény EBKM ticks → accepted raw-r bands and matching
 * terminal-K bands (ADR 0031 ÁSZF deposit legs fixed; vary K only).
 *
 * Run: npx tsx scripts/invert-ebkm-published-k-bands.ts
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import YAML from 'yaml'
import {
  buildEbkmLegsFromHomeSavingsCashFlows,
  buildHomeSavingsAszfEbkmCashFlows,
  calculateEbkmFromLegs,
  loadHomeSavingsProductSpec,
  mapHomeSavingsSpecInputsToInstrumentInput,
  roundEbkmPercent,
  type HomeSavingsSpecInputs
} from '../src/finance_engine/engine'
import { DEFAULT_PRODUCT_SCHEMA_PATH } from '../src/finance_engine/product_specs/loader'

type Cell = {
  label: string
  termMonths: number
  product: string
  example: string
  published: { with: number; without: number }
}

const CELLS: Cell[] = [
  {
    label: 'premium-4x10/20k',
    termMonths: 48,
    product: 'docs/product-specs/products/home-savings/premium-4x10/product.yaml',
    example: 'docs/product-specs/products/home-savings/premium-4x10/examples/ebkm-standard-20000.yaml',
    published: { with: 3.23, without: -1.04 }
  },
  {
    label: 'premium-4x10/50k',
    termMonths: 48,
    product: 'docs/product-specs/products/home-savings/premium-4x10/product.yaml',
    example: 'docs/product-specs/products/home-savings/premium-4x10/examples/ebkm-standard-50000.yaml',
    published: { with: 3.44, without: -0.83 }
  },
  {
    label: 'plus-4x10/20k',
    termMonths: 48,
    product: 'docs/product-specs/products/home-savings/premium-plusz-4x10/product.yaml',
    example: 'docs/product-specs/products/home-savings/premium-plusz-4x10/examples/ebkm-standard-20000.yaml',
    published: { with: 2.64, without: -1.6 }
  },
  {
    label: 'plus-4x10/100k',
    termMonths: 48,
    product: 'docs/product-specs/products/home-savings/premium-plusz-4x10/product.yaml',
    example: 'docs/product-specs/products/home-savings/premium-plusz-4x10/examples/ebkm-standard-100000.yaml',
    published: { with: 3.27, without: -0.98 }
  },
  {
    label: 'plus-4x10/promo-20k',
    termMonths: 48,
    product: 'docs/product-specs/products/home-savings/premium-plusz-4x10/product.yaml',
    example: 'docs/product-specs/products/home-savings/premium-plusz-4x10/examples/ebkm-promo-20000.yaml',
    published: { with: 3.12, without: -1.17 }
  },
  {
    label: 'plus-4x10/promo-100k',
    termMonths: 48,
    product: 'docs/product-specs/products/home-savings/premium-plusz-4x10/product.yaml',
    example: 'docs/product-specs/products/home-savings/premium-plusz-4x10/examples/ebkm-promo-100000.yaml',
    published: { with: 4.02, without: -0.3 }
  },
  {
    label: 'premium-8x30/20k',
    termMonths: 96,
    product: 'docs/product-specs/products/home-savings/premium-8x30/product.yaml',
    example: 'docs/product-specs/products/home-savings/premium-8x30/examples/ebkm-standard-20000.yaml',
    published: { with: 5.54, without: -0.56 }
  },
  {
    label: 'premium-8x30/50k',
    termMonths: 96,
    product: 'docs/product-specs/products/home-savings/premium-8x30/product.yaml',
    example: 'docs/product-specs/products/home-savings/premium-8x30/examples/ebkm-standard-50000.yaml',
    published: { with: 5.64, without: -0.46 }
  },
  {
    label: 'plus-8x30/20k',
    termMonths: 96,
    product: 'docs/product-specs/products/home-savings/premium-plusz-8x30/product.yaml',
    example: 'docs/product-specs/products/home-savings/premium-plusz-8x30/examples/ebkm-standard-20000.yaml',
    published: { with: 5.31, without: -0.79 }
  },
  {
    label: 'plus-8x30/100k',
    termMonths: 96,
    product: 'docs/product-specs/products/home-savings/premium-plusz-8x30/product.yaml',
    example: 'docs/product-specs/products/home-savings/premium-plusz-8x30/examples/ebkm-standard-100000.yaml',
    published: { with: 5.62, without: -0.47 }
  },
  {
    label: 'plus-8x30/promo-20k',
    termMonths: 96,
    product: 'docs/product-specs/products/home-savings/premium-plusz-8x30/product.yaml',
    example: 'docs/product-specs/products/home-savings/premium-plusz-8x30/examples/ebkm-promo-20000.yaml',
    published: { with: 5.59, without: -0.56 }
  },
  {
    label: 'plus-8x30/promo-100k',
    termMonths: 96,
    product: 'docs/product-specs/products/home-savings/premium-plusz-8x30/product.yaml',
    example: 'docs/product-specs/products/home-savings/premium-plusz-8x30/examples/ebkm-promo-100000.yaml',
    published: { with: 6.07, without: -0.11 }
  },
  {
    label: 'plus-10x30/20k',
    termMonths: 120,
    product: 'docs/product-specs/products/home-savings/premium-plusz-10x30/product.yaml',
    example: 'docs/product-specs/products/home-savings/premium-plusz-10x30/examples/ebkm-standard-20000.yaml',
    published: { with: 4.12, without: -0.77 }
  },
  {
    label: 'plus-10x30/100k',
    termMonths: 120,
    product: 'docs/product-specs/products/home-savings/premium-plusz-10x30/product.yaml',
    example: 'docs/product-specs/products/home-savings/premium-plusz-10x30/examples/ebkm-standard-100000.yaml',
    published: { with: 4.48, without: -0.4 }
  },
  {
    label: 'plus-10x30/promo-20k',
    termMonths: 120,
    product: 'docs/product-specs/products/home-savings/premium-plusz-10x30/product.yaml',
    example: 'docs/product-specs/products/home-savings/premium-plusz-10x30/examples/ebkm-promo-20000.yaml',
    published: { with: 4.35, without: -0.58 }
  },
  {
    label: 'plus-10x30/promo-100k',
    termMonths: 120,
    product: 'docs/product-specs/products/home-savings/premium-plusz-10x30/product.yaml',
    example: 'docs/product-specs/products/home-savings/premium-plusz-10x30/examples/ebkm-promo-100000.yaml',
    published: { with: 4.84, without: -0.1 }
  }
]

function readRepo(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

/** Open-closed raw-percent interval that roundEbkmPercent maps to `published`. */
function rawPercentBandForPublished(published: number): { lo: number; hiExclusive: number } {
  // Away-from-zero half-up to 2 decimals: |x| ∈ [Q-0.005, Q+0.005) → rounds to ±Q.
  const q = Math.abs(published)
  const magLo = q - 0.005
  const magHiExcl = q + 0.005
  if (published > 0) {
    return { lo: magLo, hiExclusive: magHiExcl }
  }
  if (published < 0) {
    // x ∈ (-(Q+0.005), -(Q-0.005)]  → store as [lo, hiExcl) with lo=-magHi, hiExcl=-magLo
    // actually closed at more-negative? |x| in [Q-0.005, Q+0.005)
    // x in (-(Q+0.005), -(Q-0.005)]
    return { lo: -magHiExcl, hiExclusive: -magLo + 1e-15 }
  }
  return { lo: -0.005, hiExclusive: 0.005 }
}

function ebkmAtK(
  deposits: Array<{ date: string; amount: number }>,
  payoutDate: string,
  k: number
) {
  return calculateEbkmFromLegs({
    deposits,
    payouts: [{ date: payoutDate, amount: k }]
  })
}

/** Inclusive K interval where percentRounded === published (binary search). */
function kBandForPublished(
  deposits: Array<{ date: string; amount: number }>,
  payoutDate: string,
  published: number,
  seedK: number
): { kMin: number; kMax: number } {
  // Higher K → higher EBKM. Find lowest K with rounded==published and highest.
  let lo = seedK * 0.9
  let hi = seedK * 1.1
  for (let e = 0; e < 40; e += 1) {
    const rLo = ebkmAtK(deposits, payoutDate, lo).percentRounded
    const rHi = ebkmAtK(deposits, payoutDate, hi).percentRounded
    if (rLo <= published && rHi >= published) break
    lo *= 0.95
    hi *= 1.05
  }

  // leftmost K where rounded >= published (entering band from below)
  let a = lo
  let b = hi
  for (let i = 0; i < 80; i += 1) {
    const mid = (a + b) / 2
    if (ebkmAtK(deposits, payoutDate, mid).percentRounded < published) a = mid
    else b = mid
  }
  const kMin = b

  // rightmost K where rounded <= published (leaving band upward)
  a = lo
  b = hi
  for (let i = 0; i < 80; i += 1) {
    const mid = (a + b) / 2
    if (ebkmAtK(deposits, payoutDate, mid).percentRounded <= published) a = mid
    else b = mid
  }
  const kMax = a

  // Verify
  if (roundEbkmPercent(ebkmAtK(deposits, payoutDate, kMin).rate * 100) !== published) {
    // nudge inward
  }
  return { kMin, kMax }
}

function main(): void {
  const schema = JSON.parse(readRepo(DEFAULT_PRODUCT_SCHEMA_PATH))
  // pctInBand: 0 = kMin, 100 = kMax (may be <0 or >100 when outside).
  // relΔmid / relΔedge: (engineK − mid|edge) / monthlyDeposit.
  console.log(
    [
      'label',
      'side',
      'term',
      'monthly',
      'pub%',
      'engineRaw%',
      'Kmin',
      'Kmax',
      'engineK',
      'pctInBand',
      'relΔmid',
      'relΔtoNearEdge',
      'inK?',
      'bandWidth/mo'
    ].join(' | ')
  )

  const summary: Array<{
    label: string
    side: string
    term: number
    monthly: number
    inK: boolean
    pctInBand: number
    relDeltaNear: number
    bandWidthPerMo: number
  }> = []

  for (const cell of CELLS) {
    const product = loadHomeSavingsProductSpec(readRepo(cell.product), schema)
    const base = YAML.parse(readRepo(cell.example)).inputs as HomeSavingsSpecInputs
    const monthly = Number(base.monthlyDeposit)
    for (const housingPurpose of [true, false] as const) {
      const published = housingPurpose ? cell.published.with : cell.published.without
      const instrument = mapHomeSavingsSpecInputsToInstrumentInput(product, {
        ...base,
        housingPurpose
      })
      const flows = buildHomeSavingsAszfEbkmCashFlows(instrument)
      const legs = buildEbkmLegsFromHomeSavingsCashFlows(flows, {
        retargetTerminalPayout: false
      })
      const payoutDate = legs.payouts[0]!.date
      const engineK = legs.payouts[0]!.amount
      const engine = calculateEbkmFromLegs({
        deposits: legs.deposits,
        payouts: [{ date: payoutDate, amount: engineK }]
      })
      const engineRaw = engine.rate * 100
      const { kMin, kMax } = kBandForPublished(
        legs.deposits,
        payoutDate,
        published,
        engineK
      )
      const mid = (kMin + kMax) / 2
      const bandWidth = kMax - kMin
      const pctInBand = bandWidth > 0 ? (100 * (engineK - kMin)) / bandWidth : 50
      const inK = engineK >= kMin - 0.01 && engineK <= kMax + 0.01
      const relDeltaMid = (engineK - mid) / monthly
      let deltaNear: number
      if (engineK < kMin) deltaNear = engineK - kMin
      else if (engineK > kMax) deltaNear = engineK - kMax
      else deltaNear = Math.min(engineK - kMin, kMax - engineK)
      const relDeltaNear = deltaNear / monthly
      const bandWidthPerMo = bandWidth / monthly

      const side = housingPurpose ? 'with' : 'without'
      console.log(
        [
          cell.label,
          side,
          cell.termMonths,
          monthly,
          published.toFixed(2),
          engineRaw.toFixed(6),
          kMin.toFixed(0),
          kMax.toFixed(0),
          engineK.toFixed(0),
          pctInBand.toFixed(1),
          relDeltaMid.toFixed(4),
          inK ? `slack ${relDeltaNear.toFixed(4)}` : `miss ${relDeltaNear.toFixed(4)}`,
          inK ? 'Y' : 'n',
          bandWidthPerMo.toFixed(4)
        ].join(' | ')
      )

      summary.push({
        label: cell.label,
        side,
        term: cell.termMonths,
        monthly,
        inK,
        pctInBand,
        relDeltaNear: inK ? 0 : relDeltaNear,
        bandWidthPerMo
      })
    }
  }

  console.log('\n=== Outside published K band (relative to monthly) ===')
  for (const row of summary.filter((r) => !r.inK)) {
    console.log(
      `${row.label} ${row.side} term=${row.term}: pctInBand=${row.pctInBand.toFixed(1)} missRel=${row.relDeltaNear.toFixed(4)}×monthly bandWidth/mo=${row.bandWidthPerMo.toFixed(4)}`
    )
  }

  console.log('\n=== Band width / monthly by term (median) ===')
  for (const term of [48, 96, 120]) {
    const rows = summary.filter((r) => r.term === term)
    const widths = rows.map((r) => r.bandWidthPerMo).sort((a, b) => a - b)
    const mid = widths[Math.floor(widths.length / 2)]!
    const pcts = rows.map((r) => r.pctInBand).sort((a, b) => a - b)
    const pctMid = pcts[Math.floor(pcts.length / 2)]!
    const misses = rows.filter((r) => !r.inK).length
    console.log(
      `${term}m: n=${rows.length} medianBand/mo=${mid.toFixed(4)} medianPctInBand=${pctMid.toFixed(1)} misses=${misses}/${rows.length}`
    )
  }
}

main()
