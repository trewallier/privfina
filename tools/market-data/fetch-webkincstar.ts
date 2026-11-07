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
  /** Reports to fetch (defaults to §6h v1 pair). */
  reports?: readonly WebkincstarReportName[]
  fetchImpl?: typeof fetch
  retries?: number
  backoffMs?: number
  reportUrl?: string
  pdfToText?: PdfToTextOptions
  /**
   * When set, skip network and parse these pre-extracted texts (tests / offline).
   * Keys are report names.
   */
  textByReport?: Partial<Record<WebkincstarReportName, string>>
}

export interface FetchWebkincstarReportResult {
  reportName: WebkincstarReportName
  datum: string
  rawPath: string | null
  parsed: WebkincstarParseResult
}

export interface FetchWebkincstarResult {
  datum: string
  reports: FetchWebkincstarReportResult[]
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
 * Asserts Értéknap === requested datum before returning (ADR 0039).
 */
export async function fetchWebkincstarSnapshots(
  options: FetchWebkincstarOptions
): Promise<FetchWebkincstarResult> {
  const reports = options.reports ?? WEBKINCSTAR_REPORTS
  const out: FetchWebkincstarReportResult[] = []

  for (const reportName of reports) {
    let text: string
    let rawPath: string | null = null
    const offline = options.textByReport?.[reportName]
    if (offline != null) {
      text = offline
    } else {
      const { bytes, rawPath: saved } = await postPdf(reportName, options.datum, options)
      rawPath = saved
      text = await pdfBytesToTextLayout(bytes, options.pdfToText)
    }
    const parsed = parseWebkincstarPdfText({ reportName, text })
    assertErteknapMatchesDatum(parsed.erteknap, options.datum, reportName)
    out.push({ reportName, datum: options.datum, rawPath, parsed })
  }

  return { datum: options.datum, reports: out }
}

/**
 * Europe/Budapest calendar yesterday as YYYY-MM-DD (ADR 0039 default datum).
 */
export function budapestYesterdayIso(now: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Budapest',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
  // en-CA → YYYY-MM-DD
  const today = fmt.format(now)
  const [y, m, d] = today.split('-').map((x) => Number(x))
  // Construct a UTC noon date for the Budapest calendar day, then subtract one day.
  const utcNoon = Date.UTC(y, m - 1, d, 12, 0, 0)
  const yday = new Date(utcNoon - 24 * 60 * 60 * 1000)
  return fmt.format(yday)
}
