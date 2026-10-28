import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  calculateHomeSavingsFromProductSpec,
  loadHomeSavingsProductSpec
} from '../src/finance_engine/engine'
import { DEFAULT_PRODUCT_SCHEMA_PATH } from '../src/finance_engine/product_specs/loader'

/**
 * Accepted deposit-interest model (ROADMAP §5f / probe Phase 8):
 * ACT/360 calendar daily accrual + whole-forint year-cap and final Math.round,
 * maturity packaging (lastDeposit month + 2 → day-1).
 *
 * Internal Premium Plus 8x30 tariff Kamat (Ft) goldens (2025-09-30) are matched
 * within absMaxDeltaFt under witness startDate 2025-09-04. Further interest
 * fine-tuning is deferred — do not tighten this bar without a new ROADMAP slice.
 */

type TariffGolden = {
  witness: { termMonths: number; startDate: string }
  tolerance: { absMaxDeltaFt: number }
  rows: Array<{
    monthlyDeposit: number
    kamatFt: number
    totalDeposits: number
    premiumAmount: number
  }>
}

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

describe('home-savings Premium Plus 8x30 tariff Kamat tolerance', () => {
  const schema = JSON.parse(readRepoFile(DEFAULT_PRODUCT_SCHEMA_PATH))
  const product = loadHomeSavingsProductSpec(
    readRepoFile('docs/product-specs/products/home-savings/premium-plusz-8x30/product.yaml'),
    schema
  )
  const golden = JSON.parse(
    readRepoFile(
      'docs/product-specs/products/home-savings/premium-plusz-8x30/examples/tariff-kamat-20250930.json'
    )
  ) as TariffGolden

  const { startDate, termMonths } = golden.witness
  const absMax = golden.tolerance.absMaxDeltaFt

  it('locks witness startDate inside saleWindow and accepted abs tolerance', () => {
    expect(product.saleWindow?.from).toBe('2025-08-01')
    expect(product.saleWindow?.to).toBe('2026-08-02')
    expect(startDate >= '2025-08-01' && startDate <= '2026-08-02').toBe(true)
    expect(termMonths).toBe(96)
    expect(absMax).toBe(11)
    expect(golden.rows).toHaveLength(91)
  })

  it(`matches all 91 tariff Kamat (Ft) rows within ±${11} Ft under ACT/360 whole-Ft caps`, () => {
    const deltas: Array<{ monthlyDeposit: number; deltaFt: number }> = []

    for (const row of golden.rows) {
      const openingFeeMode =
        row.monthlyDeposit >= 50_000 ? 'promo-fixed-50000' : 'promo-half-percent'
      const out = calculateHomeSavingsFromProductSpec(product, {
        monthlyDeposit: row.monthlyDeposit,
        termMonths,
        startDate,
        housingPurpose: true,
        openingFeeMode
      })

      expect(out.totalDeposits).toBe(row.totalDeposits)
      expect(out.premiumAmount).toBe(row.premiumAmount)

      const deltaFt = out.depositInterest - row.kamatFt
      deltas.push({ monthlyDeposit: row.monthlyDeposit, deltaFt })
      expect(Math.abs(deltaFt)).toBeLessThanOrEqual(absMax)
    }

    const abs = deltas.map((d) => Math.abs(d.deltaFt))
    const absMean = abs.reduce((s, x) => s + x, 0) / abs.length
    const absMaxObserved = Math.max(...abs)
    const exact = deltas.filter((d) => d.deltaFt === 0).length

    // Pin observed-band character so silent regressions toward looser spread fail loudly.
    expect(exact).toBeGreaterThanOrEqual(10)
    expect(absMean).toBeLessThanOrEqual(3)
    expect(absMaxObserved).toBeLessThanOrEqual(absMax)
  })
})
