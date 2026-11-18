import { EXIT_ERROR, EXIT_UNCHANGED, EXIT_UPDATED, ingestMarketData } from './ingest.ts'
import { writeGithubOutput, writeGithubStepSummary } from './github-output.ts'
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
  webkincstarFetchFailedDays: number
  exitCode: typeof EXIT_UPDATED | typeof EXIT_UNCHANGED | typeof EXIT_ERROR
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
    webkincstarTextByReport: options.webkincstarTextByReport,
    webkincstarDatum: options.webkincstarDatum,
    skipWebkincstar: options.skipWebkincstar,
    offeringEnvelopesByFamily: options.offeringEnvelopesByFamily,
    skipOfferings: options.skipOfferings,
    reparseParseFailed: options.reparseParseFailed,
    fetchImpl: options.fetchImpl,
    generatedAt: options.generatedAt
  })

  writeGithubOutput('changed', report.changed ? 'true' : 'false')
  writeGithubOutput('as_of', report.asOf ?? '')
  writeGithubOutput('offering_pdfs_downloaded', String(report.offeringPdfsDownloaded))
  writeGithubOutput('offering_pdfs_pending', String(report.offeringPdfsPending))
  writeGithubOutput('offering_pdfs_parse_failed', String(report.offeringPdfsParseFailed))
  writeGithubOutput(
    'offering_pdfs_skipped_no_schedule',
    String(report.offeringPdfsSkippedNoSchedule)
  )
  writeGithubOutput('webkincstar_fetch_failed_days', String(report.webkincstarFetchFailedDays))

  writeGithubStepSummary(
    [
      '### Market-data ingest',
      '',
      '| Metric | Value |',
      '| --- | --- |',
      `| changed | ${report.changed} |`,
      `| as_of | ${report.asOf ?? ''} |`,
      `| offering PDFs downloaded | ${report.offeringPdfsDownloaded} |`,
      `| offering PDFs pending | ${report.offeringPdfsPending} |`,
      `| offering PDF parse_failed | ${report.offeringPdfsParseFailed} |`,
      `| offering PDF skipped_no_schedule | ${report.offeringPdfsSkippedNoSchedule} |`,
      `| WebKincstár fetch_failed days | ${report.webkincstarFetchFailedDays} |`,
      `| offerings soft-failed | ${report.offeringsSoftFailed} |`,
      `| WebKincstár soft-failed | ${report.webkincstarSoftFailed} |`,
      ''
    ].join('\n')
  )

  return {
    changed: report.changed,
    asOf: report.asOf,
    offeringPdfsDownloaded: report.offeringPdfsDownloaded,
    offeringPdfsPending: report.offeringPdfsPending,
    offeringPdfsParseFailed: report.offeringPdfsParseFailed,
    offeringPdfsSkippedNoSchedule: report.offeringPdfsSkippedNoSchedule,
    webkincstarFetchFailedDays: report.webkincstarFetchFailedDays,
    exitCode: report.changed ? EXIT_UPDATED : EXIT_UNCHANGED
  }
}
