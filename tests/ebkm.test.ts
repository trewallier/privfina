import { describe, expect, it } from 'vitest'
import {
  buildEbkmFlowsFromLegs,
  buildEbkmLegsFromHomeSavingsCashFlows,
  calculateEbkm,
  calculateEbkmFromHomeSavingsCashFlows,
  calculateEbkmFromLegs,
  calendarDaysBetween,
  ebkmPresentValue,
  ebkmYearFraction,
  resolveHomeSavingsEbkmPayoutDate,
  roundEbkmPercent,
  type EbkmDatedFlow
} from '../src/finance_engine/instruments/ebkm'

describe('calendarDaysBetween / ebkmYearFraction (3. melléklet t/365)', () => {
  it('returns 0 for the same calendar day', () => {
    expect(calendarDaysBetween('2026-10-10', '2026-10-10')).toBe(0)
    expect(ebkmYearFraction('2026-10-10', '2026-10-10')).toBe(0)
  })

  it('divides calendar days by 365', () => {
    expect(calendarDaysBetween('2026-01-01', '2027-01-01')).toBe(365)
    expect(ebkmYearFraction('2026-01-01', '2027-01-01')).toBe(1)
    expect(ebkmYearFraction('2026-10-10', '2026-11-10')).toBeCloseTo(31 / 365, 12)
  })
})

describe('roundEbkmPercent (6. § two decimals)', () => {
  it('rounds half-up to two decimal places', () => {
    expect(roundEbkmPercent(4.345)).toBe(4.35)
    expect(roundEbkmPercent(4.344)).toBe(4.34)
    expect(roundEbkmPercent(-0.575)).toBe(-0.58)
    expect(roundEbkmPercent(-0.574)).toBe(-0.57)
    expect(roundEbkmPercent(4.84)).toBe(4.84)
  })
})

describe('calculateEbkm (3. melléklet)', () => {
  it('solves a one-year single deposit / payout at 10%', () => {
    const flows: EbkmDatedFlow[] = [
      { yearFraction: 0, amount: -1000 },
      { yearFraction: 1, amount: 1100 }
    ]
    const ebkm = calculateEbkm(flows)
    expect(ebkm.rate).toBeCloseTo(0.1, 12)
    expect(ebkm.percentRounded).toBe(10)
    expect(ebkmPresentValue(ebkm.rate, flows)).toBeCloseTo(0, 10)
  })

  it('lowers EBKM when fees are added as deposit legs', () => {
    const base = calculateEbkmFromLegs({
      deposits: [
        { date: '2026-01-01', amount: 1000 },
        { date: '2026-07-01', amount: 1000 }
      ],
      payouts: [{ date: '2027-01-01', amount: 2100 }]
    })
    const withFee = calculateEbkmFromLegs({
      deposits: [
        { date: '2026-01-01', amount: 1000 },
        { date: '2026-01-01', amount: 50 },
        { date: '2026-07-01', amount: 1000 }
      ],
      payouts: [{ date: '2027-01-01', amount: 2100 }]
    })
    expect(withFee.rate).toBeLessThan(base.rate)
  })

  it('allows negative EBKM when fees dominate', () => {
    const ebkm = calculateEbkmFromLegs({
      deposits: [
        { date: '2026-01-01', amount: 1000 },
        { date: '2026-01-01', amount: 200 }
      ],
      payouts: [{ date: '2027-01-01', amount: 1000 }]
    })
    expect(ebkm.percentRounded).toBeLessThan(0)
  })

  it('rejects flows without both deposits and payouts', () => {
    expect(() => calculateEbkm([{ yearFraction: 0, amount: -100 }])).toThrow(
      /both deposits and payouts/i
    )
    expect(() => buildEbkmFlowsFromLegs({ deposits: [], payouts: [] })).toThrow(
      /at least one deposit/i
    )
  })

  it('maps home-savings schedule-shaped legs through the cash-flow helper', () => {
    // Disable kiutalás retarget so the one-year fixture stays on stated dates.
    const ebkm = calculateEbkmFromHomeSavingsCashFlows(
      [
        { date: '2026-01-01', amount: 1000, direction: 'outflow' },
        { date: '2027-01-01', amount: 1100, direction: 'inflow' }
      ],
      { retargetTerminalPayout: false }
    )
    expect(ebkm.percentRounded).toBe(10)
  })

  it('retargets home-savings terminal inflow to ÁSZF kiutalás payout date by default', () => {
    const scheduleDated = calculateEbkmFromHomeSavingsCashFlows(
      [
        { date: '2026-10-10', amount: 1000, direction: 'outflow' },
        { date: '2036-09-10', amount: 1000, direction: 'outflow' },
        { date: '2036-09-10', amount: 2500, direction: 'inflow' }
      ],
      { retargetTerminalPayout: false }
    )
    const aszfPackaged = calculateEbkmFromHomeSavingsCashFlows([
      { date: '2026-10-10', amount: 1000, direction: 'outflow' },
      { date: '2036-09-10', amount: 1000, direction: 'outflow' },
      { date: '2036-09-10', amount: 2500, direction: 'inflow' }
    ])
    expect(resolveHomeSavingsEbkmPayoutDate('2036-09-10')).toBe('2036-12-01')
    expect(aszfPackaged.percentRounded).toBeLessThan(scheduleDated.percentRounded)
  })

  it('anchors kiutalás retarget on Monthly deposit labels, not later fee-only outflows', () => {
    const legs = buildEbkmLegsFromHomeSavingsCashFlows([
      { date: '2026-10-10', amount: 1000, direction: 'outflow', description: 'Monthly deposit' },
      { date: '2036-09-10', amount: 1000, direction: 'outflow', description: 'Monthly deposit' },
      // Hypothetical later fee must not shift last-deposit month.
      { date: '2036-10-15', amount: 500, direction: 'outflow', description: 'Account management fee' },
      { date: '2036-11-01', amount: 2500, direction: 'inflow', description: 'Home-savings terminal payout' }
    ])
    expect(legs.payouts[0].date).toBe('2036-12-01')
  })
})
