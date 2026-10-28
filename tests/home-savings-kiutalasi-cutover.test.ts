/**
 * ÁSZF §22 (4): kiutalási időszak is 3 months before 2017-07-01, 2 months on/after.
 */
import { describe, expect, it } from 'vitest'
import {
  HOME_SAVINGS_KIUTALASI_PERIOD_CUTOVER_DATE,
  HOME_SAVINGS_KIUTALASI_PERIOD_MONTHS,
  HOME_SAVINGS_KIUTALASI_PERIOD_MONTHS_BEFORE_CUTOVER,
  buildHomeSavingsAszfEbkmCashFlows,
  calculateEbkmFromHomeSavingsCashFlows,
  calculateHomeSavingsFromProductSpec,
  loadHomeSavingsProductSpec,
  resolveHomeSavingsEbkmPayoutDate,
  resolveHomeSavingsMaturityPayoutDate,
  resolveKiutalasiPeriodMonths,
  resolveKiutalasiPeriodMonthsForContractStart
} from '../src/finance_engine/engine'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DEFAULT_PRODUCT_SCHEMA_PATH } from '../src/finance_engine/product_specs/loader'

function readRepo(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

describe('home-savings ÁSZF §22 (4) kiutalási cutover 2017-07-01', () => {
  it('exports cutover constants and resolves 3 before / 2 on-or-after', () => {
    expect(HOME_SAVINGS_KIUTALASI_PERIOD_CUTOVER_DATE).toBe('2017-07-01')
    expect(HOME_SAVINGS_KIUTALASI_PERIOD_MONTHS_BEFORE_CUTOVER).toBe(3)
    expect(HOME_SAVINGS_KIUTALASI_PERIOD_MONTHS).toBe(2)
    expect(resolveKiutalasiPeriodMonthsForContractStart('2017-06-30')).toBe(3)
    expect(resolveKiutalasiPeriodMonthsForContractStart('2017-07-01')).toBe(2)
    expect(resolveKiutalasiPeriodMonthsForContractStart('2025-07-02')).toBe(2)
    expect(resolveKiutalasiPeriodMonths({ startDate: '2017-06-30' })).toBe(3)
    expect(resolveKiutalasiPeriodMonths({ startDate: '2017-07-01' })).toBe(2)
    // Without startDate, YAML alloc−eval still works (parity / post-cutover schemes).
    expect(
      resolveKiutalasiPeriodMonths({ evaluationMinMonths: 48, allocationMinMonths: 50 })
    ).toBe(2)
  })

  it('EBKM payout marker is lastDepositMonth + kiutalási + 1 (day-1)', () => {
    // Post-cutover (2): +3 → 2025-12-01
    expect(resolveHomeSavingsEbkmPayoutDate('2025-09-10', { kiutalasiPeriodMonths: 2 })).toBe(
      '2025-12-01'
    )
    // Pre-cutover (3): +4 → 2026-01-01
    expect(resolveHomeSavingsEbkmPayoutDate('2025-09-10', { kiutalasiPeriodMonths: 3 })).toBe(
      '2026-01-01'
    )
    // Default remains post-cutover +3 for callers that omit options.
    expect(resolveHomeSavingsEbkmPayoutDate('2025-09-10')).toBe('2025-12-01')
  })

  it('maturity day-1 lag follows kiutalási from startDate', () => {
    // Pre: last anniversary 2018-05-30 + 3 → 2018-08-01
    expect(
      resolveHomeSavingsMaturityPayoutDate({
        startDate: '2017-06-30',
        termMonths: 12
      })
    ).toBe('2018-08-01')
    // Post: last anniversary 2018-06-01 + 2 → 2018-08-01
    expect(
      resolveHomeSavingsMaturityPayoutDate({
        startDate: '2017-07-01',
        termMonths: 12
      })
    ).toBe('2018-08-01')
  })

  it('pre-cutover startDate lengthens ÁSZF EBKM fee span and moves rounded EBKM vs post-cutover', () => {
    const base = {
      monthlyDeposit: 20_000,
      termMonths: 48,
      accountFeeMonthly: 150,
      accountOpeningFee: 17_200,
      housingPurpose: false,
      depositInterestAnnualRatePct: 0.1
    }
    const pre = buildHomeSavingsAszfEbkmCashFlows({ ...base, startDate: '2017-06-30' })
    const post = buildHomeSavingsAszfEbkmCashFlows({ ...base, startDate: '2017-07-01' })
    const feePre = pre.filter((f) => f.description === 'Account management fee').length
    const feePost = post.filter((f) => f.description === 'Account management fee').length
    expect(feePre).toBe(48 + 3)
    expect(feePost).toBe(48 + 2)
    const ebkmPre = calculateEbkmFromHomeSavingsCashFlows(pre, { retargetTerminalPayout: false })
    const ebkmPost = calculateEbkmFromHomeSavingsCashFlows(post, { retargetTerminalPayout: false })
    // Fee span + interest horizon differ → Annex 3 rounded EBKM moves on short (4y) term.
    expect(ebkmPre.percentRounded).not.toBe(ebkmPost.percentRounded)
  })

  it('catalog módozat saleWindows are all on/after the cutover (no pre-2017 offering in catalog)', () => {
    const schema = JSON.parse(readRepo(DEFAULT_PRODUCT_SCHEMA_PATH))
    const products = [
      'premium-4x10',
      'premium-8x30',
      'premium-plusz-4x10',
      'premium-plusz-8x30',
      'premium-plusz-10x30'
    ]
    for (const code of products) {
      const product = loadHomeSavingsProductSpec(
        readRepo(`docs/product-specs/products/home-savings/${code}/product.yaml`),
        schema
      )
      expect(product.saleWindow?.from >= HOME_SAVINGS_KIUTALASI_PERIOD_CUTOVER_DATE).toBe(true)
      // YAML start inside window → always post-cutover kiutalási = 2
      const start = product.saleWindow!.from
      const live = calculateHomeSavingsFromProductSpec(product, {
        monthlyDeposit: 20000,
        termMonths: product.engine.evaluationMinMonths ?? 48,
        startDate: start,
        housingPurpose: true,
        openingFeeMode: 'standard-1pct'
      })
      expect(live.ebkmPct).toEqual(expect.any(Number))
      expect(resolveKiutalasiPeriodMonths({ startDate: start })).toBe(2)
    }
  })
})
