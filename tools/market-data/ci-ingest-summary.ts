import type { OfferingFrontierHolder } from './offering-archive-frontier.ts'
import type { OfferingListingSource } from './normalize-offerings.ts'
import { OFFERING_FAMILIES, type OfferingFamilyCode } from './offering-families.ts'
import { formatListingDiscoverySummary } from './offering-listing-discovery.ts'
import type { FamilyCode, OfferingListingDiscoveryState } from './types.ts'

export type { OfferingListingSource }

/** PDF outcome identity for Actions summary (typed + tip/backfill sourced). */
export interface OfferingPdfSeriesRef {
  family: FamilyCode
  seriesId: string
  resourceType: string | null
  listingSource: OfferingListingSource
}

/** Unique WK overlay soft-skip series identity. */
export interface WebkincstarSkippedSeriesRef {
  family: FamilyCode
  id: string
  name: string
}

/** Per-source listing row type buckets. */
export interface OfferingListingTypeCounts {
  issue: number
  tap: number
  other: number
}

/** Tip or backfill listing/queue/PDF progress for one Actions summary block. */
export interface OfferingSourceProgress {
  /** Tip listing families OK, or backfill pages merged. */
  familiesOk: number
  /** Tip listing soft-fails, or backfill soft-fails. */
  familiesSoftFailed: number
  /** Backfill only: families with no discovery endBound (could not bootstrap). */
  familiesNoCursor: number
  /** Backfill only: families whose listing discovery cursor is exhausted. */
  familiesExhausted: number
  /** Backfill only: offline tip-only skip (no live backfill). */
  familiesSkipped: number
  rows: OfferingListingTypeCounts
  /** ISSUE rows already hashed on tip archive (not queued). */
  issueKnownHashed: number
  /** ISSUE rows queued for PDF this run. */
  pdfQueue: number
  pdfsDownloaded: number
  pdfsPending: number
  pdfsParseFailed: number
  pdfsSkippedNoSchedule: number
  pdfsDownloadFailed: number
  transcribed: OfferingPdfSeriesRef[]
  parseFailed: OfferingPdfSeriesRef[]
  skipped: OfferingPdfSeriesRef[]
  pending: OfferingPdfSeriesRef[]
  downloadFailed: OfferingPdfSeriesRef[]
}

export function emptyOfferingSourceProgress(): OfferingSourceProgress {
  return {
    familiesOk: 0,
    familiesSoftFailed: 0,
    familiesNoCursor: 0,
    familiesExhausted: 0,
    familiesSkipped: 0,
    rows: { issue: 0, tap: 0, other: 0 },
    issueKnownHashed: 0,
    pdfQueue: 0,
    pdfsDownloaded: 0,
    pdfsPending: 0,
    pdfsParseFailed: 0,
    pdfsSkippedNoSchedule: 0,
    pdfsDownloadFailed: 0,
    transcribed: [],
    parseFailed: [],
    skipped: [],
    pending: [],
    downloadFailed: []
  }
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
  /** Per-family listing discovery cursors after this run (backfill progress). */
  offeringListingDiscovery?: Partial<
    Record<OfferingFamilyCode, OfferingListingDiscoveryState>
  > | null
  offeringTip: OfferingSourceProgress
  offeringBackfill: OfferingSourceProgress
  /**
   * Archive-only / listing-absent PDF outcomes (e.g. operator reparse of sticky
   * parse_failed not on today’s tip∪backfill pages). Omitted from tip/bf split.
   */
  offeringUnattributed: OfferingSourceProgress
  /** Rolled-up totals (tip+backfill+unattributed) for notice / job outputs. */
  offeringPdfsDownloaded: number
  offeringPdfsPending: number
  offeringPdfsParseFailed: number
  offeringPdfsSkippedNoSchedule: number
  offeringsSoftFailed: boolean
  retailInterestSoftFailed: boolean
}

function escapeMdCell(value: string): string {
  // Escape backslashes first so later `\|` insertions stay literal in markdown cells.
  return value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|')
}

function formatTypedSeriesByFamily(rows: readonly OfferingPdfSeriesRef[]): string[] {
  if (rows.length === 0) return ['*(none)*']
  const byFamily = new Map<string, string[]>()
  for (const row of rows) {
    const list = byFamily.get(row.family) ?? []
    const type = row.resourceType?.trim() || 'unknown'
    const text = `${row.seriesId} (${type})`
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
  return [...new Set(parts)].sort((a, b) => a.localeCompare(b)).join(', ')
}

function formatRowsCell(rows: OfferingListingTypeCounts): string {
  return `ISSUE=${rows.issue}, TAP_*=${rows.tap}, other=${rows.other}`
}

function sourceBlockTitle(kind: OfferingListingSource): string {
  if (kind === 'unknown') return 'Offerings — unattributed (archive reparse)'
  return `Offerings — ${kind}`
}

function sourceHasActivity(source: OfferingSourceProgress): boolean {
  return (
    source.pdfQueue > 0 ||
    source.pdfsDownloaded > 0 ||
    source.pdfsPending > 0 ||
    source.pdfsParseFailed > 0 ||
    source.pdfsSkippedNoSchedule > 0 ||
    source.pdfsDownloadFailed > 0 ||
    source.transcribed.length > 0 ||
    source.parseFailed.length > 0 ||
    source.skipped.length > 0 ||
    source.pending.length > 0 ||
    source.downloadFailed.length > 0
  )
}

function appendSourceBlock(
  lines: string[],
  source: OfferingSourceProgress,
  kind: OfferingListingSource
): void {
  lines.push(`#### ${sourceBlockTitle(kind)}`, '', '| Metric | Value |', '| --- | --- |')
  if (kind === 'tip') {
    lines.push(`| listing families OK | ${source.familiesOk} |`)
    lines.push(`| listing soft-failed | ${source.familiesSoftFailed} |`)
  } else if (kind === 'backfill') {
    lines.push(`| backfill pages merged | ${source.familiesOk} |`)
    lines.push(`| backfill soft-failed | ${source.familiesSoftFailed} |`)
    lines.push(`| backfill exhausted | ${source.familiesExhausted} |`)
    lines.push(`| backfill no cursor | ${source.familiesNoCursor} |`)
    lines.push(`| backfill skipped (offline) | ${source.familiesSkipped} |`)
  } else {
    lines.push(
      '| note | Not on today’s tip∪backfill listing pages (typically operator reparse of archive-only sticky parse_failed). |'
    )
  }
  if (kind !== 'unknown') {
    lines.push(`| listing rows | ${formatRowsCell(source.rows)} |`)
    lines.push(`| ISSUE known (hashed) | ${source.issueKnownHashed} |`)
  }
  lines.push(`| PDF queue | ${source.pdfQueue} |`)
  lines.push(`| PDFs downloaded | ${source.pdfsDownloaded} |`)
  lines.push(`| PDFs pending | ${source.pdfsPending} |`)
  lines.push(`| PDF parse_failed | ${source.pdfsParseFailed} |`)
  lines.push(`| PDF skipped_no_schedule | ${source.pdfsSkippedNoSchedule} |`)
  lines.push(`| PDF download_failed | ${source.pdfsDownloadFailed} |`)
  lines.push('')

  if (kind !== 'unknown' && source.pdfQueue === 0) {
    lines.push(
      kind === 'tip'
        ? '_No new tip ISSUE PDFs queued (tip archive already has sha256 for tip-listed ISSUEs, or tip listing had none)._'
        : '_No new backfill ISSUE PDFs queued (tip archive already has sha256 for backfill-only ISSUEs, or no backfill page)._',
      ''
    )
  }

  const label = kind === 'unknown' ? 'unattributed' : kind
  lines.push(`PDF transcribed (${label}) by family:`, '', ...formatTypedSeriesByFamily(source.transcribed), '')
  lines.push(`PDF parse_failed (${label}) by family:`, '', ...formatTypedSeriesByFamily(source.parseFailed), '')
  lines.push(
    `PDF skipped_no_schedule (${label}) by family:`,
    '',
    ...formatTypedSeriesByFamily(source.skipped),
    ''
  )
  lines.push(`PDF pending (${label}) by family:`, '', ...formatTypedSeriesByFamily(source.pending), '')
  lines.push(
    `PDF download_failed (${label}) by family:`,
    '',
    ...formatTypedSeriesByFamily(source.downloadFailed),
    ''
  )
}

/**
 * Build the markdown body for `$GITHUB_STEP_SUMMARY` (Market-data ingest).
 * Exported for unit tests.
 */
export function formatCiIngestStepSummary(result: CiIngestSummaryInput): string {
  const tip = result.offeringTip
  const bf = result.offeringBackfill
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

  appendSourceBlock(lines, tip, 'tip')
  appendSourceBlock(lines, bf, 'backfill')
  const unattributed = result.offeringUnattributed
  if (sourceHasActivity(unattributed)) {
    appendSourceBlock(lines, unattributed, 'unknown')
  }

  const unkQueue = unattributed.pdfQueue
  const unkPending = unattributed.pdfsPending
  const unkPdfs = unattributed.pdfsDownloaded
  lines.push(
    '#### Offerings — frontiers / totals',
    '',
    '| Metric | Value |',
    '| --- | --- |',
    `| listing discovery cursors | ${formatListingDiscoverySummary(result.offeringListingDiscovery ?? null, OFFERING_FAMILIES)} |`,
    `| deepest tip-success frontier (archive depth, min) | ${result.offeringBackfillFrontier ?? '(none)'} |`,
    `| deepest tip-success frontier holders | ${formatFrontierHolders(result.offeringBackfillFrontierHolders)} |`,
    `| shallowest tip-success frontier (gate readiness, max) | ${result.offeringGateFrontier ?? '(none)'} |`,
    `| shallowest tip-success frontier holders | ${formatFrontierHolders(result.offeringGateFrontierHolders)} |`,
    `| soft-failed | ${result.offeringsSoftFailed} |`,
    '',
    `Totals: pdfs tip=${tip.pdfsDownloaded} bf=${bf.pdfsDownloaded} unk=${unkPdfs} | queue tip=${tip.pdfQueue} bf=${bf.pdfQueue} unk=${unkQueue} | pending tip=${tip.pdfsPending} bf=${bf.pdfsPending} unk=${unkPending}`,
    '',
    '#### Other soft-fails',
    '',
    `| retailInterest soft-failed | ${result.retailInterestSoftFailed} |`,
    ''
  )

  return lines.join('\n')
}

/** Bucket ÁKK resourceType for listing stats. */
export function bucketOfferingResourceType(
  resourceType: string | null | undefined
): keyof OfferingListingTypeCounts {
  const u = (resourceType ?? '').trim().toUpperCase()
  if (u === 'ISSUE') return 'issue'
  if (u.startsWith('TAP')) return 'tap'
  return 'other'
}

/** Re-export for callers that already have extremes. */
export type { OfferingFrontierDetail, OfferingFrontierHolder }
