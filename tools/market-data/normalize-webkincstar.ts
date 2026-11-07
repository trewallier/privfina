import {
  emptyNormalizedByFamily,
  type FamilyCode,
  type NormalizedSnapshot,
  type SeriesRecord
} from './types.ts'
import {
  webkincstarRowToQuoteRow,
  type WebkincstarParseResult,
  type WebkincstarParsedRow
} from './parse-webkincstar-pdf.ts'
import type { WebkincstarReportName } from './webkincstar-reports.ts'

export type PriceCalendarDayStatus = 'priced' | 'no_price' | 'fetch_failed'

export interface PriceCalendarDay {
  datum: string
  report: WebkincstarReportName
  status: PriceCalendarDayStatus
  rowCount: number
}

export interface NormalizeWebkincstarResult {
  snapshot: NormalizedSnapshot
  /** Calendar rows ready for merge (one per report). */
  calendarDays: PriceCalendarDay[]
  /** Rows that could not be family-routed (still logged; not invented into a family). */
  unmatchedNames: string[]
  /** True when any report contributed ≥1 quote row. */
  hasQuotes: boolean
}

function seriesFromRow(
  row: WebkincstarParsedRow,
  family: FamilyCode,
  asOf: string
): SeriesRecord {
  const status: SeriesRecord['status'] =
    row.maturity && row.maturity < asOf ? 'matured' : 'active'
  return {
    id: row.id,
    isin: null,
    name: row.name,
    issue: null,
    mat: row.maturity,
    ccy: 'HUF',
    status,
    dayCount: 'ACT/360'
  }
}

/**
 * Normalize parsed WebKincstár reports into a snapshot + calendar day records.
 * Unrouted family rows are skipped (soft) and listed in `unmatchedNames`.
 * Does not invent ÁKK catalog identity — overlay join happens later (ADR 0039).
 */
export function normalizeWebkincstarReports(
  reports: WebkincstarParseResult[],
  options?: { asOf?: string | null }
): NormalizeWebkincstarResult {
  const byFamily = emptyNormalizedByFamily()
  const calendarDays: PriceCalendarDay[] = []
  const unmatchedNames: string[] = []
  let hasQuotes = false
  let asOf: string | null = options?.asOf ?? null

  for (const report of reports) {
    if (!asOf) asOf = report.erteknap
    calendarDays.push({
      datum: report.erteknap,
      report: report.reportName,
      status: report.status,
      rowCount: report.rows.length
    })

    for (const row of report.rows) {
      if (!row.family) {
        unmatchedNames.push(row.name)
        continue
      }
      hasQuotes = true
      const family = row.family
      const existing = byFamily[family].series.find((s) => s.id === row.id)
      if (!existing) {
        byFamily[family].series.push(seriesFromRow(row, family, report.erteknap))
      }
      byFamily[family].quotes.push({
        id: row.id,
        row: webkincstarRowToQuoteRow(report.erteknap, row)
      })
    }
  }

  return {
    snapshot: { asOf, byFamily },
    calendarDays,
    unmatchedNames,
    hasQuotes
  }
}

/** Build fetch_failed calendar stubs when the whole WebKincstár step soft-fails. */
export function fetchFailedCalendarDays(
  datum: string,
  reports: readonly WebkincstarReportName[]
): PriceCalendarDay[] {
  return reports.map((report) => ({
    datum,
    report,
    status: 'fetch_failed' as const,
    rowCount: 0
  }))
}
