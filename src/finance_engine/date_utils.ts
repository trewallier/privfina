export function parseIsoDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) {
    throw new Error(`Invalid ISO date: ${value}`)
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Invalid calendar date: ${value}`)
  }

  return date
}

export function formatIsoDate(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function daysInMonthUtc(year: number, monthZeroBased: number): number {
  return new Date(Date.UTC(year, monthZeroBased + 1, 0)).getUTCDate()
}

export function isWeekendUtc(date: Date): boolean {
  const weekday = date.getUTCDay()
  return weekday === 0 || weekday === 6
}

/**
 * Mon–Fri exception calendar (ADR 0046).
 * `closed` = non-business weekdays; `open` = business weekends (relocated Saturdays).
 */
export interface BusinessCalendar {
  closed?: ReadonlyArray<string>
  open?: ReadonlyArray<string>
}

/** Caller-supplied holiday list (closed-only) or full business calendar. */
export type BusinessDayHolidays = ReadonlyArray<string> | BusinessCalendar

export interface BusinessCalendarSets {
  closed: ReadonlySet<string>
  open: ReadonlySet<string>
}

function isBusinessCalendar(value: unknown): value is BusinessCalendar {
  return (
    value != null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !(value instanceof Set) &&
    ('closed' in value || 'open' in value || Object.keys(value as object).length === 0)
  )
}

/**
 * Normalize a holiday list, Set, or BusinessCalendar into closed/open sets.
 * Plain arrays / Sets are treated as closed-only (salary backward compatibility).
 */
export function toBusinessCalendarSets(
  input: BusinessDayHolidays | ReadonlySet<string> | BusinessCalendarSets = []
): BusinessCalendarSets {
  if (Array.isArray(input)) {
    return { closed: new Set(input), open: new Set() }
  }
  if (input instanceof Set) {
    return { closed: input, open: new Set() }
  }
  if (isBusinessCalendar(input)) {
    const closed = (input as BusinessCalendar | BusinessCalendarSets).closed
    const open = (input as BusinessCalendar | BusinessCalendarSets).open
    return {
      closed: closed instanceof Set ? closed : new Set(closed ?? []),
      open: open instanceof Set ? open : new Set(open ?? [])
    }
  }
  // ReadonlySet duck-type (salary / older call sites).
  if (
    input != null &&
    typeof input === 'object' &&
    typeof (input as ReadonlySet<string>).has === 'function'
  ) {
    return { closed: input as ReadonlySet<string>, open: new Set() }
  }
  return { closed: new Set(), open: new Set() }
}

/** @deprecated Prefer toBusinessCalendarSets; kept for salary holiday-list call sites. */
export function toHolidaySet(holidays: ReadonlyArray<string> = []): Set<string> {
  return new Set(holidays)
}

export function isBusinessDayUtc(
  date: Date,
  holidays:
    | ReadonlyArray<string>
    | ReadonlySet<string>
    | BusinessCalendar
    | BusinessCalendarSets = new Set()
): boolean {
  const { closed, open } = toBusinessCalendarSets(holidays)
  const iso = formatIsoDate(date)
  if (open.has(iso)) {
    return true
  }
  if (isWeekendUtc(date)) {
    return false
  }
  return !closed.has(iso)
}

/**
 * Flatten multi-year settlement exception blocks into one BusinessCalendar
 * (ADR 0046 consumers of refs/settlement-calendar.json).
 */
export function businessCalendarFromYearBlocks(
  years: ReadonlyArray<{ closed?: ReadonlyArray<string>; open?: ReadonlyArray<string> }>
): BusinessCalendar {
  const closed: string[] = []
  const open: string[] = []
  for (const y of years) {
    if (y.closed) closed.push(...y.closed)
    if (y.open) open.push(...y.open)
  }
  closed.sort()
  open.sort()
  return { closed, open }
}

function shiftByDays(date: Date, deltaDays: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + deltaDays))
}

function rollFollowing(baseDate: Date, calendar: BusinessCalendarSets): Date {
  let candidate = baseDate
  while (!isBusinessDayUtc(candidate, calendar)) {
    candidate = shiftByDays(candidate, 1)
  }
  return candidate
}

function rollPreceding(baseDate: Date, calendar: BusinessCalendarSets): Date {
  let candidate = baseDate
  while (!isBusinessDayUtc(candidate, calendar)) {
    candidate = shiftByDays(candidate, -1)
  }
  return candidate
}

export function rollBusinessDay(
  baseDateIso: string,
  convention: 'unadjusted' | 'following' | 'preceding' | 'modified-following' | 'modified-preceding',
  holidays: BusinessDayHolidays = []
): string {
  const baseDate = parseIsoDate(baseDateIso)
  if (convention === 'unadjusted') {
    return baseDateIso
  }

  const calendar = toBusinessCalendarSets(holidays)
  const baseMonth = baseDate.getUTCMonth()

  if (convention === 'following') {
    return formatIsoDate(rollFollowing(baseDate, calendar))
  }

  if (convention === 'preceding') {
    return formatIsoDate(rollPreceding(baseDate, calendar))
  }

  if (convention === 'modified-following') {
    const following = rollFollowing(baseDate, calendar)
    if (following.getUTCMonth() !== baseMonth) {
      return formatIsoDate(rollPreceding(baseDate, calendar))
    }
    return formatIsoDate(following)
  }

  const preceding = rollPreceding(baseDate, calendar)
  if (preceding.getUTCMonth() !== baseMonth) {
    return formatIsoDate(rollFollowing(baseDate, calendar))
  }
  return formatIsoDate(preceding)
}

export function lastBusinessDayOnOrBefore(
  year: number,
  monthZeroBased: number,
  targetDayOfMonth: number,
  holidays: BusinessDayHolidays = []
): string {
  const clampedTarget = Math.min(Math.max(1, targetDayOfMonth), daysInMonthUtc(year, monthZeroBased))
  const targetIso = formatIsoDate(new Date(Date.UTC(year, monthZeroBased, clampedTarget)))
  return rollBusinessDay(targetIso, 'preceding', holidays)
}

/**
 * Exact T−n observation date: the nth HU-VIBER (or other) business day
 * strictly before `iso` (ADR 0047 FLOAT MÁK / ÁKK ISSUE).
 * Returns null when `n < 1` or the calendar cannot walk far enough
 * (defensive cap: 366 calendar days).
 */
export function nthBusinessDayBefore(
  iso: string,
  n: number,
  holidays: BusinessDayHolidays = []
): string | null {
  if (!Number.isInteger(n) || n < 1) return null
  const calendar = toBusinessCalendarSets(holidays)
  let cursor = parseIsoDate(iso)
  let found = 0
  for (let step = 0; step < 366; step += 1) {
    cursor = shiftByDays(cursor, -1)
    if (isBusinessDayUtc(cursor, calendar)) {
      found += 1
      if (found === n) return formatIsoDate(cursor)
    }
  }
  return null
}
