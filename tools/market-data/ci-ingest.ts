import { EXIT_ERROR, EXIT_UNCHANGED, EXIT_UPDATED, ingestMarketData } from './ingest.ts'
import {
  formatCiIngestStepSummary,
  type CiIngestSummaryInput,
  type OfferingPdfSeriesRef,
  type OfferingSourceProgress,
  type WebkincstarSkippedSeriesRef
} from './ci-ingest-summary.ts'
import {
  writeGithubAnnotation,
  writeGithubOutput,
  writeGithubStepSummary
} from './github-output.ts'
import type { OfferingFrontierHolder } from './offering-archive-frontier.ts'
import type { OfferingFamilyCode } from './offering-families.ts'
import type { AkkEnvelope, AllampapirEnvelope } from './types.ts'
import type { WebkincstarReportName } from './webkincstar-reports.ts'

export { formatCiIngestStepSummary } from './ci-ingest-summary.ts'

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
  offeringPdfsTranscribedSeries: OfferingPdfSeriesRef[]
  offeringPdfsParseFailedSeries: OfferingPdfSeriesRef[]
  offeringPdfsSkippedSeries: OfferingPdfSeriesRef[]
  offeringTip: OfferingSourceProgress
  offeringBackfill: OfferingSourceProgress
  offeringUnattributed: OfferingSourceProgress
  /** Deepest (min) tip-success frontier — archive transcription depth. */
  offeringBackfillFrontier: string | null
  offeringBackfillFrontierHolders: OfferingFrontierHolder[]
  /** Shallowest (max) tip-success frontier — WK historical gate readiness. */
  offeringGateFrontier: string | null
  offeringGateFrontierHolders: OfferingFrontierHolder[]
  /** Per-family listing discovery cursors (backfill progress). */
  offeringListingDiscovery: CiIngestSummaryInput['offeringListingDiscovery']
  offeringsSoftFailed: boolean
  webkincstarFetchFailedDays: number
  /** True when historical WK datums ran (gate open **or** explicit CLI datums). */
  webkincstarHistoricalEnabled: boolean
  /** True when the offering-archive depth gate alone would enable scheduled historical. */
  webkincstarHistoricalGateOpen: boolean
  webkincstarDatumsFetched: string[]
  webkincstarOverlaySkipped: number
  webkincstarOverlaySkippedSeries: WebkincstarSkippedSeriesRef[]
  webkincstarSeriesInvented: number
  webkincstarSeriesInventedSeries: WebkincstarSkippedSeriesRef[]
  webkincstarSoftFailed: boolean
  retailInterestSoftFailed: boolean
  exitCode: typeof EXIT_UPDATED | typeof EXIT_UNCHANGED | typeof EXIT_ERROR
}

/**
 * Build the quiet Actions `::notice::` one-liner for the overview list.
 * `wk_hist_gate` is gate readiness; not the same as historical datums enabled
 * (operator explicit `webkincstarDatums` can fetch history with the gate closed).
 * Tip vs backfill PDF/queue/pending are split; `frontier=` / `gate_frontier=` remain
 * deepest / shallowest tip-success frontiers; `discovery_exhausted=` counts families
 * whose listing discovery cursor is done.
 * Exported for unit tests.
 */
export function formatCiIngestNoticeLine(result: {
  changed: boolean
  asOf: string | null
  webkincstarHistoricalGateOpen: boolean
  webkincstarOverlaySkipped: number
  webkincstarSeriesInvented: number
  webkincstarFetchFailedDays: number
  offeringTip: Pick<OfferingSourceProgress, 'pdfsDownloaded' | 'pdfQueue' | 'pdfsPending'>
  offeringBackfill: Pick<
    OfferingSourceProgress,
    'pdfsDownloaded' | 'pdfQueue' | 'pdfsPending' | 'familiesExhausted'
  >
  offeringPdfsParseFailed: number
  offeringBackfillFrontier: string | null
  offeringGateFrontier: string | null
}): string {
  const tip = result.offeringTip
  const bf = result.offeringBackfill
  return [
    `changed=${result.changed}`,
    `as_of=${result.asOf ?? ''}`,
    `wk_hist_gate=${result.webkincstarHistoricalGateOpen ? 'on' : 'off'}`,
    `wk_overlay_skip=${result.webkincstarOverlaySkipped}`,
    `wk_series_invented=${result.webkincstarSeriesInvented}`,
    `wk_fetch_failed=${result.webkincstarFetchFailedDays}`,
    `pdfs_tip=${tip.pdfsDownloaded}`,
    `pdfs_bf=${bf.pdfsDownloaded}`,
    `queue_tip=${tip.pdfQueue}`,
    `queue_bf=${bf.pdfQueue}`,
    `pending_tip=${tip.pdfsPending}`,
    `pending_bf=${bf.pdfsPending}`,
    `parse_failed=${result.offeringPdfsParseFailed}`,
    `discovery_exhausted=${bf.familiesExhausted}`,
    `frontier=${result.offeringBackfillFrontier ?? ''}`,
    `gate_frontier=${result.offeringGateFrontier ?? ''}`
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
    offeringPdfsTranscribedSeries: report.offeringPdfsTranscribedSeries,
    offeringPdfsParseFailedSeries: report.offeringPdfsParseFailedSeries,
    offeringPdfsSkippedSeries: report.offeringPdfsSkippedSeries,
    offeringTip: report.offeringTip,
    offeringBackfill: report.offeringBackfill,
    offeringUnattributed: report.offeringUnattributed,
    offeringBackfillFrontier: report.offeringBackfillFrontier,
    offeringBackfillFrontierHolders: report.offeringBackfillFrontierHolders,
    offeringGateFrontier: report.offeringGateFrontier,
    offeringGateFrontierHolders: report.offeringGateFrontierHolders,
    offeringListingDiscovery: report.offeringListingDiscovery,
    offeringsSoftFailed: report.offeringsSoftFailed,
    webkincstarFetchFailedDays: report.webkincstarFetchFailedDays,
    webkincstarHistoricalEnabled: report.webkincstarHistoricalEnabled,
    webkincstarHistoricalGateOpen: report.webkincstarHistoricalGateOpen,
    webkincstarDatumsFetched: report.webkincstarDatumsFetched,
    webkincstarOverlaySkipped: report.webkincstarOverlaySkipped,
    webkincstarOverlaySkippedSeries: report.webkincstarOverlaySkippedSeries,
    webkincstarSeriesInvented: report.webkincstarSeriesInvented,
    webkincstarSeriesInventedSeries: report.webkincstarSeriesInventedSeries,
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
  writeGithubOutput('offering_pdfs_tip', String(result.offeringTip.pdfsDownloaded))
  writeGithubOutput('offering_pdfs_bf', String(result.offeringBackfill.pdfsDownloaded))
  writeGithubOutput('offering_queue_tip', String(result.offeringTip.pdfQueue))
  writeGithubOutput('offering_queue_bf', String(result.offeringBackfill.pdfQueue))
  writeGithubOutput('offering_pending_tip', String(result.offeringTip.pdfsPending))
  writeGithubOutput('offering_pending_bf', String(result.offeringBackfill.pdfsPending))
  writeGithubOutput('offering_backfill_frontier', result.offeringBackfillFrontier ?? '')
  writeGithubOutput('offering_gate_frontier', result.offeringGateFrontier ?? '')
  writeGithubOutput('offerings_soft_failed', result.offeringsSoftFailed ? 'true' : 'false')
  writeGithubOutput('webkincstar_fetch_failed_days', String(result.webkincstarFetchFailedDays))
  writeGithubOutput(
    'webkincstar_historical_enabled',
    result.webkincstarHistoricalEnabled ? 'true' : 'false'
  )
  writeGithubOutput(
    'webkincstar_historical_gate_open',
    result.webkincstarHistoricalGateOpen ? 'true' : 'false'
  )
  writeGithubOutput('webkincstar_datums_fetched', result.webkincstarDatumsFetched.join(','))
  writeGithubOutput('webkincstar_overlay_skipped', String(result.webkincstarOverlaySkipped))
  writeGithubOutput('webkincstar_series_invented', String(result.webkincstarSeriesInvented))
  writeGithubOutput('webkincstar_soft_failed', result.webkincstarSoftFailed ? 'true' : 'false')
  writeGithubOutput(
    'retail_interest_soft_failed',
    result.retailInterestSoftFailed ? 'true' : 'false'
  )

  writeGithubStepSummary(formatCiIngestStepSummary(result))

  writeGithubAnnotation('notice', formatCiIngestNoticeLine(result))
  if (result.webkincstarSeriesInvented > 0) {
    writeGithubAnnotation(
      'notice',
      `WebKincstár invented ${result.webkincstarSeriesInvented} series stub(s) (identitySource=webkincstar.allamkincstar.gov.hu)`
    )
  }
  if (result.webkincstarOverlaySkipped > 0) {
    const overlayMsg = `WebKincstár overlay soft-skipped ${result.webkincstarOverlaySkipped} unmatched quote(s); calendar seals withheld for those reports`
    // Expected during offering-archive drain (gate closed); warn only when gate is open.
    writeGithubAnnotation(
      result.webkincstarHistoricalGateOpen ? 'warning' : 'notice',
      overlayMsg
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
