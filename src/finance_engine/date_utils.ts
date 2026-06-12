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

export function toHolidaySet(holidays: ReadonlyArray<string> = []): Set<string> {
  return new Set(holidays)
}

export function isBusinessDayUtc(date: Date, holidays: ReadonlySet<string> = new Set()): boolean {
  if (isWeekendUtc(date)) {
    return false
  }

  return !holidays.has(formatIsoDate(date))
}

function shiftByDays(date: Date, deltaDays: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + deltaDays))
}

function rollFollowing(baseDate: Date, holidays: ReadonlySet<string>): Date {
  let candidate = baseDate
  while (!isBusinessDayUtc(candidate, holidays)) {
    candidate = shiftByDays(candidate, 1)
  }
  return candidate
}

function rollPreceding(baseDate: Date, holidays: ReadonlySet<string>): Date {
  let candidate = baseDate
  while (!isBusinessDayUtc(candidate, holidays)) {
    candidate = shiftByDays(candidate, -1)
  }
  return candidate
}

export function rollBusinessDay(
  baseDateIso: string,
  convention: 'unadjusted' | 'following' | 'preceding' | 'modified-following' | 'modified-preceding',
  holidays: ReadonlyArray<string> = []
): string {
  const baseDate = parseIsoDate(baseDateIso)
  if (convention === 'unadjusted') {
    return baseDateIso
  }

  const holidaySet = toHolidaySet(holidays)
  const baseMonth = baseDate.getUTCMonth()

  if (convention === 'following') {
    return formatIsoDate(rollFollowing(baseDate, holidaySet))
  }

  if (convention === 'preceding') {
    return formatIsoDate(rollPreceding(baseDate, holidaySet))
  }

  if (convention === 'modified-following') {
    const following = rollFollowing(baseDate, holidaySet)
    if (following.getUTCMonth() !== baseMonth) {
      return formatIsoDate(rollPreceding(baseDate, holidaySet))
    }
    return formatIsoDate(following)
  }

  const preceding = rollPreceding(baseDate, holidaySet)
  if (preceding.getUTCMonth() !== baseMonth) {
    return formatIsoDate(rollFollowing(baseDate, holidaySet))
  }
  return formatIsoDate(preceding)
}

export function lastBusinessDayOnOrBefore(
  year: number,
  monthZeroBased: number,
  targetDayOfMonth: number,
  holidays: ReadonlyArray<string> = []
): string {
  const clampedTarget = Math.min(Math.max(1, targetDayOfMonth), daysInMonthUtc(year, monthZeroBased))
  const targetIso = formatIsoDate(new Date(Date.UTC(year, monthZeroBased, clampedTarget)))
  return rollBusinessDay(targetIso, 'preceding', holidays)
}