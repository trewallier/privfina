/**
 * ÁSZF/USZ tárgyhó 12. napja — regular monthly deposit due bound + schedule alignment.
 */
import { describe, expect, it } from 'vitest'
import {
  HOME_SAVINGS_REGULAR_MONTHLY_DEPOSIT_DUE_BY_DAY,
  assertHomeSavingsRegularDepositDayOfMonth,
  assertHomeSavingsStartDateDepositDay,
  buildHomeSavingsAszfEbkmCashFlows,
  buildHomeSavingsMonthlyDepositDates,
  calculateEbkmFromHomeSavingsCashFlows,
  calculateHomeSavingsDepositInterest,
  calculateHomeSavingsFromProductSpec,
  loadHomeSavingsProductSpec,
  mapHomeSavingsSpecInputsToInstrumentInput,
  resolveHomeSavingsEbkmPayoutDate
} from '../src/finance_engine/engine'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DEFAULT_PRODUCT_SCHEMA_PATH } from '../src/finance_engine/product_specs/loader'
import { defaultStartDateForSaleWindow } from '../public/controller/home-savings-product-metadata.js'

function readRepo(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

describe('home-savings ÁSZF deposit due-by day (tárgyhó 12.)', () => {
  it('exports due-by day 12 and rejects day 13+', () => {
    expect(HOME_SAVINGS_REGULAR_MONTHLY_DEPOSIT_DUE_BY_DAY).toBe(12)
    expect(() => assertHomeSavingsRegularDepositDayOfMonth(12)).not.toThrow()
    expect(() => assertHomeSavingsRegularDepositDayOfMonth(1)).not.toThrow()
    expect(() => assertHomeSavingsRegularDepositDayOfMonth(13)).toThrow(/tárgyhó 12/)
    expect(() => assertHomeSavingsStartDateDepositDay('2025-07-13')).toThrow(/tárgyhó 12/)
    expect(() => assertHomeSavingsStartDateDepositDay('2025-07-12')).not.toThrow()
  })

  it('builds first credit on startDate then regular day for subsequent months', () => {
    const dates = buildHomeSavingsMonthlyDepositDates({
      startDate: '2025-01-03',
      termMonths: 4,
      depositDayOfMonth: 12
    })
    expect(dates).toEqual(['2025-01-03', '2025-02-12', '2025-03-12', '2025-04-12'])
  })

  it('composer default start clamps saleWindow.to past day 12 down to day 12', () => {
    expect(
      defaultStartDateForSaleWindow({ from: '2023-03-01', to: '2025-07-31' })
    ).toBe('2025-07-12')
  })

  it('product-spec mapping rejects startDate after day 12', () => {
    const schema = JSON.parse(readRepo(DEFAULT_PRODUCT_SCHEMA_PATH))
    const product = loadHomeSavingsProductSpec(
      readRepo('docs/product-specs/products/home-savings/premium-4x10/product.yaml'),
      schema
    )
    expect(() =>
      mapHomeSavingsSpecInputsToInstrumentInput(product, {
        monthlyDeposit: 20000,
        termMonths: 48,
        startDate: '2025-07-31',
        housingPurpose: true,
        openingFeeMode: 'standard-1pct'
      })
    ).toThrow(/tárgyhó 12/)
  })

  it('misaligned regular deposit day (3 vs 12) shifts last deposit, interest, and Annex 3 EBKM', () => {
    const aligned = {
      monthlyDeposit: 100_000,
      termMonths: 12,
      startDate: '2025-01-03',
      depositDayOfMonth: 3,
      accountFeeMonthly: 150,
      accountOpeningFee: 10_000,
      housingPurpose: false,
      depositInterestAnnualRatePct: 3.6
    }
    const misaligned = { ...aligned, depositDayOfMonth: 12 }

    const datesAligned = buildHomeSavingsMonthlyDepositDates(aligned)
    const datesMisaligned = buildHomeSavingsMonthlyDepositDates(misaligned)
    expect(datesAligned[0]).toBe('2025-01-03')
    expect(datesMisaligned[0]).toBe('2025-01-03')
    expect(datesAligned.at(-1)).toBe('2025-12-03')
    expect(datesMisaligned.at(-1)).toBe('2025-12-12')
    // ADR 0031 payout marker is lastDepositMonth+3 day-1 — same calendar month → same payout date.
    expect(resolveHomeSavingsEbkmPayoutDate(datesAligned.at(-1)!)).toBe('2026-03-01')
    expect(resolveHomeSavingsEbkmPayoutDate(datesMisaligned.at(-1)!)).toBe('2026-03-01')

    const interestAligned = calculateHomeSavingsDepositInterest({
      monthlyDeposit: aligned.monthlyDeposit,
      termMonths: aligned.termMonths,
      startDate: aligned.startDate,
      depositDayOfMonth: aligned.depositDayOfMonth,
      annualRatePct: 3.6,
      payoutDate: resolveHomeSavingsEbkmPayoutDate(datesAligned.at(-1)!)
    })
    const interestMisaligned = calculateHomeSavingsDepositInterest({
      monthlyDeposit: misaligned.monthlyDeposit,
      termMonths: misaligned.termMonths,
      startDate: misaligned.startDate,
      depositDayOfMonth: misaligned.depositDayOfMonth,
      annualRatePct: 3.6,
      payoutDate: resolveHomeSavingsEbkmPayoutDate(datesMisaligned.at(-1)!)
    })
    expect(interestMisaligned).toBeGreaterThan(0)
    expect(interestAligned).toBeGreaterThan(0)
    // Later subsequent credits shorten ACT/360 accrual windows → different K even with shared payout day.
    expect(interestMisaligned).not.toBe(interestAligned)

    const flowsAligned = buildHomeSavingsAszfEbkmCashFlows(aligned)
    const flowsMisaligned = buildHomeSavingsAszfEbkmCashFlows(misaligned)
    const depositDatesAligned = flowsAligned
      .filter((f) => f.description === 'Monthly deposit')
      .map((f) => f.date)
    const depositDatesMisaligned = flowsMisaligned
      .filter((f) => f.description === 'Monthly deposit')
      .map((f) => f.date)
    expect(depositDatesAligned).toEqual(datesAligned)
    expect(depositDatesMisaligned).toEqual(datesMisaligned)

    const ebkmAligned = calculateEbkmFromHomeSavingsCashFlows(flowsAligned, {
      retargetTerminalPayout: false
    })
    const ebkmMisaligned = calculateEbkmFromHomeSavingsCashFlows(flowsMisaligned, {
      retargetTerminalPayout: false
    })
    // Later deposit legs change Annex 3 t_i and terminal K → rounded EBKM moves.
    expect(ebkmMisaligned.percentRounded).not.toBe(ebkmAligned.percentRounded)
  })

  it('rejects depositDayOfMonth past ÁSZF bound even when startDate is legal', () => {
    expect(() =>
      buildHomeSavingsMonthlyDepositDates({
        startDate: '2025-01-03',
        termMonths: 3,
        depositDayOfMonth: 13
      })
    ).toThrow(/tárgyhó 12/)
  })

  it('premium-8x30 EBKM examples stay green on ÁSZF day≤12 witness 2025-05-12', () => {
    const schema = JSON.parse(readRepo(DEFAULT_PRODUCT_SCHEMA_PATH))
    const product = loadHomeSavingsProductSpec(
      readRepo('docs/product-specs/products/home-savings/premium-8x30/product.yaml'),
      schema
    )
    const live = calculateHomeSavingsFromProductSpec(product, {
      monthlyDeposit: 20000,
      termMonths: 96,
      startDate: '2025-05-12',
      housingPurpose: true,
      openingFeeMode: 'standard-1pct'
    })
    expect(live.ebkmPct).toBe(5.54)
  })
})
