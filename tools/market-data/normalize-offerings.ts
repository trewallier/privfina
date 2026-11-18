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
   */
  reparseParseFailed?: boolean
}

/** PDF transcription is only attempted for ISSUE documents (not TAP amendments). */
export function isOfferingPdfEligible(row: NormalizedOfferingListingRow): boolean {
  return (row.resourceType ?? '').toUpperCase() === 'ISSUE'
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
 * when `reparseParseFailed` is set. TAP_* never enqueue for PDF download.
 */
export function diffOfferingsAgainstArchive(
  rows: NormalizedOfferingListingRow[],
  previousDocuments: OfferingArchiveDocument[] | null | undefined,
  options: DiffOfferingsOptions = {}
): OfferingListingDiff {
  const byUuid = new Map<string, OfferingArchiveDocument>()
  for (const doc of previousDocuments ?? []) {
    byUuid.set(doc.pathUuid.toLowerCase(), doc)
  }

  const unknownDocuments: NormalizedOfferingListingRow[] = []
  for (const row of rows) {
    if (!row.pathUuid) continue
    if (!isOfferingPdfEligible(row)) continue
    const existing = byUuid.get(row.pathUuid.toLowerCase())
    if (!existing || existing.sha256 == null) {
      unknownDocuments.push(row)
      continue
    }
    if (options.reparseParseFailed && existing.status === 'parse_failed') {
      unknownDocuments.push(row)
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
