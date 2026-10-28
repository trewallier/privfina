/**
 * ÁSZF/USZ deposit due rules:
 * - Regular monthly deposits: tárgyhó 12. napja
 * - First deposit: exempt; due by day 12 of the month after offer signing
 */
import { describe, expect, it } from 'vitest'
import {
  HOME_SAVINGS_REGULAR_MONTHLY_DEPOSIT_DUE_BY_DAY,
  assertHomeSavingsRegularDepositDayOfMonth,
  buildHomeSavingsAszfEbkmCashFlows,
  buildHomeSavingsMonthlyDepositDates,
  calculateEbkmFromHomeSavingsCashFlows,
  calculateHomeSavingsDepositInterest,
  calculateHomeSavingsFromProductSpec,
  loadHomeSavingsProductSpec,
  mapHomeSavingsSpecInputsToInstrumentInput,
  resolveHomeSavingsDepositDayOfMonth,
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
  it('exports due-by day 12 for regular deposits only; first credit may be day 13+', () => {
    expect(HOME_SAVINGS_REGULAR_MONTHLY_DEPOSIT_DUE_BY_DAY).toBe(12)
    expect(() => assertHomeSavingsRegularDepositDayOfMonth(12)).not.toThrow()
    expect(() => assertHomeSavingsRegularDepositDayOfMonth(1)).not.toThrow()
    expect(() => assertHomeSavingsRegularDepositDayOfMonth(13)).toThrow(/tárgyhó 12/)

    // First deposit exempt — startDate day 13/31 is legal; subsequent clamp to ≤12.
    expect(
      buildHomeSavingsMonthlyDepositDates({
        startDate: '2025-07-13',
        termMonths: 3
      })
    ).toEqual(['2025-07-13', '2025-08-12', '2025-09-12'])
    expect(
      buildHomeSavingsMonthlyDepositDates({
        startDate: '2025-07-31',
        termMonths: 3
      })
    ).toEqual(['2025-07-31', '2025-08-12', '2025-09-12'])
    expect(resolveHomeSavingsDepositDayOfMonth({ startDate: '2025-07-31' })).toBe(12)
    expect(resolveHomeSavingsDepositDayOfMonth({ startDate: '2025-07-03' })).toBe(3)
  })

  it('builds first credit on startDate then regular day for subsequent months', () => {
    const dates = buildHomeSavingsMonthlyDepositDates({
      startDate: '2025-01-03',
      termMonths: 4,
      depositDayOfMonth: 12
    })
    expect(dates).toEqual(['2025-01-03', '2025-02-12', '2025-03-12', '2025-04-12'])
  })

  it('composer default start uses saleWindow.to (first deposit may be after day 12)', () => {
    expect(
      defaultStartDateForSaleWindow({ from: '2023-03-01', to: '2025-07-31' })
    ).toBe('2025-07-31')
  })

  it('product-spec mapping accepts startDate after day 12 inside saleWindow', () => {
    const schema = JSON.parse(readRepo(DEFAULT_PRODUCT_SCHEMA_PATH))
    const product = loadHomeSavingsProductSpec(
      readRepo('docs/product-specs/products/home-savings/premium-4x10/product.yaml'),
      schema
    )
    const mapped = mapHomeSavingsSpecInputsToInstrumentInput(product, {
      monthlyDeposit: 20000,
      termMonths: 48,
      startDate: '2025-07-31',
      housingPurpose: true,
      openingFeeMode: 'standard-1pct'
    })
    expect(mapped.startDate).toBe('2025-07-31')
    expect(mapped.depositDayOfMonth).toBe(12)
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
    expect(interestMisaligned).not.toBe(interestAligned)

    const flowsAligned = buildHomeSavingsAszfEbkmCashFlows(aligned)
    const flowsMisaligned = buildHomeSavingsAszfEbkmCashFlows(misaligned)
    expect(
      flowsAligned.filter((f) => f.description === 'Monthly deposit').map((f) => f.date)
    ).toEqual(datesAligned)
    expect(
      flowsMisaligned.filter((f) => f.description === 'Monthly deposit').map((f) => f.date)
    ).toEqual(datesMisaligned)

    const ebkmAligned = calculateEbkmFromHomeSavingsCashFlows(flowsAligned, {
      retargetTerminalPayout: false
    })
    const ebkmMisaligned = calculateEbkmFromHomeSavingsCashFlows(flowsMisaligned, {
      retargetTerminalPayout: false
    })
    expect(ebkmMisaligned.percentRounded).not.toBe(ebkmAligned.percentRounded)
  })

  it('late first credit (day 31) clamps subsequent to day 12 and changes ACT/360 interest vs day-12 start', () => {
    const lateFirst = {
      monthlyDeposit: 100_000,
      termMonths: 12,
      startDate: '2025-01-31',
      accountFeeMonthly: 150,
      accountOpeningFee: 10_000,
      housingPurpose: false,
      depositInterestAnnualRatePct: 3.6
    }
    const alignedDay12 = { ...lateFirst, startDate: '2025-01-12' }

    const datesLate = buildHomeSavingsMonthlyDepositDates(lateFirst)
    expect(datesLate[0]).toBe('2025-01-31')
    expect(datesLate[1]).toBe('2025-02-12')
    expect(datesLate.at(-1)).toBe('2025-12-12')

    const interestLate = calculateHomeSavingsDepositInterest({
      monthlyDeposit: lateFirst.monthlyDeposit,
      termMonths: lateFirst.termMonths,
      startDate: lateFirst.startDate,
      annualRatePct: 3.6,
      payoutDate: resolveHomeSavingsEbkmPayoutDate(datesLate.at(-1)!)
    })
    const interestAligned = calculateHomeSavingsDepositInterest({
      monthlyDeposit: alignedDay12.monthlyDeposit,
      termMonths: alignedDay12.termMonths,
      startDate: alignedDay12.startDate,
      annualRatePct: 3.6,
      payoutDate: resolveHomeSavingsEbkmPayoutDate(
        buildHomeSavingsMonthlyDepositDates(alignedDay12).at(-1)!
      )
    })
    expect(interestLate).not.toBe(interestAligned)

    const ebkmLate = calculateEbkmFromHomeSavingsCashFlows(
      buildHomeSavingsAszfEbkmCashFlows(lateFirst),
      { retargetTerminalPayout: false }
    )
    const ebkmAligned = calculateEbkmFromHomeSavingsCashFlows(
      buildHomeSavingsAszfEbkmCashFlows(alignedDay12),
      { retargetTerminalPayout: false }
    )
    // Raw Annex 3 rate moves; half-up rounded % may still coincide on some cells.
    expect(ebkmLate.rate).not.toBe(ebkmAligned.rate)
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

  it('premium-8x30 EBKM examples stay green on aligned witness 2025-05-12', () => {
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
