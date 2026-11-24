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
 * Walk newest→older while status is terminal success; first non-success status
 * stops the walk. Calendar-day gaps between published dates are OK (unlike WK
 * `contiguousDurableFrontierDatum`, which requires day−1 calendar contiguity).
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
 * Per-family frontiers for every in-scope family; null if any family lacks one.
 */
export function offeringSuccessFrontiersByFamily(
  archive: OfferingArchiveFile | null | undefined,
  families: readonly OfferingFamilyCode[] = OFFERING_FAMILIES
): Record<OfferingFamilyCode, string> | null {
  if (!archive?.documents?.length) return null
  const out = {} as Record<OfferingFamilyCode, string>
  for (const family of families) {
    const frontier = contiguousOfferingSuccessFrontierPublished(archive.documents, family)
    if (!frontier) return null
    out[family] = frontier
  }
  return out
}

/**
 * Earliest (oldest / deepest) frontier across offering families; null if any
 * family lacks one. Useful as a “how deep have we gotten” metric — **not** the
 * WK historical gate signal (that uses the shallowest / max frontier).
 */
export function minOfferingSuccessFrontierPublished(
  archive: OfferingArchiveFile | null | undefined,
  families: readonly OfferingFamilyCode[] = OFFERING_FAMILIES
): string | null {
  const byFamily = offeringSuccessFrontiersByFamily(archive, families)
  if (!byFamily) return null
  let min: string | null = null
  for (const frontier of Object.values(byFamily)) {
    if (min === null || frontier < min) min = frontier
  }
  return min
}

/**
 * Latest (newest / shallowest) frontier across offering families; null if any
 * family lacks one. Gate readiness requires this shallowest frontier to be deep
 * enough so **every** family clears the depth bar.
 */
export function maxOfferingSuccessFrontierPublished(
  archive: OfferingArchiveFile | null | undefined,
  families: readonly OfferingFamilyCode[] = OFFERING_FAMILIES
): string | null {
  const byFamily = offeringSuccessFrontiersByFamily(archive, families)
  if (!byFamily) return null
  let max: string | null = null
  for (const frontier of Object.values(byFamily)) {
    if (max === null || frontier > max) max = frontier
  }
  return max
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
 * Scheduled §6m WK historical is enabled only when **every** offering family has
 * a contiguous tip success frontier at least `gateDays` before `asOf` — i.e. the
 * shallowest frontier (`max` published date) is still ≤ `asOf − gateDays`.
 * One deep family must not open the gate while another remains shallow.
 */
export function shouldEnableWebkincstarHistoricalBackfill(
  options: WebkincstarHistoricalGateOptions
): boolean {
  const asOf = options.asOf?.trim()
  if (!asOf || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return false
  const gateDays = options.gateDays ?? OFFERING_WK_HISTORICAL_GATE_DAYS
  if (!Number.isFinite(gateDays) || gateDays < 0) return false
  const shallowest = maxOfferingSuccessFrontierPublished(options.archive, options.families)
  if (!shallowest) return false
  const threshold = shiftIsoDate(asOf, -gateDays)
  return shallowest <= threshold
}
