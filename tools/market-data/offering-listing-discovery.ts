/**
 * Per-family historical listing discovery cursor (ADR 0041 §6m).
 * Independent of the tip success frontier used for the WK historical gate.
 */
import {
  shiftIsoDate,
  WEBKINCSTAR_BACKFILL_DEFAULT_FROM
} from './fetch-webkincstar.ts'
import {
  isOfferingFamily,
  OFFERING_LABEL_BY_FAMILY,
  type OfferingFamilyCode
} from './offering-families.ts'
import type {
  AkkEnvelope,
  AkkRow,
  FamilyCode,
  OfferingArchiveFile,
  OfferingListingDiscoveryState
} from './types.ts'

/** Inclusive scrape floor — same calendar floor as WebKincstár historical. */
export const OFFERING_LISTING_DISCOVERY_FLOOR = WEBKINCSTAR_BACKFILL_DEFAULT_FROM

const ISO_DATE = /^(\d{4}-\d{2}-\d{2})/

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/** YYYY-MM-DD from ÁKK date-ish fields (`2026-07-16` or `2026-07-16 14:00:00`). */
export function listingFilterDateFromValue(value: unknown): string | null {
  const raw = asString(value)
  if (!raw) return null
  const m = ISO_DATE.exec(raw)
  return m ? m[1]! : null
}

/**
 * Date axis that matches the ÁKK listing end bound for this family:
 * auction → `auctionDate`; TAP → `endPeriod` (`ptsEnd`).
 */
export function listingFilterDateFromRow(
  family: OfferingFamilyCode,
  row: AkkRow
): string | null {
  const mode = OFFERING_LABEL_BY_FAMILY[family].mode
  if (mode === 'auction') {
    return listingFilterDateFromValue(row.auctionDate)
  }
  return listingFilterDateFromValue(row.endPeriod)
}

/** Minimum filter date across envelope rows (null when none parseable). */
export function minListingFilterDateOnEnvelope(
  family: OfferingFamilyCode,
  envelope: AkkEnvelope | null | undefined
): string | null {
  let min: string | null = null
  for (const row of envelope?.data ?? []) {
    if (!row || typeof row !== 'object') continue
    const day = listingFilterDateFromRow(family, row as AkkRow)
    if (!day) continue
    if (min == null || day < min) min = day
  }
  return min
}

export function readListingDiscoveryState(
  archive: OfferingArchiveFile | null | undefined,
  family: OfferingFamilyCode
): OfferingListingDiscoveryState | null {
  const state = archive?.listingDiscovery?.[family]
  if (!state || typeof state.endBound !== 'string') return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(state.endBound.slice(0, 10))) return null
  return {
    endBound: state.endBound.slice(0, 10),
    exhausted: Boolean(state.exhausted)
  }
}

/**
 * Bootstrap the first endBound from the tip listing page:
 * min(filterDate on tip) − 1 day. Never seeds from tip success frontier.
 *
 * Tip is ordered `published DESC` top=50 while the cursor walks the
 * sale/auction filter-date axis (`endPeriod` / `auctionDate`). A wide filter-date
 * spread on the tip page can therefore jump bootstrap deep and skip offerings
 * whose filter dates sit between tip min and max but whose `published` fell out
 * of top=50. Live tip pages for in-scope families tend to keep filter dates
 * clustered near the published window; if that changes, prefer seeding from a
 * denser listing strategy rather than “fixing” bootstrap to tip success frontier.
 */
export function bootstrapListingEndBoundFromTip(
  family: OfferingFamilyCode,
  tipEnvelope: AkkEnvelope
): string | null {
  const minOnTip = minListingFilterDateOnEnvelope(family, tipEnvelope)
  if (!minOnTip) return null
  return shiftIsoDate(minOnTip, -1)
}

export interface AdvanceListingDiscoveryInput {
  family: OfferingFamilyCode
  /** Inclusive endBound used for this backfill GET. */
  endBoundUsed: string
  /** Backfill listing page (may be empty). */
  backfillEnvelope: AkkEnvelope
}

export interface AdvanceListingDiscoveryResult {
  next: OfferingListingDiscoveryState
  /** Why the cursor moved (or stopped). */
  reason: 'advanced' | 'exhausted_empty' | 'exhausted_floor' | 'exhausted_stuck'
}

/**
 * Advance past the queried page so the same timeframe is not re-hit.
 * Empty page / floor / non-progress → exhausted.
 */
export function advanceListingDiscovery(
  input: AdvanceListingDiscoveryInput
): AdvanceListingDiscoveryResult {
  const endBoundUsed = input.endBoundUsed.slice(0, 10)
  const rows = input.backfillEnvelope.data ?? []
  if (rows.length === 0) {
    return {
      next: { endBound: endBoundUsed, exhausted: true },
      reason: 'exhausted_empty'
    }
  }

  const minOnPage = minListingFilterDateOnEnvelope(input.family, input.backfillEnvelope)
  if (!minOnPage) {
    // Page had rows but no parseable filter dates — cannot walk further safely.
    return {
      next: { endBound: endBoundUsed, exhausted: true },
      reason: 'exhausted_stuck'
    }
  }

  const nextBound = shiftIsoDate(minOnPage, -1)
  if (nextBound < OFFERING_LISTING_DISCOVERY_FLOOR) {
    return {
      next: { endBound: OFFERING_LISTING_DISCOVERY_FLOOR, exhausted: true },
      reason: 'exhausted_floor'
    }
  }
  if (nextBound >= endBoundUsed) {
    return {
      next: { endBound: endBoundUsed, exhausted: true },
      reason: 'exhausted_stuck'
    }
  }
  return {
    next: { endBound: nextBound, exhausted: false },
    reason: 'advanced'
  }
}

/** Merge per-family cursor updates into a copy of the archive map. */
export function mergeListingDiscoveryStates(
  previous: OfferingArchiveFile['listingDiscovery'] | null | undefined,
  updates: Partial<Record<OfferingFamilyCode, OfferingListingDiscoveryState>>
): OfferingArchiveFile['listingDiscovery'] {
  const out: NonNullable<OfferingArchiveFile['listingDiscovery']> = {
    ...(previous ?? {})
  }
  for (const [family, state] of Object.entries(updates) as Array<
    [OfferingFamilyCode, OfferingListingDiscoveryState]
  >) {
    out[family] = {
      endBound: state.endBound.slice(0, 10),
      exhausted: Boolean(state.exhausted)
    }
  }
  return out
}

/** Compact summary line for Actions (family=endBound or family=exhausted). */
export function formatListingDiscoverySummary(
  states: Partial<Record<OfferingFamilyCode, OfferingListingDiscoveryState>> | null | undefined,
  families: readonly OfferingFamilyCode[]
): string {
  if (!states) return '(none)'
  const parts: string[] = []
  for (const family of families) {
    const s = states[family]
    if (!s) continue
    parts.push(s.exhausted ? `${family}=exhausted@${s.endBound}` : `${family}=${s.endBound}`)
  }
  return parts.length > 0 ? parts.join(', ') : '(none)'
}

/**
 * Schema checks for `offeringArchive.listingDiscovery` (tip push validate-tree).
 * Throws Error with a stable message prefix for ValidateError wrapping.
 */
export function assertValidListingDiscoveryMap(
  listingDiscovery: unknown
): asserts listingDiscovery is NonNullable<OfferingArchiveFile['listingDiscovery']> | null | undefined {
  if (listingDiscovery == null) return
  if (typeof listingDiscovery !== 'object' || Array.isArray(listingDiscovery)) {
    throw new Error('offeringArchive.listingDiscovery must be an object when present')
  }
  for (const [family, state] of Object.entries(
    listingDiscovery as Record<string, unknown>
  )) {
    if (!isOfferingFamily(family as FamilyCode)) {
      throw new Error(`offeringArchive.listingDiscovery unknown family key ${family}`)
    }
    if (!state || typeof state !== 'object' || Array.isArray(state)) {
      throw new Error(`offeringArchive.listingDiscovery.${family} must be an object`)
    }
    const rec = state as Record<string, unknown>
    const endBound = typeof rec.endBound === 'string' ? rec.endBound.slice(0, 10) : ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(endBound)) {
      throw new Error(
        `offeringArchive.listingDiscovery.${family}.endBound must be YYYY-MM-DD`
      )
    }
    if (typeof rec.exhausted !== 'boolean') {
      throw new Error(
        `offeringArchive.listingDiscovery.${family}.exhausted must be boolean`
      )
    }
  }
}
