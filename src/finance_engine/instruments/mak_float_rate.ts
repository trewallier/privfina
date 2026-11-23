/**
 * FLOAT MÁK (ktv) period-rate resolve from published BUBOR + HU-VIBER
 * (ADR 0047 / ROADMAP §6q). Specs hold rules only — never write derived
 * rates into families/ktv/coupons.
 */

import {
  businessCalendarFromYearBlocks,
  nthBusinessDayBefore,
  type BusinessCalendar,
  type BusinessDayHolidays
} from '../date_utils'

export type MakFloatIndexReset = {
  tenor: string
  observationBusinessDaysBefore: number
  calendarId: 'HU-VIBER' | string
  roundToPct: number
  floorPct: number
  dayCountConvention: string
  periodMonths: number
}

/** Minimal bubor.json series shape used by the resolver. */
export type BuborLookupSource = {
  series?: Record<string, { rows?: ReadonlyArray<readonly [string, number]> }>
}

export type SettlementCalendarLookupSource = {
  years?: ReadonlyArray<{
    year?: number
    closed?: ReadonlyArray<string>
    open?: ReadonlyArray<string>
  }>
}

export type ResolveMakFloatAnnualRateArgs = {
  periodTurnIso: string
  indexReset: MakFloatIndexReset
  bubor: BuborLookupSource | null | undefined
  calendar: BusinessDayHolidays | SettlementCalendarLookupSource | null | undefined
}

function roundToStep(value: number, step: number): number {
  if (!(step > 0) || !Number.isFinite(step)) return value
  return Math.round(value / step) * step
}

function roundToHundredths(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Look up a BUBOR fixing percent for tenor + ISO date.
 * Missing tenor/date → null (never invent zeros).
 */
export function lookupBuborFixingPct(
  bubor: BuborLookupSource | null | undefined,
  tenor: string,
  isoDate: string
): number | null {
  if (!bubor || !tenor || !isoDate) return null
  const block = bubor.series?.[tenor]
  const rows = block?.rows
  if (!Array.isArray(rows) || rows.length === 0) return null
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i]
    if (!row || row[0] !== isoDate) continue
    const pct = Number(row[1])
    return Number.isFinite(pct) ? pct : null
  }
  return null
}

function calendarFromSource(
  calendar: BusinessDayHolidays | SettlementCalendarLookupSource | null | undefined
): BusinessCalendar | null {
  if (calendar == null) return null
  if (Array.isArray(calendar) || (typeof calendar === 'object' && ('closed' in calendar || 'open' in calendar))) {
    return calendar as BusinessCalendar
  }
  const years = (calendar as SettlementCalendarLookupSource).years
  if (!Array.isArray(years) || years.length === 0) return null
  return businessCalendarFromYearBlocks(years)
}

/**
 * Resolve FLOAT MÁK period annual rate percent from indexReset + refs.
 * Returns null when observation date, calendar, or BUBOR fixing is missing.
 */
export function resolveMakFloatAnnualRatePct(
  args: ResolveMakFloatAnnualRateArgs
): number | null {
  const { periodTurnIso, indexReset, bubor } = args
  if (!periodTurnIso || !/^\d{4}-\d{2}-\d{2}$/.test(periodTurnIso)) return null
  if (!indexReset) return null

  const n = Number(indexReset.observationBusinessDaysBefore)
  if (!Number.isInteger(n) || n < 1) return null

  const cal = calendarFromSource(args.calendar)
  if (cal == null) return null

  const observationIso = nthBusinessDayBefore(periodTurnIso, n, cal)
  if (!observationIso) return null

  const fixing = lookupBuborFixingPct(bubor, String(indexReset.tenor || ''), observationIso)
  if (fixing == null) return null

  const step = Number(indexReset.roundToPct)
  const floor = Number(indexReset.floorPct)
  let rate = roundToStep(fixing, step > 0 ? step : 0.01)
  if (Number.isFinite(floor) && rate < floor) rate = floor
  return roundToHundredths(rate)
}

/**
 * Convenience: observation ISO for a period turn under indexReset + calendar.
 */
export function resolveMakFloatObservationDateIso(args: {
  periodTurnIso: string
  indexReset: Pick<MakFloatIndexReset, 'observationBusinessDaysBefore'>
  calendar: BusinessDayHolidays | SettlementCalendarLookupSource | null | undefined
}): string | null {
  const n = Number(args.indexReset.observationBusinessDaysBefore)
  if (!Number.isInteger(n) || n < 1) return null
  const cal = calendarFromSource(args.calendar)
  if (cal == null) return null
  return nthBusinessDayBefore(args.periodTurnIso, n, cal)
}
