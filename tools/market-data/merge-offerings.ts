import { digestOfferingArchive, digestCanonical } from './digests.ts'
import { MergeError } from './merge.ts'
import {
  archiveDocumentFromListing,
  offeringStubFromListing,
  type NormalizedOfferingListingRow
} from './normalize-offerings.ts'
import type { OfferingFamilyCode } from './offering-families.ts'
import { mergeListingDiscoveryStates } from './offering-listing-discovery.ts'
import {
  OFFERING_TRANSCRIPTION_DISCLAIMER,
  SCHEMA_VERSION,
  type FamilyCode,
  type OfferingArchiveDocument,
  type OfferingArchiveFile,
  type OfferingFile,
  type OfferingListingDiscoveryState,
  type SaleWindow,
  type SeriesRecord
} from './types.ts'

export interface MergeOfferingsInput {
  /** All listing rows from successful family fetches this run. */
  listingRows: NormalizedOfferingListingRow[]
  /** Tip sale windows keyed by `${family}\0${seriesId}`. */
  saleWindowsBySeries: Map<string, { family: OfferingFamilyCode; window: SaleWindow }>
  /**
   * Archive rows to upsert (listed / pending_download / downloaded / …).
   * When a pathUuid already has sha256, preserve sha256/bytes/status unless
   * the incoming status is a successful upgrade (downloaded/transcribed).
   */
  archiveUpserts: OfferingArchiveDocument[]
  /** Optional full offering bodies (paymentDates filled after parse). */
  offeringUpdates?: OfferingFile[]
  /** Per-family listing discovery cursor updates from this run's backfill pages. */
  listingDiscoveryUpdates?: Partial<Record<OfferingFamilyCode, OfferingListingDiscoveryState>>
  generatedAt: string
}

export interface MergeOfferingsResult {
  offeringsByFamily: Partial<Record<FamilyCode, Record<string, OfferingFile>>>
  offeringArchive: OfferingArchiveFile
  /** Series id → saleWindow patches applied (for series.json). */
  seriesSaleWindows: Array<{ family: FamilyCode; seriesId: string; saleWindow: SaleWindow }>
  offeringsChanged: boolean
  archiveChanged: boolean
  saleWindowsChanged: boolean
  /** ISSUE parse_failed rows rewritten to skipped_already_transcribed this merge. */
  archiveSkippedAlreadyTranscribed: number
}

function cloneArchive(file: OfferingArchiveFile): OfferingArchiveFile {
  return {
    schemaVersion: file.schemaVersion,
    generatedAt: file.generatedAt,
    source: { ...file.source },
    documents: file.documents.map((d) => ({ ...d })),
    listingDiscovery: file.listingDiscovery
      ? structuredClone(file.listingDiscovery)
      : undefined
  }
}

export function emptyOfferingArchiveFile(generatedAt: string): OfferingArchiveFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    source: {
      id: 'akk-public-offerings',
      host: 'www.akk.hu',
      disclaimer: OFFERING_TRANSCRIPTION_DISCLAIMER
    },
    documents: []
  }
}

function offeringEqual(a: OfferingFile, b: OfferingFile): boolean {
  return digestCanonical(a) === digestCanonical(b)
}

function preferArchiveStatus(
  existing: OfferingArchiveDocument,
  incoming: OfferingArchiveDocument
): OfferingArchiveDocument {
  // Never drop a recorded sha256 (never re-download).
  if (existing.sha256 != null) {
    const next: OfferingArchiveDocument = {
      ...existing,
      pathId: incoming.pathId ?? existing.pathId,
      seriesId: incoming.seriesId || existing.seriesId,
      isin: incoming.isin ?? existing.isin,
      published: incoming.published ?? existing.published,
      modifiedOn: incoming.modifiedOn ?? existing.modifiedOn,
      resourceType: incoming.resourceType ?? existing.resourceType
    }
    // Allow status upgrade along the happy path only when sha already known.
    if (
      incoming.status === 'transcribed' ||
      (incoming.status === 'downloaded' && existing.status === 'listed')
    ) {
      next.status = incoming.status
    }
    if (
      (incoming.status === 'skipped_no_schedule' ||
        incoming.status === 'skipped_already_transcribed') &&
      existing.status !== 'transcribed'
    ) {
      next.status = incoming.status
    }
    if (
      incoming.status === 'parse_failed' &&
      existing.status !== 'transcribed' &&
      existing.status !== 'skipped_no_schedule' &&
      existing.status !== 'skipped_already_transcribed'
    ) {
      next.status = 'parse_failed'
    }
    return next
  }
  return { ...incoming }
}

/** TAP_* PDFs never carry coupon schedules — migrate sticky parse_failed → skip. */
export function isTapResourceType(resourceType: string | null | undefined): boolean {
  const rt = (resourceType ?? '').toUpperCase()
  return rt.startsWith('TAP')
}

/**
 * Rewrite TAP_* `parse_failed` rows to `skipped_no_schedule` (keeps sha256).
 * Called during merge so daily ingest clears legacy false alarms without PDF hits.
 */
export function migrateTapParseFailedToSkipped(
  documents: OfferingArchiveDocument[]
): OfferingArchiveDocument[] {
  return documents.map((doc) => {
    if (doc.status !== 'parse_failed' || !isTapResourceType(doc.resourceType)) {
      return doc
    }
    return { ...doc, status: 'skipped_no_schedule' }
  })
}

/**
 * Rewrite ISSUE `parse_failed` rows to `skipped_already_transcribed` when the
 * same family/series already has a transcribed document (keeps sha256; no PDF).
 */
export function migrateParseFailedWhenSeriesTranscribed(
  documents: OfferingArchiveDocument[]
): { documents: OfferingArchiveDocument[]; migratedCount: number } {
  const transcribedSeries = new Set(
    documents
      .filter((d) => d.status === 'transcribed')
      .map((d) => `${d.family}\0${d.seriesId}`)
  )
  let migratedCount = 0
  const next = documents.map((doc) => {
    if (doc.status !== 'parse_failed') return doc
    if ((doc.resourceType ?? '').toUpperCase() !== 'ISSUE') return doc
    if (!transcribedSeries.has(`${doc.family}\0${doc.seriesId}`)) return doc
    migratedCount += 1
    return { ...doc, status: 'skipped_already_transcribed' as const }
  })
  return { documents: next, migratedCount }
}

/**
 * Merge listing-derived offerings + archive into previous tree slices (ADR 0041).
 * Does not download PDFs — callers supply archiveUpserts after the download gate.
 */
export function mergeOfferingsState(
  previousOfferings: Partial<Record<FamilyCode, Record<string, OfferingFile>>>,
  previousArchive: OfferingArchiveFile | null,
  input: MergeOfferingsInput
): MergeOfferingsResult {
  const offeringsByFamily: Partial<Record<FamilyCode, Record<string, OfferingFile>>> = {}
  for (const [family, map] of Object.entries(previousOfferings)) {
    offeringsByFamily[family as FamilyCode] = Object.fromEntries(
      Object.entries(map).map(([id, o]) => [id, structuredClone(o)])
    )
  }

  let offeringsChanged = false

  // Stubs from listing (saleWindow + source); prefer tip non-archive rows.
  const tipBySeries = new Map<string, NormalizedOfferingListingRow>()
  const sorted = [...input.listingRows].sort((a, b) => {
    if (a.archive !== b.archive) return a.archive ? 1 : -1
    return (b.published ?? '').localeCompare(a.published ?? '')
  })
  for (const row of sorted) {
    const key = `${row.family}\0${row.seriesId}`
    if (!tipBySeries.has(key)) tipBySeries.set(key, row)
  }

  for (const row of tipBySeries.values()) {
    const fam = row.family as FamilyCode
    if (!offeringsByFamily[fam]) offeringsByFamily[fam] = {}
    const prev = offeringsByFamily[fam]![row.seriesId]
    const stub = offeringStubFromListing(row, {
      paymentDates: prev?.paymentDates,
      dayCount: prev?.dayCount ?? null
    })
    // Preserve transcribed fields when listing refresh only updates saleWindow/source.
    if (prev?.paymentDates?.length) stub.paymentDates = [...prev.paymentDates]
    if (prev?.dayCount) stub.dayCount = prev.dayCount
    if (!prev || !offeringEqual(prev, stub)) {
      offeringsByFamily[fam]![row.seriesId] = stub
      offeringsChanged = true
    }
  }

  for (const update of input.offeringUpdates ?? []) {
    // Family inferred from previous map or listing tip.
    let family: FamilyCode | null = null
    for (const [fam, map] of Object.entries(offeringsByFamily)) {
      if (map[update.id]) {
        family = fam as FamilyCode
        break
      }
    }
    if (!family) {
      for (const row of tipBySeries.values()) {
        if (row.seriesId === update.id) {
          family = row.family
          break
        }
      }
    }
    if (!family) {
      throw new MergeError(`Cannot place offering update for unknown series ${update.id}`)
    }
    if (!offeringsByFamily[family]) offeringsByFamily[family] = {}
    const prev = offeringsByFamily[family]![update.id]
    if (!prev || !offeringEqual(prev, update)) {
      offeringsByFamily[family]![update.id] = structuredClone(update)
      offeringsChanged = true
    }
  }

  const baseArchive = previousArchive
    ? cloneArchive(previousArchive)
    : emptyOfferingArchiveFile(input.generatedAt)
  const byUuid = new Map<string, OfferingArchiveDocument>()
  for (const doc of baseArchive.documents) {
    byUuid.set(doc.pathUuid.toLowerCase(), { ...doc })
  }

  for (const incoming of input.archiveUpserts) {
    const key = incoming.pathUuid.toLowerCase()
    const existing = byUuid.get(key)
    if (!existing) {
      byUuid.set(key, { ...incoming, pathUuid: key })
      continue
    }
    byUuid.set(key, preferArchiveStatus(existing, { ...incoming, pathUuid: key }))
  }

  // Also ensure every listing row with a UUID appears at least as listed.
  for (const row of input.listingRows) {
    const listed = archiveDocumentFromListing(row, 'listed')
    if (!listed) continue
    const key = listed.pathUuid
    if (!byUuid.has(key)) {
      byUuid.set(key, listed)
    } else {
      byUuid.set(key, preferArchiveStatus(byUuid.get(key)!, listed))
    }
  }

  const afterTap = migrateTapParseFailedToSkipped([...byUuid.values()])
  const { documents: migratedDocs, migratedCount: archiveSkippedAlreadyTranscribed } =
    migrateParseFailedWhenSeriesTranscribed(afterTap)
  if (archiveSkippedAlreadyTranscribed > 0) {
    console.error(
      `[market-data] offering archive: ${archiveSkippedAlreadyTranscribed} parse_failed marked skipped (series already transcribed)`
    )
  }

  const listingDiscovery = input.listingDiscoveryUpdates
    ? mergeListingDiscoveryStates(baseArchive.listingDiscovery, input.listingDiscoveryUpdates)
    : baseArchive.listingDiscovery

  const mergedArchive: OfferingArchiveFile = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: input.generatedAt,
    source: {
      id: 'akk-public-offerings',
      host: 'www.akk.hu',
      disclaimer: OFFERING_TRANSCRIPTION_DISCLAIMER
    },
    documents: migratedDocs.sort((a, b) => a.pathUuid.localeCompare(b.pathUuid)),
    ...(listingDiscovery && Object.keys(listingDiscovery).length > 0
      ? { listingDiscovery }
      : {})
  }

  let archiveChanged = true
  if (previousArchive && digestOfferingArchive(mergedArchive) === digestOfferingArchive(previousArchive)) {
    archiveChanged = false
    mergedArchive.generatedAt = previousArchive.generatedAt
  }

  const seriesSaleWindows: Array<{
    family: FamilyCode
    seriesId: string
    saleWindow: SaleWindow
  }> = []
  for (const [key, v] of input.saleWindowsBySeries) {
    const seriesId = key.includes('\0') ? key.split('\0')[1]! : key
    seriesSaleWindows.push({
      family: v.family,
      seriesId,
      saleWindow: { ...v.window }
    })
  }

  return {
    offeringsByFamily,
    offeringArchive: mergedArchive,
    seriesSaleWindows,
    offeringsChanged,
    archiveChanged,
    saleWindowsChanged: seriesSaleWindows.length > 0,
    archiveSkippedAlreadyTranscribed
  }
}

/** Apply series-adjacent saleWindow patches onto series records (in place copy). */
export function applySeriesSaleWindows(
  series: SeriesRecord[],
  patches: Array<{ seriesId: string; saleWindow: SaleWindow }>
): { series: SeriesRecord[]; changed: boolean } {
  const byId = new Map(patches.map((p) => [p.seriesId, p.saleWindow]))
  let changed = false
  const next = series.map((s) => {
    const window = byId.get(s.id)
    if (!window) return { ...s }
    const prev = s.saleWindow
    if (prev?.from === window.from && (prev?.to ?? null) === (window.to ?? null)) {
      return { ...s }
    }
    changed = true
    return { ...s, saleWindow: { from: window.from, to: window.to ?? null } }
  })
  return { series: next, changed }
}
