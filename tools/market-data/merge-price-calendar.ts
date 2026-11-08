import { digestPriceCalendar } from './digests.ts'
import { MergeError } from './merge.ts'
import {
  SCHEMA_VERSION,
  WEBKINCSTAR_PRICE_CALENDAR_DISCLAIMER,
  type PriceCalendarDayRow,
  type PriceCalendarFile
} from './types.ts'
import { WEBKINCSTAR_REPORTS } from './webkincstar-reports.ts'
import type { PriceCalendarDay } from './normalize-webkincstar.ts'

export interface MergePriceCalendarResult {
  file: PriceCalendarFile
  appendedDays: number
  skippedDuplicates: number
  contentChanged: boolean
}

function dayKey(day: PriceCalendarDayRow): string {
  return `${day.report}\0${day.datum}`
}

function cloneCalendar(file: PriceCalendarFile): PriceCalendarFile {
  return {
    schemaVersion: file.schemaVersion,
    generatedAt: file.generatedAt,
    source: { ...file.source },
    reports: [...file.reports],
    days: file.days.map((d) => ({ ...d }))
  }
}

export function emptyPriceCalendarFile(generatedAt: string): PriceCalendarFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    source: {
      id: 'webkincstar-report-service',
      host: 'webkincstar.allamkincstar.gov.hu',
      disclaimer: WEBKINCSTAR_PRICE_CALENDAR_DISCLAIMER
    },
    reports: [...WEBKINCSTAR_REPORTS],
    days: []
  }
}

export function priceCalendarFileFromDays(
  days: PriceCalendarDay[],
  generatedAt: string
): PriceCalendarFile {
  const file = emptyPriceCalendarFile(generatedAt)
  file.days = days.map((d) => ({
    datum: d.datum,
    report: d.report,
    status: d.status,
    rowCount: d.rowCount
  }))
  file.days.sort((a, b) => a.datum.localeCompare(b.datum) || a.report.localeCompare(b.report))
  return file
}

/**
 * Append-first merge of WebKincstár price-calendar refs (ADR 0039).
 * Same (report, datum) + identical status/rowCount → skip; conflict → MergeError.
 */
export function mergePriceCalendarFile(
  previous: PriceCalendarFile | null,
  incoming: PriceCalendarFile
): MergePriceCalendarResult {
  if (!previous) {
    const file = cloneCalendar(incoming)
    file.schemaVersion = SCHEMA_VERSION
    return {
      file,
      appendedDays: file.days.length,
      skippedDuplicates: 0,
      contentChanged: true
    }
  }

  const byKey = new Map<string, PriceCalendarDayRow>()
  for (const day of previous.days) byKey.set(dayKey(day), { ...day })

  let appended = 0
  let skipped = 0
  for (const day of incoming.days) {
    const key = dayKey(day)
    const existing = byKey.get(key)
    if (existing) {
      if (
        existing.status === day.status &&
        existing.rowCount === day.rowCount
      ) {
        skipped += 1
        continue
      }
      throw new MergeError(
        `Price-calendar conflict for ${day.report} ${day.datum}: kept ${JSON.stringify(existing)}, got ${JSON.stringify(day)}`
      )
    }
    byKey.set(key, { ...day })
    appended += 1
  }

  const merged = cloneCalendar(previous)
  merged.source = { ...incoming.source }
  merged.reports = [...new Set([...previous.reports, ...incoming.reports])].sort()
  merged.days = [...byKey.values()].sort(
    (a, b) => a.datum.localeCompare(b.datum) || a.report.localeCompare(b.report)
  )
  merged.generatedAt = incoming.generatedAt

  const contentChanged = digestPriceCalendar(merged) !== digestPriceCalendar(previous)
  if (!contentChanged) {
    merged.generatedAt = previous.generatedAt
  }

  return {
    file: merged,
    appendedDays: appended,
    skippedDuplicates: skipped,
    contentChanged
  }
}
