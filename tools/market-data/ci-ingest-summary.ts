import type { OfferingFrontierDetail, OfferingFrontierHolder } from './offering-archive-frontier.ts'
import type { FamilyCode } from './types.ts'

/** PDF transcribed successfully this run (after download + parse). */
export interface OfferingPdfSeriesRef {
  family: FamilyCode
  seriesId: string
}

/** PDF skipped as no-schedule / amendment — include ÁKK resource type. */
export interface OfferingPdfSkippedRef extends OfferingPdfSeriesRef {
  resourceType: string | null
}

/** Unique WK overlay soft-skip series identity. */
export interface WebkincstarSkippedSeriesRef {
  family: FamilyCode
  id: string
  name: string
}

/** Fields needed to build the Actions `$GITHUB_STEP_SUMMARY` markdown. */
export interface CiIngestSummaryInput {
  changed: boolean
  asOf: string | null
  webkincstarHistoricalGateOpen: boolean
  webkincstarHistoricalEnabled: boolean
  webkincstarDatumsFetched: string[]
  webkincstarOverlaySkipped: number
  webkincstarOverlaySkippedSeries: WebkincstarSkippedSeriesRef[]
  webkincstarFetchFailedDays: number
  webkincstarSoftFailed: boolean
  offeringBackfillFrontier: string | null
  offeringGateFrontier: string | null
  offeringBackfillFrontierHolders: OfferingFrontierHolder[]
  offeringGateFrontierHolders: OfferingFrontierHolder[]
  offeringPdfsDownloaded: number
  offeringPdfsPending: number
  offeringPdfsParseFailed: number
  offeringPdfsSkippedNoSchedule: number
  offeringPdfsTranscribedSeries: OfferingPdfSeriesRef[]
  offeringPdfsParseFailedSeries: OfferingPdfSeriesRef[]
  offeringPdfsSkippedSeries: OfferingPdfSkippedRef[]
  offeringsSoftFailed: boolean
  retailInterestSoftFailed: boolean
}

function escapeMdCell(value: string): string {
  // Escape backslashes first so later `\|` insertions stay literal in markdown cells.
  return value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|')
}

function formatSeriesByFamily(
  rows: readonly OfferingPdfSeriesRef[],
  label: (row: OfferingPdfSeriesRef) => string = (r) => r.seriesId
): string[] {
  if (rows.length === 0) return ['*(none)*']
  const byFamily = new Map<string, string[]>()
  for (const row of rows) {
    const list = byFamily.get(row.family) ?? []
    const text = label(row)
    if (!list.includes(text)) list.push(text)
    byFamily.set(row.family, list)
  }
  const families = [...byFamily.keys()].sort((a, b) => a.localeCompare(b))
  return families.map((family) => {
    const ids = (byFamily.get(family) ?? []).sort((a, b) => a.localeCompare(b))
    return `- **${family}:** ${ids.map(escapeMdCell).join(', ')}`
  })
}

function formatWkSkippedByFamily(rows: readonly WebkincstarSkippedSeriesRef[]): string[] {
  if (rows.length === 0) return ['*(none)*']
  const byFamily = new Map<string, string[]>()
  for (const row of rows) {
    const list = byFamily.get(row.family) ?? []
    const text = row.name && row.name !== row.id ? `${row.id} (${row.name})` : row.id
    if (!list.includes(text)) list.push(text)
    byFamily.set(row.family, list)
  }
  const families = [...byFamily.keys()].sort((a, b) => a.localeCompare(b))
  return families.map((family) => {
    const ids = (byFamily.get(family) ?? []).sort((a, b) => a.localeCompare(b))
    return `- **${family}:** ${ids.map(escapeMdCell).join(', ')}`
  })
}

function formatFrontierHolders(holders: readonly OfferingFrontierHolder[]): string {
  if (holders.length === 0) return '(none)'
  const parts = holders.map((h) => {
    const type = h.resourceType ? `/${h.resourceType}` : ''
    return `${h.family}/${h.seriesId}${type}`
  })
  // Stable unique order for the summary table cell.
  return [...new Set(parts)].sort((a, b) => a.localeCompare(b)).join(', ')
}

/**
 * Build the markdown body for `$GITHUB_STEP_SUMMARY` (Market-data ingest).
 * Exported for unit tests.
 */
export function formatCiIngestStepSummary(result: CiIngestSummaryInput): string {
  const lines: string[] = [
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
    `| historical gate (shallowest frontier) | ${result.webkincstarHistoricalGateOpen ? 'open' : 'closed'} |`,
    `| historical datums included | ${result.webkincstarHistoricalEnabled ? 'yes' : 'no'} |`,
    `| datums fetched | ${result.webkincstarDatumsFetched.join(', ') || '(none)'} |`,
    `| overlay skipped | ${result.webkincstarOverlaySkipped} |`,
    `| fetch_failed days | ${result.webkincstarFetchFailedDays} |`,
    `| soft-failed | ${result.webkincstarSoftFailed} |`,
    ''
  ]

  if (result.webkincstarOverlaySkipped > 0) {
    lines.push('Overlay soft-skipped series (by family):', '')
    lines.push(...formatWkSkippedByFamily(result.webkincstarOverlaySkippedSeries))
    lines.push('')
  }

  lines.push(
    '#### Offerings',
    '',
    '| Metric | Value |',
    '| --- | --- |',
    `| deepest frontier (progress, min) | ${result.offeringBackfillFrontier ?? '(none)'} |`,
    `| deepest frontier holders | ${formatFrontierHolders(result.offeringBackfillFrontierHolders)} |`,
    `| shallowest frontier (gate readiness, max) | ${result.offeringGateFrontier ?? '(none)'} |`,
    `| shallowest frontier holders | ${formatFrontierHolders(result.offeringGateFrontierHolders)} |`,
    `| PDFs downloaded | ${result.offeringPdfsDownloaded} |`,
    `| PDFs pending | ${result.offeringPdfsPending} |`,
    `| PDF parse_failed | ${result.offeringPdfsParseFailed} |`,
    `| PDF skipped_no_schedule | ${result.offeringPdfsSkippedNoSchedule} |`,
    `| soft-failed | ${result.offeringsSoftFailed} |`,
    '',
    'PDF transcribed (successful) by family:',
    '',
    ...formatSeriesByFamily(result.offeringPdfsTranscribedSeries),
    '',
    'PDF parse_failed by family:',
    '',
    ...formatSeriesByFamily(result.offeringPdfsParseFailedSeries),
    '',
    'PDF skipped_no_schedule by family (series / type):',
    '',
    ...formatSeriesByFamily(result.offeringPdfsSkippedSeries, (r) => {
      const skipped = r as OfferingPdfSkippedRef
      const type = skipped.resourceType?.trim() || 'unknown'
      return `${skipped.seriesId} (${type})`
    }),
    '',
    '#### Other soft-fails',
    '',
    `| retailInterest soft-failed | ${result.retailInterestSoftFailed} |`,
    ''
  )

  return lines.join('\n')
}

/** Re-export for callers that already have extremes. */
export type { OfferingFrontierDetail, OfferingFrontierHolder }
