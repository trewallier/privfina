import * as XLSX from 'xlsx'
import {
  MNB_SETTLEMENT_CALENDAR_DISCLAIMER,
  MNB_SETTLEMENT_CALENDAR_HUB_URL,
  SCHEMA_VERSION,
  type SettlementCalendarFile,
  type SettlementCalendarYearBlock
} from './types.ts'
import type { FetchedSettlementCalendarYear } from './fetch-mnb-settlement-calendar.ts'

export class NormalizeSettlementCalendarError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NormalizeSettlementCalendarError'
  }
}

const MONTH_NAMES_HU = [
  'januar',
  'februar',
  'marcius',
  'aprilis',
  'majus',
  'junius',
  'julius',
  'augusztus',
  'szeptember',
  'oktober',
  'november',
  'december'
] as const

function normalizeMonthLabel(raw: unknown): number | null {
  if (raw == null) return null
  let s = String(raw).trim().toLowerCase()
  if (!s) return null
  s = s.normalize('NFD').replace(/\p{M}/gu, '')
  const idx = MONTH_NAMES_HU.indexOf(s as (typeof MONTH_NAMES_HU)[number])
  return idx >= 0 ? idx : null
}

function isoDate(year: number, month0: number, day: number): string {
  const m = String(month0 + 1).padStart(2, '0')
  const d = String(day).padStart(2, '0')
  return `${year}-${m}-${d}`
}

function utcWeekday(year: number, month0: number, day: number): number {
  return new Date(Date.UTC(year, month0, day)).getUTCDay()
}

function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate()
}

/**
 * Normalize one MNB elszámolásforgalmi XLSX year grid into closed/open exceptions.
 */
export function normalizeSettlementCalendarXlsx(
  xlsxBytes: Uint8Array,
  options: {
    year: number
    fileName: string
    sourceDigest: string
  }
): SettlementCalendarYearBlock {
  const workbook = XLSX.read(xlsxBytes, { type: 'array', cellDates: false })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    throw new NormalizeSettlementCalendarError(`No sheets in ${options.fileName}`)
  }
  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<(string | number | null | undefined)[]>(sheet, {
    header: 1,
    defval: null,
    raw: true
  }) as unknown[][]

  if (rows.length < 2) {
    throw new NormalizeSettlementCalendarError(
      `Settlement calendar ${options.fileName} has too few rows`
    )
  }

  let headerRowIndex = -1
  let header: unknown[] = []
  const dayCols: number[] = []
  for (let r = 0; r < Math.min(rows.length, 8); r++) {
    const candidate = rows[r] ?? []
    const cols: number[] = []
    for (let c = 1; c < candidate.length; c++) {
      const n = Number(candidate[c])
      if (Number.isInteger(n) && n >= 1 && n <= 31) {
        cols.push(c)
      }
    }
    if (cols.length >= 28) {
      headerRowIndex = r
      header = candidate
      dayCols.push(...cols)
      break
    }
  }
  if (headerRowIndex < 0 || dayCols.length < 28) {
    throw new NormalizeSettlementCalendarError(
      `Settlement calendar ${options.fileName}: expected day columns 1–31, found ${dayCols.length}`
    )
  }

  const closed: string[] = []
  const open: string[] = []
  const monthsSeen = new Set<number>()

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r] ?? []
    const month0 = normalizeMonthLabel(row[0])
    if (month0 == null) continue
    if (monthsSeen.has(month0)) {
      throw new NormalizeSettlementCalendarError(
        `Settlement calendar ${options.fileName}: duplicate month row for month ${month0 + 1}`
      )
    }
    monthsSeen.add(month0)
    const dim = daysInMonth(options.year, month0)
    for (const c of dayCols) {
      const day = Number(header[c])
      if (!Number.isInteger(day) || day < 1 || day > dim) continue
      const cell = row[c]
      if (cell == null || cell === '') continue
      const mark = String(cell).trim().toUpperCase()
      if (mark !== 'E' && mark !== 'M') {
        throw new NormalizeSettlementCalendarError(
          `Unexpected cell '${mark}' at ${options.year}-${month0 + 1}-${day} in ${options.fileName}`
        )
      }
      const weekday = utcWeekday(options.year, month0, day)
      const isWeekend = weekday === 0 || weekday === 6
      const iso = isoDate(options.year, month0, day)
      if (mark === 'M' && !isWeekend) {
        closed.push(iso)
      } else if (mark === 'E' && isWeekend) {
        open.push(iso)
      }
    }
  }

  if (monthsSeen.size !== 12) {
    throw new NormalizeSettlementCalendarError(
      `Settlement calendar ${options.fileName}: expected 12 months, found ${monthsSeen.size}`
    )
  }

  closed.sort()
  open.sort()
  return {
    year: options.year,
    sourceFile: options.fileName,
    sourceDigest: options.sourceDigest,
    closed,
    open
  }
}

export interface NormalizeSettlementCalendarsOptions {
  generatedAt: string
  hubUrl?: string
}

/**
 * Build a settlement-calendar refs file from fetched year workbooks (ADR 0046).
 */
export function normalizeSettlementCalendars(
  fetched: FetchedSettlementCalendarYear[],
  options: NormalizeSettlementCalendarsOptions
): SettlementCalendarFile {
  if (fetched.length === 0) {
    throw new NormalizeSettlementCalendarError('No settlement calendar years to normalize')
  }

  const years = fetched
    .map((f) =>
      normalizeSettlementCalendarXlsx(f.xlsxBytes, {
        year: f.year,
        fileName: f.fileName,
        sourceDigest: f.contentDigest
      })
    )
    .sort((a, b) => a.year - b.year)

  return {
    schemaVersion: SCHEMA_VERSION,
    calendarId: 'HU-VIBER',
    timezone: 'Europe/Budapest',
    generatedAt: options.generatedAt,
    source: {
      id: 'mnb-elszamolasforgalmi-naptar',
      host: 'mnb.hu',
      hubUrl: options.hubUrl ?? MNB_SETTLEMENT_CALENDAR_HUB_URL,
      disclaimer: MNB_SETTLEMENT_CALENDAR_DISCLAIMER,
      files: fetched
        .map((f) => ({
          year: f.year,
          fileName: f.fileName,
          url: f.url,
          contentDigest: f.contentDigest
        }))
        .sort((a, b) => a.year - b.year)
    },
    years
  }
}
