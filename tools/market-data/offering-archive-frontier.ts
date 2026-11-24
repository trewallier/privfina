import { shiftIsoDate } from './fetch-webkincstar.ts'
import { OFFERING_FAMILIES, type OfferingFamilyCode } from './offering-families.ts'
import type {
  OfferingArchiveDocument,
  OfferingArchiveFile,
  OfferingDocumentStatus
} from './types.ts'

/**
 * Contiguous tip-cluster terminal statuses for offering-archive frontier walks
 * (ADR 0041 / ROADMAP §6m gate). Non-success breaks the contiguous walk.
 */
export const OFFERING_TERMINAL_SUCCESS_STATUSES: ReadonlySet<OfferingDocumentStatus> =
  new Set([
    'transcribed',
    'skipped_no_schedule',
    'skipped_already_transcribed'
  ])

/**
 * Minimum offering-archive depth (calendar days behind asOf) before scheduled
 * WebKincstár §6m historical backfill re-enables. Empty / shallow archives keep
 * historical off so WK does not walk into pre-tip matured names without identity.
 */
export const OFFERING_WK_HISTORICAL_GATE_DAYS = 90 as const

export function isOfferingTerminalSuccess(
  status: OfferingDocumentStatus | string | null | undefined
): boolean {
  return OFFERING_TERMINAL_SUCCESS_STATUSES.has(status as OfferingDocumentStatus)
}

/**
 * ISSUE-only docs for a family with a parseable published date, newest first.
 */
export function offeringArchiveDocsByPublishedDesc(
  documents: readonly OfferingArchiveDocument[] | null | undefined,
  family: OfferingFamilyCode
): OfferingArchiveDocument[] {
  return (documents ?? [])
    .filter(
      (d) =>
        d.family === family &&
        (d.resourceType ?? '').toUpperCase() === 'ISSUE' &&
        typeof d.published === 'string' &&
        /^\d{4}-\d{2}-\d{2}/.test(d.published)
    )
    .map((d) => ({ ...d, published: d.published!.slice(0, 10) }))
    .sort((a, b) => {
      const byPub = (b.published ?? '').localeCompare(a.published ?? '')
      if (byPub !== 0) return byPub
      return a.pathUuid.localeCompare(b.pathUuid)
    })
}

/**
 * Oldest `published` in the contiguous tip success cluster for one family.
 * Walk newest→older while status is terminal success; first gap / non-success
 * stops the walk (WK `contiguousDurableFrontierDatum` analog).
 * Returns null when the newest ISSUE is missing or not yet successful.
 */
export function contiguousOfferingSuccessFrontierPublished(
  documents: readonly OfferingArchiveDocument[] | null | undefined,
  family: OfferingFamilyCode
): string | null {
  const ordered = offeringArchiveDocsByPublishedDesc(documents, family)
  if (ordered.length === 0) return null
  if (!isOfferingTerminalSuccess(ordered[0]!.status)) return null

  let frontier = ordered[0]!.published!
  for (let i = 1; i < ordered.length; i += 1) {
    const doc = ordered[i]!
    if (!isOfferingTerminalSuccess(doc.status)) break
    // Contiguous by published date: allow same-day siblings; a strictly older
    // published continues the cluster. Gaps in calendar days are OK — the
    // "first gap" for backfill is the first non-success status, not a missing day.
    frontier = doc.published!
  }
  return frontier
}

/**
 * Earliest (oldest) frontier across offering families; null if any family lacks one.
 */
export function minOfferingSuccessFrontierPublished(
  archive: OfferingArchiveFile | null | undefined,
  families: readonly OfferingFamilyCode[] = OFFERING_FAMILIES
): string | null {
  if (!archive?.documents?.length) return null
  let min: string | null = null
  for (const family of families) {
    const frontier = contiguousOfferingSuccessFrontierPublished(archive.documents, family)
    if (!frontier) return null
    if (min === null || frontier < min) min = frontier
  }
  return min
}

export interface WebkincstarHistoricalGateOptions {
  archive: OfferingArchiveFile | null | undefined
  /** Snapshot asOf (YYYY-MM-DD); required for depth comparison. */
  asOf: string | null | undefined
  /** Override default {@link OFFERING_WK_HISTORICAL_GATE_DAYS}. */
  gateDays?: number
  families?: readonly OfferingFamilyCode[]
}

/**
 * Scheduled §6m WK historical is enabled only when every offering family has a
 * contiguous tip success frontier at least `gateDays` before `asOf`.
 */
export function shouldEnableWebkincstarHistoricalBackfill(
  options: WebkincstarHistoricalGateOptions
): boolean {
  const asOf = options.asOf?.trim()
  if (!asOf || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return false
  const gateDays = options.gateDays ?? OFFERING_WK_HISTORICAL_GATE_DAYS
  if (!Number.isFinite(gateDays) || gateDays < 0) return false
  const frontier = minOfferingSuccessFrontierPublished(options.archive, options.families)
  if (!frontier) return false
  const threshold = shiftIsoDate(asOf, -gateDays)
  return frontier <= threshold
}
