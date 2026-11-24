import { EXIT_ERROR, EXIT_UNCHANGED, EXIT_UPDATED, ingestMarketData } from './ingest.ts'
import {
  writeGithubAnnotation,
  writeGithubOutput,
  writeGithubStepSummary
} from './github-output.ts'
import type { OfferingFamilyCode } from './offering-families.ts'
import type { AkkEnvelope, AllampapirEnvelope } from './types.ts'
import type { WebkincstarReportName } from './webkincstar-reports.ts'

export interface CiIngestOptions {
  outRoot: string
  baselineRoot?: string
  rawDir: string
  catalog?: AkkEnvelope
  networkRates?: AkkEnvelope
  allampapirPrices?: Record<string, AllampapirEnvelope>
  skipAllampapir?: boolean
  retailInterestEnvelope?: AllampapirEnvelope
  skipRetailInterest?: boolean
  inflationCsvPath?: string
  inflationCsvBytes?: Uint8Array
  skipInflation?: boolean
  buborXlsPath?: string
  buborXlsBytes?: Uint8Array
  skipBubor?: boolean
  settlementCalendarDir?: string
  settlementCalendarYears?: number[]
  skipSettlementCalendar?: boolean
  webkincstarTextByReport?: Partial<Record<WebkincstarReportName, string>>
  webkincstarDatum?: string
  skipWebkincstar?: boolean
  offeringEnvelopesByFamily?: Partial<Record<OfferingFamilyCode, AkkEnvelope>>
  skipOfferings?: boolean
  reparseParseFailed?: boolean
  fetchImpl?: typeof fetch
  generatedAt?: string
}

export interface CiIngestResult {
  changed: boolean
  asOf: string | null
  offeringPdfsDownloaded: number
  offeringPdfsPending: number
  offeringPdfsParseFailed: number
  offeringPdfsSkippedNoSchedule: number
  offeringBackfillFrontier: string | null
  offeringsSoftFailed: boolean
  webkincstarFetchFailedDays: number
  webkincstarHistoricalEnabled: boolean
  webkincstarDatumsFetched: string[]
  webkincstarOverlaySkipped: number
  webkincstarSoftFailed: boolean
  retailInterestSoftFailed: boolean
  exitCode: typeof EXIT_UPDATED | typeof EXIT_UNCHANGED | typeof EXIT_ERROR
}

/**
 * Build the quiet Actions `::notice::` one-liner for the overview list.
 * Exported for unit tests.
 */
export function formatCiIngestNoticeLine(result: {
  changed: boolean
  asOf: string | null
  webkincstarHistoricalEnabled: boolean
  webkincstarOverlaySkipped: number
  webkincstarFetchFailedDays: number
  offeringPdfsDownloaded: number
  offeringPdfsPending: number
  offeringPdfsParseFailed: number
  offeringBackfillFrontier: string | null
}): string {
  return [
    `changed=${result.changed}`,
    `as_of=${result.asOf ?? ''}`,
    `wk_hist=${result.webkincstarHistoricalEnabled ? 'on' : 'off'}`,
    `wk_overlay_skip=${result.webkincstarOverlaySkipped}`,
    `wk_fetch_failed=${result.webkincstarFetchFailedDays}`,
    `pdfs=${result.offeringPdfsDownloaded}`,
    `pending=${result.offeringPdfsPending}`,
    `parse_failed=${result.offeringPdfsParseFailed}`,
    `frontier=${result.offeringBackfillFrontier ?? ''}`
  ].join(' ')
}

/**
 * CI ingest: merge into outRoot using optional baseline, emit GITHUB_OUTPUT.
 * Exit convention for the workflow: always 0 on success (changed or not); 1 on error.
 * `changed` / `as_of` are written to GITHUB_OUTPUT for job outputs + artifact gating.
 */
export async function runCiIngest(options: CiIngestOptions): Promise<CiIngestResult> {
  const report = await ingestMarketData({
    root: options.outRoot,
    previousRoot: options.baselineRoot,
    rawDir: options.rawDir,
    catalog: options.catalog,
    networkRates: options.networkRates,
    allampapirPrices: options.allampapirPrices,
    skipAllampapir: options.skipAllampapir,
    retailInterestEnvelope: options.retailInterestEnvelope,
    skipRetailInterest: options.skipRetailInterest,
    inflationCsvPath: options.inflationCsvPath,
    inflationCsvBytes: options.inflationCsvBytes,
    skipInflation: options.skipInflation,
    buborXlsPath: options.buborXlsPath,
    buborXlsBytes: options.buborXlsBytes,
    skipBubor: options.skipBubor,
    settlementCalendarDir: options.settlementCalendarDir,
    settlementCalendarYears: options.settlementCalendarYears,
    skipSettlementCalendar: options.skipSettlementCalendar,
    webkincstarTextByReport: options.webkincstarTextByReport,
    webkincstarDatum: options.webkincstarDatum,
    skipWebkincstar: options.skipWebkincstar,
    offeringEnvelopesByFamily: options.offeringEnvelopesByFamily,
    skipOfferings: options.skipOfferings,
    reparseParseFailed: options.reparseParseFailed,
    fetchImpl: options.fetchImpl,
    generatedAt: options.generatedAt
  })

  const result: CiIngestResult = {
    changed: report.changed,
    asOf: report.asOf,
    offeringPdfsDownloaded: report.offeringPdfsDownloaded,
    offeringPdfsPending: report.offeringPdfsPending,
    offeringPdfsParseFailed: report.offeringPdfsParseFailed,
    offeringPdfsSkippedNoSchedule: report.offeringPdfsSkippedNoSchedule,
    offeringBackfillFrontier: report.offeringBackfillFrontier,
    offeringsSoftFailed: report.offeringsSoftFailed,
    webkincstarFetchFailedDays: report.webkincstarFetchFailedDays,
    webkincstarHistoricalEnabled: report.webkincstarHistoricalEnabled,
    webkincstarDatumsFetched: report.webkincstarDatumsFetched,
    webkincstarOverlaySkipped: report.webkincstarOverlaySkipped,
    webkincstarSoftFailed: report.webkincstarSoftFailed,
    retailInterestSoftFailed: report.retailInterestSoftFailed,
    exitCode: report.changed ? EXIT_UPDATED : EXIT_UNCHANGED
  }

  writeGithubOutput('changed', result.changed ? 'true' : 'false')
  writeGithubOutput('as_of', result.asOf ?? '')
  writeGithubOutput('offering_pdfs_downloaded', String(result.offeringPdfsDownloaded))
  writeGithubOutput('offering_pdfs_pending', String(result.offeringPdfsPending))
  writeGithubOutput('offering_pdfs_parse_failed', String(result.offeringPdfsParseFailed))
  writeGithubOutput(
    'offering_pdfs_skipped_no_schedule',
    String(result.offeringPdfsSkippedNoSchedule)
  )
  writeGithubOutput('offering_backfill_frontier', result.offeringBackfillFrontier ?? '')
  writeGithubOutput('offerings_soft_failed', result.offeringsSoftFailed ? 'true' : 'false')
  writeGithubOutput('webkincstar_fetch_failed_days', String(result.webkincstarFetchFailedDays))
  writeGithubOutput(
    'webkincstar_historical_enabled',
    result.webkincstarHistoricalEnabled ? 'true' : 'false'
  )
  writeGithubOutput('webkincstar_datums_fetched', result.webkincstarDatumsFetched.join(','))
  writeGithubOutput('webkincstar_overlay_skipped', String(result.webkincstarOverlaySkipped))
  writeGithubOutput('webkincstar_soft_failed', result.webkincstarSoftFailed ? 'true' : 'false')
  writeGithubOutput(
    'retail_interest_soft_failed',
    result.retailInterestSoftFailed ? 'true' : 'false'
  )

  writeGithubStepSummary(
    [
      '### Market-data ingest',
      '',
      '| Metric | Value |',
      '| --- | --- |',
      `| changed | ${result.changed} |`,
      `| as_of | ${result.asOf ?? ''} |`,
      '',
      '#### WebKincstár',
      '',
      '| Metric | Value |',
      '| --- | --- |',
      `| historical (§6m) | ${result.webkincstarHistoricalEnabled ? 'on' : 'off'} |`,
      `| datums fetched | ${result.webkincstarDatumsFetched.join(', ') || '(none)'} |`,
      `| overlay skipped | ${result.webkincstarOverlaySkipped} |`,
      `| fetch_failed days | ${result.webkincstarFetchFailedDays} |`,
      `| soft-failed | ${result.webkincstarSoftFailed} |`,
      '',
      '#### Offerings',
      '',
      '| Metric | Value |',
      '| --- | --- |',
      `| backfill frontier (min) | ${result.offeringBackfillFrontier ?? '(none)'} |`,
      `| PDFs downloaded | ${result.offeringPdfsDownloaded} |`,
      `| PDFs pending | ${result.offeringPdfsPending} |`,
      `| PDF parse_failed | ${result.offeringPdfsParseFailed} |`,
      `| PDF skipped_no_schedule | ${result.offeringPdfsSkippedNoSchedule} |`,
      `| soft-failed | ${result.offeringsSoftFailed} |`,
      '',
      '#### Other soft-fails',
      '',
      `| retailInterest soft-failed | ${result.retailInterestSoftFailed} |`,
      ''
    ].join('\n')
  )

  writeGithubAnnotation('notice', formatCiIngestNoticeLine(result))
  if (result.webkincstarOverlaySkipped > 0) {
    writeGithubAnnotation(
      'warning',
      `WebKincstár overlay soft-skipped ${result.webkincstarOverlaySkipped} unmatched quote(s); tip calendar not sealed for those datums`
    )
  }
  if (result.webkincstarFetchFailedDays > 0) {
    writeGithubAnnotation(
      'warning',
      `WebKincstár appended ${result.webkincstarFetchFailedDays} fetch_failed calendar day(s)`
    )
  }
  if (result.offeringPdfsParseFailed > 0) {
    writeGithubAnnotation(
      'warning',
      `Offering PDF parse_failed=${result.offeringPdfsParseFailed} (sticky until reparse)`
    )
  }
  if (result.webkincstarSoftFailed) {
    writeGithubAnnotation('warning', 'WebKincstár soft-failed this run')
  }
  if (result.offeringsSoftFailed) {
    writeGithubAnnotation('warning', 'Offerings soft-failed this run')
  }
  if (result.retailInterestSoftFailed) {
    writeGithubAnnotation('warning', 'retailInterest soft-failed this run')
  }

  return result
}
