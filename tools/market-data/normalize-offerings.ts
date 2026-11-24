import { toSeriesId } from './ids.ts'
import {
  offeringFamilyFromLabel,
  type OfferingFamilyCode
} from './offering-families.ts'
import type {
  AkkEnvelope,
  AkkRow,
  FamilyCode,
  OfferingArchiveDocument,
  OfferingDocumentStatus,
  OfferingFile,
  SaleWindow
} from './types.ts'
import {
  OFFERING_TRANSCRIPTION_DISCLAIMER,
  SCHEMA_VERSION
} from './types.ts'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/

export interface NormalizedOfferingListingRow {
  family: OfferingFamilyCode
  seriesId: string
  name: string
  isin: string | null
  saleWindow: SaleWindow | null
  pathId: string | null
  pathUuid: string | null
  path: string | null
  published: string | null
  modifiedOn: string | null
  resourceType: string | null
  archive: boolean
  longName: string | null
}

export interface OfferingListingDiff {
  /** Rows from the listing (all parseable). */
  rows: NormalizedOfferingListingRow[]
  /**
   * ISSUE documents eligible for PDF download whose pathUuid is absent from the
   * previous archive, lacks sha256, or (when reparseParseFailed) is sticky parse_failed.
   * TAP_* rows stay listing/metadata-only and never appear here.
   */
  unknownDocuments: NormalizedOfferingListingRow[]
  /** Series tip sale windows from preferred non-archive rows. */
  saleWindowsBySeries: Map<string, { family: OfferingFamilyCode; window: SaleWindow }>
}

export interface DiffOfferingsOptions {
  /**
   * When true, ISSUE rows archived as sticky `parse_failed` re-enter the download
   * queue (operator recovery after a parser fix). Default false (ADR 0041 sticky).
   * Skips series that already have a transcribed sibling and never requeues
   * `skipped_no_schedule`. Also synthesizes rows for archive-only sticky ISSUEs
   * that fell out of the current listing window.
   */
  reparseParseFailed?: boolean
}

/** PDF transcription is only attempted for ISSUE documents (not TAP amendments). */
export function isOfferingPdfEligible(row: NormalizedOfferingListingRow): boolean {
  return (row.resourceType ?? '').toUpperCase() === 'ISSUE'
}

/** Synthesize a listing row from an archive document (archive-only reparse). */
export function listingRowFromArchiveDocument(
  doc: OfferingArchiveDocument
): NormalizedOfferingListingRow {
  const uuid = doc.pathUuid.toLowerCase()
  return {
    family: doc.family as OfferingFamilyCode,
    seriesId: doc.seriesId,
    name: doc.seriesId,
    isin: doc.isin,
    saleWindow: null,
    pathId: doc.pathId,
    pathUuid: uuid,
    path: `public_offerings/${uuid}.pdf`,
    published: doc.published,
    modifiedOn: doc.modifiedOn,
    resourceType: doc.resourceType,
    archive: true,
    longName: null
  }
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function asIsoDate(value: unknown): string | null {
  const raw = asString(value)
  if (!raw) return null
  const m = ISO_DATE.exec(raw)
  return m ? m[0] : null
}

function asBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1' || value === 'true') return true
  return false
}

/**
 * Extract PDF UUID from `public_offerings/<uuid>.pdf` or a bare uuid.
 */
export function pathUuidFromOfferingPath(pathValue: unknown): string | null {
  const raw = asString(pathValue)
  if (!raw) return null
  const base = raw.split('/').pop() ?? raw
  const withoutExt = base.replace(/\.pdf$/i, '')
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(withoutExt)) {
    return withoutExt.toLowerCase()
  }
  return null
}

/**
 * Tip listing vs backfill-only listing (tip wins on UUID overlap).
 * `'unknown'` = not on today’s tip∪backfill pages (e.g. archive-only reparse).
 */
export type OfferingListingSource = 'tip' | 'backfill' | 'unknown'

/**
 * Collect lowercase path UUIDs from a raw getPublicOfferings envelope.
 */
export function pathUuidsFromOfferingEnvelope(envelope: AkkEnvelope | null | undefined): Set<string> {
  const out = new Set<string>()
  if (!envelope?.data?.length) return out
  for (const row of envelope.data) {
    if (!row || typeof row !== 'object') continue
    const path = (row as AkkRow).path
    const uuid = pathUuidFromOfferingPath(path)
    if (uuid) out.add(uuid)
  }
  return out
}

/**
 * Map pathUuid → listing source. Tip UUIDs win; backfill-only UUIDs are `'backfill'`.
 * UUIDs absent from both pages are not in the map — resolve as `'unknown'`.
 */
export function offeringListingSourceByUuid(
  tipEnvelope: AkkEnvelope,
  backfillEnvelope: AkkEnvelope | null | undefined
): Map<string, OfferingListingSource> {
  const tipUuids = pathUuidsFromOfferingEnvelope(tipEnvelope)
  const map = new Map<string, OfferingListingSource>()
  for (const uuid of tipUuids) map.set(uuid, 'tip')
  for (const uuid of pathUuidsFromOfferingEnvelope(backfillEnvelope)) {
    if (!map.has(uuid)) map.set(uuid, 'backfill')
  }
  return map
}

export function resolveOfferingListingSource(
  pathUuid: string | null | undefined,
  byUuid: ReadonlyMap<string, OfferingListingSource>
): OfferingListingSource {
  if (!pathUuid) return 'unknown'
  return byUuid.get(pathUuid.toLowerCase()) ?? 'unknown'
}

function saleWindowFromRow(row: AkkRow): SaleWindow | null {
  const from = asIsoDate(row.startPeriod)
  if (!from) return null
  const to = asIsoDate(row.endPeriod)
  return { from, to }
}

export function normalizeOfferingListingRow(
  row: AkkRow,
  fallbackFamily: OfferingFamilyCode
): NormalizedOfferingListingRow | null {
  const labelFamily = offeringFamilyFromLabel(row.label) ?? fallbackFamily
  const longName = asString(row.longName)
  const name = asString(row.name) ?? asString(row.offeringName) ?? longName
  if (!name && !longName) return null
  const idSource = longName ?? name!
  let seriesId: string
  try {
    seriesId = toSeriesId(idSource)
  } catch {
    return null
  }
  const path = asString(row.path)
  return {
    family: labelFamily,
    seriesId,
    name: name ?? seriesId,
    isin: asString(row.isin),
    saleWindow: saleWindowFromRow(row),
    pathId: asString(row.pathId),
    pathUuid: pathUuidFromOfferingPath(path),
    path,
    published: asString(row.published),
    modifiedOn: asString(row.modifiedOn),
    resourceType: asString(row.resourceType),
    archive: asBool(row.archive),
    longName
  }
}

export function normalizeOfferingEnvelope(
  envelope: AkkEnvelope,
  family: OfferingFamilyCode
): NormalizedOfferingListingRow[] {
  const data = Array.isArray(envelope.data) ? envelope.data : []
  const out: NormalizedOfferingListingRow[] = []
  for (const row of data) {
    const normalized = normalizeOfferingListingRow(row, family)
    if (normalized) out.push(normalized)
  }
  return out
}

/**
 * Compare listing rows to the tip archive. Unknown = ISSUE pathUuid absent from
 * archive, sha256 still null (pending / failed download), or sticky parse_failed
 * when `reparseParseFailed` is set (excluding series that already have a
 * transcribed sibling). TAP_* and `skipped_no_schedule` never enqueue for PDF.
 */
export function diffOfferingsAgainstArchive(
  rows: NormalizedOfferingListingRow[],
  previousDocuments: OfferingArchiveDocument[] | null | undefined,
  options: DiffOfferingsOptions = {}
): OfferingListingDiff {
  const byUuid = new Map<string, OfferingArchiveDocument>()
  const transcribedSeriesIds = new Set<string>()
  for (const doc of previousDocuments ?? []) {
    byUuid.set(doc.pathUuid.toLowerCase(), doc)
    if (doc.status === 'transcribed') {
      transcribedSeriesIds.add(`${doc.family}\0${doc.seriesId}`)
    }
  }

  const unknownDocuments: NormalizedOfferingListingRow[] = []
  const queuedUuids = new Set<string>()
  for (const row of rows) {
    if (!row.pathUuid) continue
    if (!isOfferingPdfEligible(row)) continue
    const uuid = row.pathUuid.toLowerCase()
    const existing = byUuid.get(uuid)
    if (!existing || existing.sha256 == null) {
      unknownDocuments.push(row)
      queuedUuids.add(uuid)
      continue
    }
    if (
      existing.status === 'skipped_no_schedule' ||
      existing.status === 'skipped_already_transcribed'
    ) {
      continue
    }
    if (
      options.reparseParseFailed &&
      existing.status === 'parse_failed' &&
      !transcribedSeriesIds.has(`${row.family}\0${row.seriesId}`)
    ) {
      unknownDocuments.push(row)
      queuedUuids.add(uuid)
    }
  }

  // Operator reparse: also enqueue archive-only ISSUE parse_failed that fell out
  // of today's listing window (still lacking a transcribed sibling).
  if (options.reparseParseFailed) {
    for (const doc of previousDocuments ?? []) {
      if (doc.status !== 'parse_failed') continue
      if ((doc.resourceType ?? '').toUpperCase() !== 'ISSUE') continue
      if (doc.sha256 == null) continue
      const uuid = doc.pathUuid.toLowerCase()
      if (queuedUuids.has(uuid)) continue
      const seriesKey = `${doc.family}\0${doc.seriesId}`
      if (transcribedSeriesIds.has(seriesKey)) continue
      unknownDocuments.push(listingRowFromArchiveDocument(doc))
      queuedUuids.add(uuid)
    }
  }

  const saleWindowsBySeries = new Map<
    string,
    { family: OfferingFamilyCode; window: SaleWindow }
  >()
  // Prefer non-archive tip rows; fall back to any row with a window.
  const sorted = [...rows].sort((a, b) => {
    if (a.archive !== b.archive) return a.archive ? 1 : -1
    return (b.published ?? '').localeCompare(a.published ?? '')
  })
  for (const row of sorted) {
    if (!row.saleWindow) continue
    const key = `${row.family}\0${row.seriesId}`
    if (!saleWindowsBySeries.has(key)) {
      saleWindowsBySeries.set(key, { family: row.family, window: row.saleWindow })
    }
  }

  return { rows, unknownDocuments, saleWindowsBySeries }
}

export function offeringStubFromListing(
  row: NormalizedOfferingListingRow,
  options?: { paymentDates?: string[]; dayCount?: string | null }
): OfferingFile {
  const document =
    row.path != null
      ? `ÁKK nyilvános ajánlattétel ${row.name} (${row.path})`
      : `ÁKK nyilvános ajánlattétel ${row.name}`
  const file: OfferingFile = {
    schemaVersion: SCHEMA_VERSION,
    id: row.seriesId,
    source: {
      id: 'akk-nyilvanos-ajanlattetel',
      host: 'www.akk.hu',
      document,
      disclaimer: OFFERING_TRANSCRIPTION_DISCLAIMER
    }
  }
  if (row.saleWindow) {
    file.saleWindow = { ...row.saleWindow }
  }
  if (options?.paymentDates && options.paymentDates.length > 0) {
    file.paymentDates = [...options.paymentDates]
  }
  if (options?.dayCount) {
    file.dayCount = options.dayCount
  }
  return file
}

export function archiveDocumentFromListing(
  row: NormalizedOfferingListingRow,
  status: OfferingDocumentStatus,
  extras?: Partial<Pick<OfferingArchiveDocument, 'sha256' | 'bytes' | 'sourceHost'>>
): OfferingArchiveDocument | null {
  if (!row.pathUuid) return null
  return {
    pathId: row.pathId,
    pathUuid: row.pathUuid.toLowerCase(),
    family: row.family as FamilyCode,
    seriesId: row.seriesId,
    isin: row.isin,
    published: row.published,
    modifiedOn: row.modifiedOn,
    resourceType: row.resourceType,
    sha256: extras?.sha256 ?? null,
    bytes: extras?.bytes ?? null,
    status,
    sourceHost: extras?.sourceHost ?? 'documents.akk.hu'
  }
}

export interface RankOfferingDownloadsOptions {
  /** Series keys `family\0seriesId` that already have a transcribed offering PDF. */
  transcribedSeriesIds?: ReadonlySet<string>
}

/**
 * Rank ISSUE docs for download: prefer series still lacking a transcription,
 * then non-archive, then newest published/modified.
 */
export function rankOfferingDownloads(
  rows: NormalizedOfferingListingRow[],
  options: RankOfferingDownloadsOptions = {}
): NormalizedOfferingListingRow[] {
  const transcribed = options.transcribedSeriesIds
  return [...rows]
    .filter((r) => r.pathUuid && isOfferingPdfEligible(r))
    .sort((a, b) => {
      if (transcribed) {
        const aKey = `${a.family}\0${a.seriesId}`
        const bKey = `${b.family}\0${b.seriesId}`
        const aDone = transcribed.has(aKey) ? 1 : 0
        const bDone = transcribed.has(bKey) ? 1 : 0
        if (aDone !== bDone) return aDone - bDone
      }
      if (a.archive !== b.archive) return a.archive ? 1 : -1
      const pub = (b.published ?? '').localeCompare(a.published ?? '')
      if (pub !== 0) return pub
      return (b.modifiedOn ?? '').localeCompare(a.modifiedOn ?? '')
    })
}

/**
 * After ranking, keep at most one UUID per series that still lacks a
 * transcription so one success unblocks the series instead of burning the
 * family cap on duplicates. Series that already have a transcription keep all
 * ranked UUIDs (historical extras). Dedupe by pathUuid first.
 */
export function selectOfferingDownloads(
  ranked: NormalizedOfferingListingRow[],
  options: RankOfferingDownloadsOptions = {}
): NormalizedOfferingListingRow[] {
  const transcribed = options.transcribedSeriesIds
  const seenUuid = new Set<string>()
  const seenLackingSeries = new Set<string>()
  const out: NormalizedOfferingListingRow[] = []
  for (const row of ranked) {
    if (!row.pathUuid) continue
    const uuid = row.pathUuid.toLowerCase()
    if (seenUuid.has(uuid)) continue
    seenUuid.add(uuid)
    const seriesKey = `${row.family}\0${row.seriesId}`
    const lacking = !transcribed || !transcribed.has(seriesKey)
    if (lacking) {
      if (seenLackingSeries.has(seriesKey)) continue
      seenLackingSeries.add(seriesKey)
    }
    out.push(row)
  }
  return out
}
