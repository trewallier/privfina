import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { AKK_XPOSE3_BASE } from './fetch-akk.ts'
import { formatFetchError, logFetchAttemptFailure } from './fetch-errors.ts'
import { shiftIsoDate } from './fetch-webkincstar.ts'
import {
  advanceListingDiscovery,
  bootstrapListingEndBoundFromTip,
  readListingDiscoveryState
} from './offering-listing-discovery.ts'
import {
  OFFERING_FAMILIES,
  OFFERING_LABEL_BY_FAMILY,
  type OfferingFamilyCode
} from './offering-families.ts'
import type {
  AkkEnvelope,
  OfferingArchiveFile,
  OfferingListingDiscoveryState
} from './types.ts'

export interface PublicOfferingsUrlOptions {
  /**
   * Inclusive upper bound on TAP sale-window end (`ptsEnd`) or auction date
   * (`auctionEnd`). Used for historical listing pages (ADR 0041 §6m).
   */
  endBoundIso?: string
}

export interface FetchAkkOfferingsOptions {
  rawDir: string
  fetchImpl?: typeof fetch
  retries?: number
  backoffMs?: number
  /**
   * Offline fixtures keyed by offering family code (tests).
   * When set, skips live network for those families (tip-only; no live backfill).
   */
  envelopesByFamily?: Partial<Record<OfferingFamilyCode, AkkEnvelope>>
  /**
   * Optional offline backfill envelopes (tests). Live runs ignore this and
   * fetch a second page when a discovery endBound is available.
   */
  backfillEnvelopesByFamily?: Partial<Record<OfferingFamilyCode, AkkEnvelope>>
  /** Restrict to a subset of families (default: all OFFERING_FAMILIES). */
  families?: readonly OfferingFamilyCode[]
  /**
   * Tip offering-archive used for per-family listing discovery cursors.
   * When a family is not exhausted, a second listing GET uses ptsEnd/auctionEnd.
   */
  offeringArchive?: OfferingArchiveFile | null
  /** Skip historical backfill listing GETs (tip only). */
  skipBackfillListings?: boolean
}

/** Why a family did or did not include a historical listing page. */
export type OfferingBackfillListingStatus =
  | 'merged'
  | 'exhausted'
  | 'no_cursor'
  | 'soft_failed'
  | 'skipped'

export interface FetchAkkOfferingsFamilyResult {
  family: OfferingFamilyCode
  /** Tip∪backfill union (tip wins on path UUID). Used for normalize/merge. */
  envelope: AkkEnvelope
  /** Tip listing page alone (for tip-vs-backfill Actions stats). */
  tipEnvelope: AkkEnvelope
  /** Backfill listing page alone when fetched; otherwise null. */
  backfillEnvelope: AkkEnvelope | null
  url: string
  /** True when a backfill listing page was merged into `envelope`. */
  backfillMerged: boolean
  /** Distinguishes merged / exhausted / no cursor / soft-fail / offline skip. */
  backfillStatus: OfferingBackfillListingStatus
  backfillUrl: string | null
  /** Inclusive endBound used for this run's backfill GET (null when skipped). */
  listingEndBoundUsed: string | null
  /**
   * Proposed listingDiscovery state to persist after this run.
   * Null when discovery was skipped (offline) without a prior cursor.
   */
  listingDiscoveryNext: OfferingListingDiscoveryState | null
}

export interface FetchAkkOfferingsResult {
  byFamily: FetchAkkOfferingsFamilyResult[]
  failures: Array<{ family: OfferingFamilyCode; error: unknown }>
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Inclusive end-bound date one day before a published/filter date.
 * Kept for unit tests and call sites that still shift a day.
 */
export function offeringListingEndBoundBeforeFrontier(frontierPublished: string): string {
  const day = frontierPublished.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw new Error(`Invalid frontier published date: ${frontierPublished}`)
  }
  return shiftIsoDate(day, -1)
}

export function buildPublicOfferingsUrl(
  family: OfferingFamilyCode,
  base = AKK_XPOSE3_BASE,
  options?: PublicOfferingsUrlOptions
): string {
  const cfg = OFFERING_LABEL_BY_FAMILY[family]
  const params = new URLSearchParams()
  params.set('query', 'getPublicOfferings')
  params.set('label', cfg.label)
  params.set('top', '50')
  params.set('orderField', 'published')
  params.set('orderDirection', 'DESC')
  if (cfg.mode === 'auction') {
    params.set('auctionStart', '1900-01-01')
    params.set('auctionType', 'ISSUE')
    if (options?.endBoundIso) {
      params.set('auctionEnd', options.endBoundIso.slice(0, 10))
    }
  } else {
    params.set('ptsStart', '1900-01-01')
    if (options?.endBoundIso) {
      params.set('ptsEnd', options.endBoundIso.slice(0, 10))
    }
  }
  return `${base}?${params.toString()}`
}

/**
 * Merge tip + backfill listing envelopes by path UUID (tip rows win on conflict).
 * Exported for unit tests.
 */
export function unionOfferingEnvelopeData(
  tip: AkkEnvelope,
  backfill: AkkEnvelope | null | undefined
): AkkEnvelope {
  if (!backfill?.data?.length) {
    return tip
  }
  const seen = new Set<string>()
  const data: unknown[] = []
  const pushRow = (row: unknown) => {
    if (!row || typeof row !== 'object') {
      data.push(row)
      return
    }
    const rec = row as Record<string, unknown>
    const path = typeof rec.path === 'string' ? rec.path : ''
    const pathId = typeof rec.pathId === 'string' ? rec.pathId : ''
    // Prefer path UUID segment; fall back to pathId.
    const uuidMatch = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(
      path
    )
    const key = (uuidMatch?.[1] ?? pathId).toLowerCase()
    if (key) {
      if (seen.has(key)) return
      seen.add(key)
    }
    data.push(row)
  }
  for (const row of tip.data ?? []) pushRow(row)
  for (const row of backfill.data ?? []) pushRow(row)
  return {
    ...tip,
    data,
    meta: tip.meta ?? backfill.meta
  }
}

async function getJson(
  url: string,
  fetchImpl: typeof fetch,
  retries: number,
  backoffMs: number,
  label: string
): Promise<AkkEnvelope> {
  let lastError: unknown
  for (let attempt = 1; attempt <= retries; attempt++) {
    const started = Date.now()
    let httpStatus: number | undefined
    try {
      const res = await fetchImpl(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate'
        }
      })
      if (!res.ok) {
        httpStatus = res.status
        throw new Error(`HTTP ${res.status} ${res.statusText || ''}`.trim() + ` for ${url}`)
      }
      const body = (await res.json()) as AkkEnvelope
      const status = body.meta?.status
      if (status && status !== 'OK') {
        httpStatus = res.status
        throw new Error(`ÁKK meta.status=${status} message=${body.meta?.message ?? ''} url=${url}`)
      }
      if (!Array.isArray(body.data)) {
        httpStatus = res.status
        throw new Error(`ÁKK response missing data[] for ${url}`)
      }
      return body
    } catch (err) {
      lastError = err
      logFetchAttemptFailure({
        label,
        attempt,
        retries,
        elapsedMs: Date.now() - started,
        err,
        httpStatus,
        url
      })
      if (attempt < retries) {
        await sleep(backoffMs * attempt)
      }
    }
  }
  throw new Error(
    `ÁKK offerings fetch failed after ${retries} attempt(s): ${formatFetchError(lastError)}`
  )
}

/**
 * Resolve the inclusive endBound for this run's backfill GET, if any.
 * Prefers the persisted cursor; otherwise bootstraps from the tip page.
 */
function resolveBackfillEndBound(
  family: OfferingFamilyCode,
  tipEnvelope: AkkEnvelope,
  archive: OfferingArchiveFile | null | undefined,
  skipBackfill: boolean
): {
  endBound: string | null
  status: OfferingBackfillListingStatus | null
  prior: OfferingListingDiscoveryState | null
} {
  if (skipBackfill) {
    return { endBound: null, status: 'skipped', prior: null }
  }
  const prior = readListingDiscoveryState(archive, family)
  if (prior?.exhausted) {
    return { endBound: null, status: 'exhausted', prior }
  }
  if (prior) {
    return { endBound: prior.endBound, status: null, prior }
  }
  const boot = bootstrapListingEndBoundFromTip(family, tipEnvelope)
  if (!boot) {
    return { endBound: null, status: 'no_cursor', prior: null }
  }
  return { endBound: boot, status: null, prior: null }
}

/**
 * Fetch getPublicOfferings per in-scope family (ADR 0041).
 * Tip listing (top=50 newest) always; when the listing discovery cursor is not
 * exhausted, also fetch a backfill page with ptsEnd/auctionEnd and union by
 * path UUID. Advances the per-family cursor past each queried page.
 * Isolates failures per family so one bad label does not discard siblings.
 */
export async function fetchAkkOfferingListings(
  options: FetchAkkOfferingsOptions
): Promise<FetchAkkOfferingsResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const retries = options.retries ?? 3
  const backoffMs = options.backoffMs ?? 500
  const families = options.families ?? OFFERING_FAMILIES
  await mkdir(options.rawDir, { recursive: true })

  const byFamily: FetchAkkOfferingsFamilyResult[] = []
  const failures: Array<{ family: OfferingFamilyCode; error: unknown }> = []

  for (const family of families) {
    const tipUrl = buildPublicOfferingsUrl(family)
    try {
      let tipEnvelope = options.envelopesByFamily?.[family]
      if (!tipEnvelope) {
        tipEnvelope = await getJson(tipUrl, fetchImpl, retries, backoffMs, `akk-offerings:${family}`)
      }

      const resolved = resolveBackfillEndBound(
        family,
        tipEnvelope,
        options.offeringArchive,
        Boolean(options.skipBackfillListings)
      )

      let backfillUrl: string | null = null
      let backfillEnvelope: AkkEnvelope | null = null
      let backfillStatus: OfferingBackfillListingStatus = resolved.status ?? 'no_cursor'
      let listingEndBoundUsed: string | null = null
      let listingDiscoveryNext: OfferingListingDiscoveryState | null = resolved.prior

      if (resolved.endBound) {
        listingEndBoundUsed = resolved.endBound
        backfillUrl = buildPublicOfferingsUrl(family, AKK_XPOSE3_BASE, {
          endBoundIso: resolved.endBound
        })
        if (options.backfillEnvelopesByFamily?.[family]) {
          backfillEnvelope = options.backfillEnvelopesByFamily[family]!
          backfillStatus = 'merged'
        } else if (!options.envelopesByFamily?.[family]) {
          // Live tip → also attempt live backfill. Offline tip fixtures alone
          // skip network backfill unless an explicit backfill fixture is supplied.
          try {
            backfillEnvelope = await getJson(
              backfillUrl,
              fetchImpl,
              retries,
              backoffMs,
              `akk-offerings-backfill:${family}`
            )
            backfillStatus = 'merged'
          } catch (backfillErr) {
            // Soft: tip listing still usable; log and continue without backfill page.
            console.error(
              `[market-data] offerings backfill listing soft-fail: ${family}: ${
                backfillErr instanceof Error ? backfillErr.message : String(backfillErr)
              }`
            )
            backfillEnvelope = null
            backfillUrl = null
            backfillStatus = 'soft_failed'
            // Keep prior cursor so the next run retries the same endBound.
            listingDiscoveryNext = resolved.prior ?? {
              endBound: resolved.endBound,
              exhausted: false
            }
          }
        } else {
          // Offline tip-only: no backfill page.
          backfillUrl = null
          listingEndBoundUsed = null
          backfillStatus = 'skipped'
        }

        if (backfillEnvelope) {
          const advanced = advanceListingDiscovery({
            family,
            endBoundUsed: resolved.endBound,
            backfillEnvelope
          })
          listingDiscoveryNext = advanced.next
          if (advanced.reason !== 'advanced' && advanced.next.exhausted) {
            console.error(
              `[market-data] offerings listing discovery exhausted: ${family} @ ${advanced.next.endBound} (${advanced.reason})`
            )
          }
        }
      } else if (resolved.status === 'exhausted' && resolved.prior) {
        listingDiscoveryNext = resolved.prior
      }

      const envelope = unionOfferingEnvelopeData(tipEnvelope, backfillEnvelope)
      const rawPath = path.join(options.rawDir, `getPublicOfferings_${family}.json`)
      await writeFile(rawPath, `${JSON.stringify(envelope, null, 2)}\n`, 'utf8')
      if (backfillEnvelope) {
        const backfillPath = path.join(
          options.rawDir,
          `getPublicOfferings_${family}_backfill.json`
        )
        await writeFile(backfillPath, `${JSON.stringify(backfillEnvelope, null, 2)}\n`, 'utf8')
      }
      byFamily.push({
        family,
        envelope,
        tipEnvelope,
        backfillEnvelope,
        url: tipUrl,
        backfillMerged: Boolean(backfillEnvelope),
        backfillStatus,
        backfillUrl,
        listingEndBoundUsed,
        listingDiscoveryNext
      })
    } catch (error) {
      failures.push({ family, error })
    }
  }

  return { byFamily, failures }
}
