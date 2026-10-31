/**
 * Slice A residual diagnostics (ADR 0031). Prints invert-solve ΔFt and
 * sensitivity / hypothesis results.
 *
 * Exploratory only — excluded from regular CI (`npm test`). Run via
 * `npm run test:exploratory`. Not a promotion gate — soft asserts only
 * (line counts). The 8/8 Hirdetmény bar lives in
 * `tests/home-savings-ebkm-verification.test.ts`.
 *
 * Packaging baselines:
 * - Invert-solve uses production ÁSZF flows (`buildHomeSavingsAszfEbkmCashFlows`).
 * - Fee-count / interest / +2-fee / combined hypotheses deliberately start from
 *   schedule (OTP maturity) flows to show why ÁSZF packaging was needed.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import YAML from 'yaml'
import {
  buildEbkmLegsFromHomeSavingsCashFlows,
  buildHomeSavingsAszfEbkmCashFlows,
  calculateEbkmFromLegs,
  calculateEbkmFromHomeSavingsCashFlows,
  calculateHomeSavingsDepositInterest,
  calculateHomeSavingsFromProductSpec,
  generateCashFlowsFromHomeSavingsProductSpec,
  loadHomeSavingsProductSpec,
  mapHomeSavingsSpecInputsToInstrumentInput,
  resolveHomeSavingsEbkmPayoutDate,
  resolveHomeSavingsMaturityPayoutDate,
  resolveHomeSavingsOpeningFee,
  type HomeSavingsSpecInputs
} from '../../src/finance_engine/engine'
import { CashFlowDirection } from '../../src/finance_engine/models'
import { DEFAULT_PRODUCT_SCHEMA_PATH } from '../../src/finance_engine/product_specs/loader'

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

function loadProduct() {
  const yamlText = readRepoFile(
    'docs/product-specs/products/home-savings/premium-plusz-10x30/product.yaml'
  )
  const schema = JSON.parse(readRepoFile(DEFAULT_PRODUCT_SCHEMA_PATH))
  return loadHomeSavingsProductSpec(yamlText, schema)
}

function toEbkmFlows(
  flows: ReturnType<typeof generateCashFlowsFromHomeSavingsProductSpec>
) {
  return flows.map((flow) => ({
    date: flow.date,
    amount: flow.amount,
    direction: (flow.direction === CashFlowDirection.Inflow ? 'inflow' : 'outflow') as
      | 'inflow'
      | 'outflow',
    description: flow.description
  }))
}

/** Find max K such that percentRounded === targetPct (upper edge of tick bucket). */
function maxKForRounded(
  deposits: Array<{ date: string; amount: number }>,
  payoutDate: string,
  targetPct: number,
  seedK: number
): number {
  // Half-up: for target 4.35, need raw < 4.355; for -0.58 need raw <= -0.575
  // Search K where rounded == targetPct, take the maximum such K.
  let lo = seedK * 0.95
  let hi = seedK * 1.05
  // Expand until we bracket
  for (let e = 0; e < 20; e += 1) {
    const rLo = calculateEbkmFromLegs({
      deposits,
      payouts: [{ date: payoutDate, amount: lo }]
    }).percentRounded
    const rHi = calculateEbkmFromLegs({
      deposits,
      payouts: [{ date: payoutDate, amount: hi }]
    }).percentRounded
    if (rLo <= targetPct && rHi >= targetPct) break
    lo *= 0.98
    hi *= 1.02
  }
  // Find boundary where rounded flips from targetPct to next
  let low = lo
  let high = hi
  for (let i = 0; i < 80; i += 1) {
    const mid = (low + high) / 2
    const rounded = calculateEbkmFromLegs({
      deposits,
      payouts: [{ date: payoutDate, amount: mid }]
    }).percentRounded
    if (rounded <= targetPct) {
      low = mid
    } else {
      high = mid
    }
  }
  return low
}

describe('home-savings EBKM residual diagnostics (Slice A)', () => {
  const product = loadProduct()
  const promo20k = YAML.parse(
    readRepoFile(
      'docs/product-specs/products/home-savings/premium-plusz-10x30/examples/ebkm-promo-20000.yaml'
    )
  )
  const baseInputs = promo20k.inputs as HomeSavingsSpecInputs

  it('invert-solves terminal K for published promo-20k EBKM and prints ΔFt', () => {
    const rows: string[] = []
    for (const housingPurpose of [true, false] as const) {
      const inputs = { ...baseInputs, housingPurpose }
      // Production ÁSZF packaging (not schedule OTP maturity flows).
      const instrument = mapHomeSavingsSpecInputsToInstrumentInput(product, inputs)
      const flows = buildHomeSavingsAszfEbkmCashFlows(instrument)
      const legs = buildEbkmLegsFromHomeSavingsCashFlows(flows, {
        retargetTerminalPayout: false
      })
      const engine = calculateHomeSavingsFromProductSpec(product, inputs)
      const published = housingPurpose ? 4.35 : -0.58
      const payoutDate = legs.payouts[0].date
      const engineK = legs.payouts[0].amount
      const maxK = maxKForRounded(legs.deposits, payoutDate, published, engineK)
      const delta = maxK - engineK
      const atMax = calculateEbkmFromLegs({
        deposits: legs.deposits,
        payouts: [{ date: payoutDate, amount: maxK }]
      })
      const aszfInterest = engineK - engine.totalDeposits - engine.premiumAmount
      rows.push(
        [
          housingPurpose ? 'withPremium' : 'withoutPremium',
          `published=${published}`,
          `engineK=${engineK}`,
          `engineEbkm=${engine.ebkmPct}`,
          `maxKForPublished=${maxK.toFixed(2)}`,
          `deltaFt=${delta.toFixed(2)}`,
          `rawAtMax=${(atMax.rate * 100).toFixed(8)}`,
          `aszfInterest=${aszfInterest}`,
          `scheduleInterest=${engine.depositInterest}`,
          `premium=${engine.premiumAmount}`
        ].join(' | ')
      )
    }
    // eslint-disable-next-line no-console
    console.log('\n=== Invert-solve K (ÁSZF packaging) ===\n' + rows.join('\n'))
    expect(rows.length).toBe(2)
  })

  it('sensitivity: terminal ±N Ft on promo-20k', () => {
    const lines: string[] = []
    for (const housingPurpose of [true, false] as const) {
      const flows = toEbkmFlows(
        generateCashFlowsFromHomeSavingsProductSpec(product, {
          ...baseInputs,
          housingPurpose
        })
      )
      const legs = buildEbkmLegsFromHomeSavingsCashFlows(flows)
      const baseK = legs.payouts[0].amount
      const payoutDate = legs.payouts[0].date
      for (const delta of [-50, -20, -10, -5, -3, -1, 0, 1, 3, 5, 10, 20, 50]) {
        const r = calculateEbkmFromLegs({
          deposits: legs.deposits,
          payouts: [{ date: payoutDate, amount: baseK + delta }]
        })
        lines.push(
          `${housingPurpose ? 'with' : 'without'} delta=${delta} → ${r.percentRounded} (raw ${(r.rate * 100).toFixed(6)})`
        )
      }
    }
    // eslint-disable-next-line no-console
    console.log('\n=== Terminal ±N Ft ===\n' + lines.join('\n'))
    expect(lines.length).toBeGreaterThan(0)
  })

  it('sensitivity: account fee count 120 vs 122', () => {
    const lines: string[] = []
    for (const housingPurpose of [true, false] as const) {
      const baseFlows = toEbkmFlows(
        generateCashFlowsFromHomeSavingsProductSpec(product, {
          ...baseInputs,
          housingPurpose
        })
      )
      const base = calculateEbkmFromHomeSavingsCashFlows(baseFlows)

      // Add two extra account-fee outflows after last deposit (months 121–122).
      const lastDeposit = baseFlows
        .filter((f) => f.description === 'Monthly deposit')
        .map((f) => f.date)
        .sort()
        .at(-1)!
      const [y, m] = lastDeposit.split('-').map(Number)
      const extras = [1, 2].map((add) => {
        const d = new Date(Date.UTC(y, m - 1 + add, 10))
        return {
          date: d.toISOString().slice(0, 10),
          amount: 500,
          direction: 'outflow' as const,
          description: 'Account management fee'
        }
      })
      const withExtra = calculateEbkmFromHomeSavingsCashFlows([...baseFlows, ...extras])
      lines.push(
        `${housingPurpose ? 'with' : 'without'}: base=${base.percentRounded} raw=${(base.rate * 100).toFixed(6)}; +2fees=${withExtra.percentRounded} raw=${(withExtra.rate * 100).toFixed(6)}`
      )
    }
    // eslint-disable-next-line no-console
    console.log('\n=== Fee count 120 vs 122 ===\n' + lines.join('\n'))
    expect(lines.length).toBe(2)
  })

  it('sensitivity: interest accrued to EBKM payout date vs maturity packaging', () => {
    const lines: string[] = []
    const maturityDate = resolveHomeSavingsMaturityPayoutDate({
      startDate: baseInputs.startDate,
      termMonths: baseInputs.termMonths
    })
    const lastDeposit = (() => {
      const start = new Date(baseInputs.startDate + 'T00:00:00Z')
      const d = new Date(
        Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + baseInputs.termMonths - 1, start.getUTCDate())
      )
      return d.toISOString().slice(0, 10)
    })()
    const ebkmPayout = resolveHomeSavingsEbkmPayoutDate(lastDeposit)

    for (const housingPurpose of [true, false] as const) {
      const openingFee = resolveHomeSavingsOpeningFee(product, {
        ...baseInputs,
        housingPurpose
      })
      const interestMaturity = calculateHomeSavingsDepositInterest({
        monthlyDeposit: baseInputs.monthlyDeposit,
        termMonths: baseInputs.termMonths,
        startDate: baseInputs.startDate,
        annualRatePct: 0.1,
        payoutDate: maturityDate
      })
      const interestEbkm = calculateHomeSavingsDepositInterest({
        monthlyDeposit: baseInputs.monthlyDeposit,
        termMonths: baseInputs.termMonths,
        startDate: baseInputs.startDate,
        annualRatePct: 0.1,
        payoutDate: ebkmPayout
      })
      const premium = housingPurpose ? baseInputs.monthlyDeposit * baseInputs.termMonths * 0.3 : 0
      const deposits = baseInputs.monthlyDeposit * baseInputs.termMonths
      const kMat = deposits + interestMaturity + premium
      const kEbkm = deposits + interestEbkm + premium

      const baseFlows = toEbkmFlows(
        generateCashFlowsFromHomeSavingsProductSpec(product, {
          ...baseInputs,
          housingPurpose
        })
      )
      const legs = buildEbkmLegsFromHomeSavingsCashFlows(baseFlows)
      const rMat = calculateEbkmFromLegs({
        deposits: legs.deposits,
        payouts: [{ date: ebkmPayout, amount: kMat }]
      })
      const rEbkm = calculateEbkmFromLegs({
        deposits: legs.deposits,
        payouts: [{ date: ebkmPayout, amount: kEbkm }]
      })
      lines.push(
        `${housingPurpose ? 'with' : 'without'}: opening=${openingFee}; intMat=${interestMaturity} K=${kMat} → ${rMat.percentRounded}; intEbkmDate=${interestEbkm} K=${kEbkm} → ${rEbkm.percentRounded} (Δint=${interestEbkm - interestMaturity})`
      )
    }
    // eslint-disable-next-line no-console
    console.log('\n=== Interest end date ===\n' + lines.join('\n'))
    expect(lines.length).toBe(2)
  })

  it('sensitivity: start-day conventions', () => {
    const lines: string[] = []
    // Month-end start days can produce invalid deposit calendars for day-31
    // rolling; keep diagnostics to stable 1st / 10th anchors.
    for (const startDate of ['2026-10-01', '2026-10-10'] as const) {
      for (const housingPurpose of [true, false] as const) {
        const live = calculateHomeSavingsFromProductSpec(product, {
          ...baseInputs,
          startDate,
          housingPurpose
        })
        lines.push(
          `start=${startDate} ${housingPurpose ? 'with' : 'without'} → ${live.ebkmPct}`
        )
      }
    }
    // eslint-disable-next-line no-console
    console.log('\n=== Start-day conventions ===\n' + lines.join('\n'))
    expect(lines.length).toBe(4)
  })

  it('hypothesis: +2 account fees closes both promo-20k legs without reopening others?', () => {
    const examples = [
      ['ebkm-promo-20000.yaml', { with: 4.35, without: -0.58 }],
      ['ebkm-promo-100000.yaml', { with: 4.84, without: -0.1 }],
      ['ebkm-standard-20000.yaml', { with: 4.12, without: -0.77 }],
      ['ebkm-standard-100000.yaml', { with: 4.48, without: -0.4 }]
    ] as const

    const results: string[] = []
    let green = 0
    let total = 0
    for (const [file, published] of examples) {
      const parsed = YAML.parse(
        readRepoFile(
          `docs/product-specs/products/home-savings/premium-plusz-10x30/examples/${file}`
        )
      )
      const inputs = parsed.inputs as HomeSavingsSpecInputs
      for (const housingPurpose of [true, false] as const) {
        const flows = toEbkmFlows(
          generateCashFlowsFromHomeSavingsProductSpec(product, {
            ...inputs,
            housingPurpose
          })
        )
        const lastDeposit = flows
          .filter((f) => f.description === 'Monthly deposit')
          .map((f) => f.date)
          .sort()
          .at(-1)!
        const [y, m] = lastDeposit.split('-').map(Number)
        const extras = [1, 2].map((add) => {
          const d = new Date(Date.UTC(y, m - 1 + add, 10))
          return {
            date: d.toISOString().slice(0, 10),
            amount: 500,
            direction: 'outflow' as const,
            description: 'Account management fee'
          }
        })
        const ebkm = calculateEbkmFromHomeSavingsCashFlows([...flows, ...extras])
        const target = housingPurpose ? published.with : published.without
        total += 1
        const match = ebkm.percentRounded === target
        if (match) green += 1
        results.push(
          `${file} ${housingPurpose ? 'with' : 'without'}: ${ebkm.percentRounded} vs ${target} ${match ? 'OK' : 'MISS'} raw=${(ebkm.rate * 100).toFixed(6)}`
        )
      }
    }
    // eslint-disable-next-line no-console
    console.log(`\n=== +2 fees hypothesis: ${green}/${total} ===\n` + results.join('\n'))
    // Informational — do not assert 8/8 here.
    expect(total).toBe(8)
  })

  it('USZ theoretical 0% / 0.5% / 1% opening-fee grid at 20k (diagnostic)', () => {
    // Hirdetmény-locked cells for 1% / 0.5% match commercially-usable goldens.
    // 0% opening-fee row is exploratory only: with-Premium 4.59 is reproduced under
    // ÁSZF packaging; without-Premium target 0.00 is NOT reproduced (engine ≈ −0.38)
    // and is not a locked Hirdetmény cell — do not treat as a promotion golden.
    const usz = {
      'standard-1pct': { with: 4.12, without: -0.77 },
      'promo-half-percent': { with: 4.35, without: -0.58 },
      zero: { with: 4.59, without: 0.0 }
    } as const

    const lines: string[] = []
    for (const [mode, published] of Object.entries(usz)) {
      for (const housingPurpose of [true, false] as const) {
        let openingFee: number
        let openingFeeMode: HomeSavingsSpecInputs['openingFeeMode']
        if (mode === 'zero') {
          openingFeeMode = 'standard-1pct'
        } else {
          openingFeeMode = mode as HomeSavingsSpecInputs['openingFeeMode']
        }
        const inputs = {
          ...baseInputs,
          housingPurpose,
          openingFeeMode
        }
        const instrument = mapHomeSavingsSpecInputsToInstrumentInput(product, inputs)
        const flows =
          mode === 'zero'
            ? buildHomeSavingsAszfEbkmCashFlows({ ...instrument, accountOpeningFee: 0 })
            : buildHomeSavingsAszfEbkmCashFlows(instrument)
        const ebkm = calculateEbkmFromHomeSavingsCashFlows(flows, {
          retargetTerminalPayout: false
        })
        const target = housingPurpose ? published.with : published.without
        openingFee =
          mode === 'zero'
            ? 0
            : resolveHomeSavingsOpeningFee(product, inputs)
        lines.push(
          `mode=${mode} fee=${openingFee} ${housingPurpose ? 'with' : 'without'}: engine=${ebkm.percentRounded} usz=${target} ${ebkm.percentRounded === target ? 'OK' : 'MISS'} raw=${(ebkm.rate * 100).toFixed(6)}`
        )
      }
    }
    // eslint-disable-next-line no-console
    console.log('\n=== USZ/Hirdetmény grid @20k (ÁSZF packaging) ===\n' + lines.join('\n'))
    expect(lines.length).toBe(6)
  })

  it('combined: +2 fees AND interest to EBKM payout date', () => {
    const lines: string[] = []
    let green = 0
    const examples = [
      ['ebkm-promo-20000.yaml', { with: 4.35, without: -0.58 }],
      ['ebkm-promo-100000.yaml', { with: 4.84, without: -0.1 }],
      ['ebkm-standard-20000.yaml', { with: 4.12, without: -0.77 }],
      ['ebkm-standard-100000.yaml', { with: 4.48, without: -0.4 }]
    ] as const

    for (const [file, published] of examples) {
      const parsed = YAML.parse(
        readRepoFile(
          `docs/product-specs/products/home-savings/premium-plusz-10x30/examples/${file}`
        )
      )
      const inputs = parsed.inputs as HomeSavingsSpecInputs
      for (const housingPurpose of [true, false] as const) {
        const instrumentFlows = generateCashFlowsFromHomeSavingsProductSpec(product, {
          ...inputs,
          housingPurpose
        })
        const lastDeposit = instrumentFlows
          .filter((f) => f.description === 'Monthly deposit')
          .map((f) => f.date)
          .sort()
          .at(-1)!
        const ebkmPayout = resolveHomeSavingsEbkmPayoutDate(lastDeposit)
        const interest = calculateHomeSavingsDepositInterest({
          monthlyDeposit: inputs.monthlyDeposit,
          termMonths: inputs.termMonths,
          startDate: inputs.startDate,
          annualRatePct: 0.1,
          payoutDate: ebkmPayout
        })
        const premium = housingPurpose
          ? inputs.monthlyDeposit * inputs.termMonths * 0.3
          : 0
        const k = inputs.monthlyDeposit * inputs.termMonths + interest + premium
        const outflows = toEbkmFlows(instrumentFlows).filter((f) => f.direction === 'outflow')
        const [y, m] = lastDeposit.split('-').map(Number)
        const extras = [1, 2].map((add) => {
          const d = new Date(Date.UTC(y, m - 1 + add, 10))
          return {
            date: d.toISOString().slice(0, 10),
            amount: 500,
            direction: 'outflow' as const,
            description: 'Account management fee'
          }
        })
        const ebkm = calculateEbkmFromHomeSavingsCashFlows([
          ...outflows,
          ...extras,
          { date: ebkmPayout, amount: k, direction: 'inflow', description: 'Terminal' }
        ])
        // Need to retarget? Terminal already on ebkmPayout — disable retarget
        const ebkm2 = calculateEbkmFromHomeSavingsCashFlows(
          [
            ...outflows,
            ...extras,
            { date: ebkmPayout, amount: k, direction: 'inflow', description: 'Terminal' }
          ],
          { retargetTerminalPayout: false }
        )
        const target = housingPurpose ? published.with : published.without
        if (ebkm2.percentRounded === target) green += 1
        lines.push(
          `${file} ${housingPurpose ? 'with' : 'without'}: ${ebkm2.percentRounded} vs ${target} raw=${(ebkm2.rate * 100).toFixed(6)} K=${k} int=${interest}`
        )
      }
    }
    // eslint-disable-next-line no-console
    console.log(`\n=== +2 fees + interest-to-EBKM-date: ${green}/8 ===\n` + lines.join('\n'))
    expect(lines.length).toBe(8)
  })
})
