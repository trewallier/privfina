import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import YAML from 'yaml'
import { nthBusinessDayBefore, businessCalendarFromYearBlocks } from '../src/finance_engine/date_utils'
import {
  lookupBuborFixingPct,
  resolveMakFloatAnnualRatePct,
  resolveMakFloatObservationDateIso,
  type MakFloatIndexReset
} from '../src/finance_engine/instruments/mak_float_rate'
import {
  deriveKtvAccruedInterestAmount,
  generateKtvFloatCouponFlows,
  listKtvFloatPeriodTurnsIso,
  resolveKtvFloatAccrualStartIso
} from '../src/finance_engine/instruments/ktv'

/** Closed/open exceptions matching tip HU-VIBER 2026 (probe-relevant months). */
const CAL_2026 = {
  year: 2026,
  closed: [
    '2026-01-01',
    '2026-01-02',
    '2026-04-03',
    '2026-04-06',
    '2026-05-01',
    '2026-05-25',
    '2026-08-20',
    '2026-08-21',
    '2026-10-23',
    '2026-12-24',
    '2026-12-25',
    '2026-12-26'
  ],
  open: ['2026-01-10', '2026-08-08']
}

const INDEX_RESET: MakFloatIndexReset = {
  tenor: '3M',
  observationBusinessDaysBefore: 3,
  calendarId: 'HU-VIBER',
  roundToPct: 0.01,
  floorPct: 0.01,
  dayCountConvention: 'ACT/360',
  periodMonths: 3
}

const BUBOR = {
  series: {
    '3M': {
      rows: [
        ['2026-08-19', 5.54],
        ['2026-10-19', 5.5],
        ['2026-11-20', 5.5]
      ] as Array<[string, number]>
    }
  }
}

describe('nthBusinessDayBefore (ADR 0047)', () => {
  const cal = businessCalendarFromYearBlocks([CAL_2026])

  it('locks 2027/B period turn 2026-10-22 → observation 2026-10-19', () => {
    expect(nthBusinessDayBefore('2026-10-22', 3, cal)).toBe('2026-10-19')
  })

  it('locks 2036/B Aug turn 2026-08-26 → observation 2026-08-19 (skips closed 20–21)', () => {
    expect(nthBusinessDayBefore('2026-08-26', 3, cal)).toBe('2026-08-19')
  })

  it('returns null for non-positive n', () => {
    expect(nthBusinessDayBefore('2026-10-22', 0, cal)).toBeNull()
  })
})

describe('resolveMakFloatAnnualRatePct', () => {
  const calendar = { years: [CAL_2026] }

  it('resolves 2027/B current period ga 5.5% from BUBOR 3M on 2026-10-19', () => {
    expect(
      resolveMakFloatObservationDateIso({
        periodTurnIso: '2026-10-22',
        indexReset: INDEX_RESET,
        calendar
      })
    ).toBe('2026-10-19')
    expect(
      resolveMakFloatAnnualRatePct({
        periodTurnIso: '2026-10-22',
        indexReset: INDEX_RESET,
        bubor: BUBOR,
        calendar
      })
    ).toBe(5.5)
  })

  it('resolves 2036/B witness 5.54% for 2026-08-26 turn', () => {
    expect(
      resolveMakFloatAnnualRatePct({
        periodTurnIso: '2026-08-26',
        indexReset: INDEX_RESET,
        bubor: BUBOR,
        calendar
      })
    ).toBe(5.54)
  })

  it('returns null when BUBOR row is missing', () => {
    expect(
      resolveMakFloatAnnualRatePct({
        periodTurnIso: '2026-10-22',
        indexReset: INDEX_RESET,
        bubor: { series: { '3M': { rows: [['2026-10-18', 5.51]] } } },
        calendar
      })
    ).toBeNull()
  })

  it('returns null when calendar years are absent', () => {
    expect(
      resolveMakFloatAnnualRatePct({
        periodTurnIso: '2026-10-22',
        indexReset: INDEX_RESET,
        bubor: BUBOR,
        calendar: { years: [] }
      })
    ).toBeNull()
  })

  it('floors at floorPct when fixing is at or below zero', () => {
    expect(
      resolveMakFloatAnnualRatePct({
        periodTurnIso: '2026-10-22',
        indexReset: INDEX_RESET,
        bubor: { series: { '3M': { rows: [['2026-10-19', -0.25]] } } },
        calendar
      })
    ).toBe(0.01)
  })

  it('lookupBuborFixingPct is exact-date only', () => {
    expect(lookupBuborFixingPct(BUBOR, '3M', '2026-10-19')).toBe(5.5)
    expect(lookupBuborFixingPct(BUBOR, '3M', '2026-10-20')).toBeNull()
    expect(lookupBuborFixingPct(null, '3M', '2026-10-19')).toBeNull()
  })
})

describe('float-2027b-case.yaml golden', () => {
  it('locks example expecteds via resolve + cash path', () => {
    const example = YAML.parse(
      readFileSync(
        resolve(
          process.cwd(),
          'docs/product-specs/products/government-securities/ktv/examples/float-2027b-case.yaml'
        ),
        'utf8'
      )
    ) as {
      inputs: Record<string, unknown>
      expected: Record<string, unknown>
    }
    const calendar = { years: [CAL_2026] }
    expect(example.expected.periodTurnDate).toBe('2026-10-22')
    expect(example.expected.observationDate).toBe('2026-10-19')
    expect(
      resolveMakFloatObservationDateIso({
        periodTurnIso: String(example.expected.periodTurnDate),
        indexReset: INDEX_RESET,
        calendar
      })
    ).toBe(example.expected.observationDate)
    expect(
      resolveMakFloatAnnualRatePct({
        periodTurnIso: String(example.expected.periodTurnDate),
        indexReset: INDEX_RESET,
        bubor: BUBOR,
        calendar
      })
    ).toBe(example.expected.annualCouponRatePct)

    const inputs = {
      ...example.inputs,
      periodMonths: 3
    } as Parameters<typeof deriveKtvAccruedInterestAmount>[0]
    expect(resolveKtvFloatAccrualStartIso(inputs as never)).toBe('2026-10-22')
    expect(deriveKtvAccruedInterestAmount(inputs)).toBe(0)
  })
})

describe('ktv FLOAT cash path', () => {
  it('lists maturity-anniversary quarterly turns for 2027/B', () => {
    const turns = listKtvFloatPeriodTurnsIso({
      issueDate: '2020-01-15',
      maturityDate: '2027-04-22',
      periodMonths: 3
    })
    expect(turns).toContain('2026-10-22')
    expect(turns).toContain('2027-01-22')
    expect(turns).toContain('2027-04-22')
    expect(turns[turns.length - 1]).toBe('2027-04-22')
  })

  it('prefers explicit paymentDates when present', () => {
    expect(
      listKtvFloatPeriodTurnsIso({
        issueDate: '2020-01-15',
        maturityDate: '2027-04-22',
        periodMonths: 3,
        paymentDates: ['2026-10-22', '2027-01-22', '2027-04-22']
      })
    ).toEqual(['2026-10-22', '2027-01-22', '2027-04-22'])
  })

  it('pays ACT/360 coupon for rated periods and skips null rates', () => {
    // 2026-10-22 → 2027-01-22 = 92 days; 5.5% × 92/360 on 1_000_000 = 14055.5̅ → 14055.555…
    const flows = generateKtvFloatCouponFlows(
      {
        principal: 1_000_000,
        annualCouponRatePct: 5.5,
        purchaseDate: '2026-10-22',
        issueDate: '2020-01-15',
        maturityDate: '2027-04-22',
        dayCountConvention: 'ACT/360',
        periodMonths: 3,
        paymentDates: ['2026-10-22', '2027-01-22', '2027-04-22']
      },
      1_000_000,
      {
        '2027-01-22': 5.5,
        '2027-04-22': null
      }
    )
    const coupon = flows.find((f) => f.date === '2027-01-22')
    expect(coupon?.amount).toBeCloseTo((1_000_000 * 5.5 * 92) / (100 * 360), 10)
    expect(flows.some((f) => f.date === '2027-04-22' && f.amount !== 1_000_000)).toBe(false)
    expect(flows.filter((f) => f.date === '2027-04-22')).toHaveLength(1)
    expect(flows.filter((f) => f.date === '2027-04-22')[0].amount).toBe(1_000_000)
  })

  it('accrues FLOAT mid-period from period start turn under ACT/360', () => {
    // Purchase 2026-11-23; period start 2026-10-22; 32 days × 5.5% / 360
    const accrued = deriveKtvAccruedInterestAmount({
      principal: 1_000_000,
      annualCouponRatePct: 5.5,
      purchaseDate: '2026-11-23',
      issueDate: '2020-01-15',
      maturityDate: '2027-04-22',
      dayCountConvention: 'ACT/360',
      periodMonths: 3
    })
    expect(resolveKtvFloatAccrualStartIso({
      purchaseDate: '2026-11-23',
      issueDate: '2020-01-15',
      maturityDate: '2027-04-22',
      periodMonths: 3
    })).toBe('2026-10-22')
    expect(accrued).toBeCloseTo((1_000_000 * 5.5 * 32) / (100 * 360), 10)
  })
})
