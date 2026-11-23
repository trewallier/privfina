import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { formatFetchError, logFetchAttemptFailure } from './fetch-errors.ts'
import { pdfBytesToTextLayout, type PdfToTextOptions } from './pdf-text.ts'
import {
  assertErteknapMatchesDatum,
  parseWebkincstarPdfText,
  type WebkincstarParseResult
} from './parse-webkincstar-pdf.ts'
import {
  WEBKINCSTAR_REPORT_SERVICE_URL,
  WEBKINCSTAR_REPORTS,
  type WebkincstarReportName
} from './webkincstar-reports.ts'

export class WebkincstarFetchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WebkincstarFetchError'
  }
}

export interface FetchWebkincstarOptions {
  /** Europe/Budapest calendar date YYYY-MM-DD. */
  datum: string
  /** Directory for ephemeral raw PDFs (gitignored). */
  rawDir: string
  /** Reports to fetch (defaults to ADR 0039 + 0042 / §6n list). */
  reports?: readonly WebkincstarReportName[]
  fetchImpl?: typeof fetch
  retries?: number
  backoffMs?: number
  reportUrl?: string
  pdfToText?: PdfToTextOptions
  /**
   * When set, skip network and parse these pre-extracted texts (tests / offline).
   * Keys are report names. Missing keys are soft-failed without POSTing (ADR 0042).
   */
  textByReport?: Partial<Record<WebkincstarReportName, string>>
}

export interface FetchWebkincstarReportResult {
  reportName: WebkincstarReportName
  datum: string
  rawPath: string | null
  parsed: WebkincstarParseResult
}

export interface FetchWebkincstarReportFailure {
  reportName: WebkincstarReportName
  error: unknown
}

export interface FetchWebkincstarResult {
  datum: string
  /** Successfully fetched + parsed reports (Értéknap matched). */
  reports: FetchWebkincstarReportResult[]
  /** Per-report failures (other reports may still succeed). */
  failures: FetchWebkincstarReportFailure[]
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

function assertPdfMagic(buf: Uint8Array, reportName: string): void {
  const head = Buffer.from(buf.subarray(0, 5)).toString('ascii')
  if (head !== '%PDF-') {
    throw new WebkincstarFetchError(
      `WebKincstár response for ${reportName} is not a PDF (got ${JSON.stringify(head)})`
    )
  }
}

function buildBody(reportName: WebkincstarReportName, datum: string): string {
  return JSON.stringify({
    clientCode: 'all',
    reportName,
    language: 'hu',
    report_params: [{ name: 'datum', value: datum }],
    lang: 'hu',
    channel: 'WEB',
    channelId: 2
  })
}

async function postPdf(
  reportName: WebkincstarReportName,
  datum: string,
  options: FetchWebkincstarOptions
): Promise<{ bytes: Uint8Array; rawPath: string }> {
  const fetchImpl = options.fetchImpl ?? fetch
  const retries = options.retries ?? 3
  const backoffMs = options.backoffMs ?? 500
  const url = options.reportUrl ?? WEBKINCSTAR_REPORT_SERVICE_URL
  await mkdir(options.rawDir, { recursive: true })
  const rawPath = path.join(options.rawDir, `${reportName}_${datum}.pdf`)

  let lastError: unknown
  for (let attempt = 1; attempt <= retries; attempt++) {
    const started = Date.now()
    let httpStatus: number | undefined
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/pdf'
        },
        body: buildBody(reportName, datum)
      })
      if (!res.ok) {
        httpStatus = res.status
        throw new WebkincstarFetchError(
          `HTTP ${res.status} ${res.statusText || ''}`.trim() + ` for ${reportName} datum=${datum}`
        )
      }
      const bytes = new Uint8Array(await res.arrayBuffer())
      assertPdfMagic(bytes, reportName)
      await writeFile(rawPath, bytes)
      return { bytes, rawPath }
    } catch (err) {
      lastError = err
      logFetchAttemptFailure({
        label: `WebKincstár ${reportName}`,
        attempt,
        retries,
        elapsedMs: Date.now() - started,
        err,
        httpStatus,
        url
      })
      if (attempt < retries) {
        await sleep(backoffMs * attempt)
      }
    }
  }
  throw new WebkincstarFetchError(
    `Failed to fetch ${reportName} for ${datum} after ${retries} attempts: ${formatFetchError(lastError)}`
  )
}

/**
 * Fetch (or load offline text for) WebKincstár daily price reports, extract text, parse rows.
 * Asserts Értéknap === requested datum per successful report (ADR 0039).
 * Isolates failures per report so one bad PDF does not discard a healthy sibling.
 */
export async function fetchWebkincstarSnapshots(
  options: FetchWebkincstarOptions
): Promise<FetchWebkincstarResult> {
  const reports = options.reports ?? WEBKINCSTAR_REPORTS
  const out: FetchWebkincstarReportResult[] = []
  const failures: FetchWebkincstarReportFailure[] = []

  const offlineMode = options.textByReport != null

  for (const reportName of reports) {
    try {
      let text: string
      let rawPath: string | null = null
      if (offlineMode) {
        const offline = options.textByReport?.[reportName]
        if (offline == null) {
          throw new WebkincstarFetchError(
            `Offline textByReport missing ${reportName} (no network in fixture mode)`
          )
        }
        text = offline
      } else {
        const { bytes, rawPath: saved } = await postPdf(reportName, options.datum, options)
        rawPath = saved
        text = await pdfBytesToTextLayout(bytes, options.pdfToText)
      }
      const parsed = parseWebkincstarPdfText({ reportName, text })
      assertErteknapMatchesDatum(parsed.erteknap, options.datum, reportName)
      out.push({ reportName, datum: options.datum, rawPath, parsed })
    } catch (error) {
      failures.push({ reportName, error })
    }
  }

  return { datum: options.datum, reports: out, failures }
}

const BUDAPEST_DATE_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Budapest',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
})

/** Europe/Budapest calendar today as YYYY-MM-DD. */
export function budapestTodayIso(now: Date = new Date()): string {
  return BUDAPEST_DATE_FMT.format(now)
}

/**
 * Europe/Budapest calendar yesterday as YYYY-MM-DD (ADR 0039 default datum).
 */
export function budapestYesterdayIso(now: Date = new Date()): string {
  return shiftIsoDate(budapestTodayIso(now), -1)
}

/** Shift a YYYY-MM-DD calendar date by whole days (UTC noon arithmetic). */
export function shiftIsoDate(iso: string, deltaDays: number): string {
  const [y, m, d] = iso.split('-').map((x) => Number(x))
  const utcNoon = Date.UTC(y, m - 1, d, 12, 0, 0)
  const shifted = new Date(utcNoon + deltaDays * 24 * 60 * 60 * 1000)
  // Format without timezone conversion (UTC components == calendar day).
  const yy = shifted.getUTCFullYear()
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(shifted.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/** Monday=0 … Sunday=6 for a YYYY-MM-DD calendar date. */
export function isoWeekdayIndex(iso: string): number {
  const [y, m, d] = iso.split('-').map((x) => Number(x))
  // Date.UTC Sunday=0 … Saturday=6 → convert to Mon=0 … Sun=6
  const sun0 = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay()
  return (sun0 + 6) % 7
}

export function isIsoWeekday(iso: string): boolean {
  return isoWeekdayIndex(iso) < 5
}

/** Default max prior weekdays (excluding yesterday) filled when the calendar has holes. */
export const WEBKINCSTAR_LOOKBACK_EXTRA_WEEKDAYS = 3

export interface WebkincstarLookbackOptions {
  /** Always included as the first target (typically Budapest yesterday). */
  primaryDatum: string
  /** Tip price calendar (may be null on first run). */
  previousDays?: ReadonlyArray<{ datum: string; report: string; status: string }> | null
  reports?: readonly WebkincstarReportName[]
  /** Max prior weekdays to backfill besides primaryDatum (default 3). */
  maxExtraWeekdays?: number
}

/**
 * True when any configured report is missing a durable (priced / no_price) row for datum.
 * Absent rows and prior fetch_failed both count as needing a fetch.
 */
export function webkincstarDatumNeedsFetch(
  datum: string,
  previousDays: ReadonlyArray<{ datum: string; report: string; status: string }> | null | undefined,
  reports: readonly WebkincstarReportName[] = WEBKINCSTAR_REPORTS
): boolean {
  const byReport = new Map<string, string>()
  for (const day of previousDays ?? []) {
    if (day.datum !== datum) continue
    byReport.set(day.report, day.status)
  }
  for (const report of reports) {
    const status = byReport.get(report)
    if (status !== 'priced' && status !== 'no_price') return true
  }
  return false
}

/**
 * Inclusive YYYY-MM-DD calendar range (UTC noon arithmetic).
 * @throws when from/to are not ISO dates or from > to
 */
export function listIsoDatesInclusive(fromIso: string, toIso: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromIso) || !/^\d{4}-\d{2}-\d{2}$/.test(toIso)) {
    throw new WebkincstarFetchError(
      `Backfill range requires YYYY-MM-DD from/to (got ${fromIso} … ${toIso})`
    )
  }
  if (fromIso > toIso) {
    throw new WebkincstarFetchError(
      `Backfill from ${fromIso} is after to ${toIso}`
    )
  }
  const out: string[] = []
  let cursor = fromIso
  // Guard: ~40 years of daily dates.
  for (let i = 0; i < 366 * 40; i += 1) {
    out.push(cursor)
    if (cursor === toIso) return out
    cursor = shiftIsoDate(cursor, 1)
  }
  throw new WebkincstarFetchError(`Backfill range too large: ${fromIso} … ${toIso}`)
}

/**
 * Historical WebKincstár scrape floor (ROADMAP §6m). Refine later once archive
 * bounds are confirmed; rolling daily history stops at/before this date.
 */
export const WEBKINCSTAR_BACKFILL_DEFAULT_FROM = '1990-01-01'

/** Calendar days scraped behind the oldest durable tip datum each scheduled run. */
export const WEBKINCSTAR_HISTORICAL_BACKFILL_DEPTH = 6

export interface WebkincstarBackfillDatumOptions {
  from: string
  to: string
  weekdaysOnly?: boolean
  /**
   * When set with previousDays, skip datums that already have durable
   * priced/no_price rows for every requested report (resume-friendly).
   */
  previousDays?: ReadonlyArray<{ datum: string; report: string; status: string }> | null
  reports?: readonly WebkincstarReportName[]
  skipDurable?: boolean
}

export function resolveWebkincstarBackfillDatums(
  options: WebkincstarBackfillDatumOptions
): string[] {
  const reports = options.reports ?? WEBKINCSTAR_REPORTS
  const all = listIsoDatesInclusive(options.from, options.to)
  const filtered = options.weekdaysOnly ? all.filter((d) => isIsoWeekday(d)) : all
  if (!options.skipDurable) return filtered
  return filtered.filter((datum) =>
    webkincstarDatumNeedsFetch(datum, options.previousDays, reports)
  )
}

/**
 * Oldest durable (`priced` | `no_price`) price-calendar datum across the given
 * reports. Ignores `fetch_failed` / absent rows. Null when none exist.
 */
export function oldestDurablePriceCalendarDatum(
  previousDays: ReadonlyArray<{ datum: string; report: string; status: string }> | null | undefined,
  reports: readonly WebkincstarReportName[] = WEBKINCSTAR_REPORTS
): string | null {
  const reportSet = new Set<string>(reports)
  let oldest: string | null = null
  for (const day of previousDays ?? []) {
    if (!reportSet.has(day.report)) continue
    if (day.status !== 'priced' && day.status !== 'no_price') continue
    const datum = String(day.datum || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) continue
    if (oldest == null || datum < oldest) oldest = datum
  }
  return oldest
}

export interface WebkincstarHistoricalBackfillOptions {
  /** Min durable tip calendar datum; null/missing → no historical window. */
  oldestDatum?: string | null
  previousDays?: ReadonlyArray<{ datum: string; report: string; status: string }> | null
  reports?: readonly WebkincstarReportName[]
  /** Inclusive floor; no candidate before this date (default 1990-01-01). */
  floor?: string
  /** Calendar days immediately before oldest (default 6). */
  depth?: number
}

/**
 * Rolling historical scrape window (ROADMAP §6m): the `depth` calendar days
 * immediately before the oldest durable tip datum, clamped to `floor`, omitting
 * days already durable for every configured report. Empty when oldest is missing
 * or already at/below the floor. Tip primary + lookback stay separate.
 */
export function resolveWebkincstarHistoricalBackfillDatums(
  options: WebkincstarHistoricalBackfillOptions
): string[] {
  const oldest = String(options.oldestDatum || '').trim()
  const floor = String(options.floor || WEBKINCSTAR_BACKFILL_DEFAULT_FROM).trim()
  const depth = Number(options.depth ?? WEBKINCSTAR_HISTORICAL_BACKFILL_DEPTH)
  const reports = options.reports ?? WEBKINCSTAR_REPORTS
  if (!/^\d{4}-\d{2}-\d{2}$/.test(oldest)) return []
  if (!/^\d{4}-\d{2}-\d{2}$/.test(floor)) return []
  if (!Number.isFinite(depth) || depth <= 0) return []
  if (oldest <= floor) return []

  const windowEnd = shiftIsoDate(oldest, -1)
  if (windowEnd < floor) return []
  const rawStart = shiftIsoDate(oldest, -depth)
  const windowStart = rawStart < floor ? floor : rawStart
  if (windowStart > windowEnd) return []

  return listIsoDatesInclusive(windowStart, windowEnd).filter((datum) =>
    webkincstarDatumNeedsFetch(datum, options.previousDays, reports)
  )
}

/**
 * Build WebKincstár fetch datums: primary (yesterday) plus up to N prior weekdays
 * that still need a durable calendar row for any configured report.
 * Closes holes when Actions schedule drift skips a Budapest "yesterday".
 */
export function resolveWebkincstarLookbackDatums(
  options: WebkincstarLookbackOptions
): string[] {
  const reports = options.reports ?? WEBKINCSTAR_REPORTS
  const maxExtra = options.maxExtraWeekdays ?? WEBKINCSTAR_LOOKBACK_EXTRA_WEEKDAYS
  const datums = [options.primaryDatum]
  let cursor = shiftIsoDate(options.primaryDatum, -1)
  let added = 0
  // Scan at most ~2 calendar weeks of prior days to collect maxExtra weekdays.
  for (let i = 0; i < 14 && added < maxExtra; i += 1) {
    if (isIsoWeekday(cursor) && webkincstarDatumNeedsFetch(cursor, options.previousDays, reports)) {
      datums.push(cursor)
      added += 1
    }
    cursor = shiftIsoDate(cursor, -1)
  }
  return datums
}

/**
 * Union tip lookback with rolling historical backfill; sorted unique ISO dates.
 */
export function mergeWebkincstarFetchDatums(
  tipDatums: readonly string[],
  historicalDatums: readonly string[]
): string[] {
  return [...new Set([...tipDatums, ...historicalDatums].filter(Boolean))].sort()
}
