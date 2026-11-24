import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { AKK_XPOSE3_BASE } from './fetch-akk.ts'
import { formatFetchError, logFetchAttemptFailure } from './fetch-errors.ts'
import { shiftIsoDate } from './fetch-webkincstar.ts'
import { contiguousOfferingSuccessFrontierPublished } from './offering-archive-frontier.ts'
import {
  OFFERING_FAMILIES,
  OFFERING_LABEL_BY_FAMILY,
  type OfferingFamilyCode
} from './offering-families.ts'
import type { AkkEnvelope, OfferingArchiveFile } from './types.ts'

export interface PublicOfferingsUrlOptions {
  /**
   * Inclusive upper bound on TAP sale-window end (`ptsEnd`) or auction date
   * (`auctionEnd`). Used for historical listing pages older than the archive
   * contiguous tip success frontier (ADR 0041 §6m follow-on).
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
   * fetch a second page when a frontier exists.
   */
  backfillEnvelopesByFamily?: Partial<Record<OfferingFamilyCode, AkkEnvelope>>
  /** Restrict to a subset of families (default: all OFFERING_FAMILIES). */
  families?: readonly OfferingFamilyCode[]
  /**
   * Tip offering-archive used to compute per-family contiguous success frontiers.
   * When a family has a frontier, a second listing GET uses endBound = frontier−1 day.
   */
  offeringArchive?: OfferingArchiveFile | null
  /** Skip historical backfill listing GETs (tip only). */
  skipBackfillListings?: boolean
}

export interface FetchAkkOfferingsFamilyResult {
  family: OfferingFamilyCode
  envelope: AkkEnvelope
  url: string
  /** True when a backfill listing page was merged into `envelope`. */
  backfillMerged: boolean
  backfillUrl: string | null
  frontierPublished: string | null
}

export interface FetchAkkOfferingsResult {
  byFamily: FetchAkkOfferingsFamilyResult[]
  failures: Array<{ family: OfferingFamilyCode; error: unknown }>
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Inclusive end-bound date for the listing page older than the frontier. */
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
 * Fetch getPublicOfferings per in-scope family (ADR 0041).
 * Tip listing (top=50 newest) always; when the tip archive has a contiguous
 * success frontier for the family, also fetch a backfill page with
 * ptsEnd/auctionEnd = frontier−1 day and union by path UUID.
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

      const frontier = options.skipBackfillListings
        ? null
        : contiguousOfferingSuccessFrontierPublished(
            options.offeringArchive?.documents,
            family
          )

      let backfillUrl: string | null = null
      let backfillEnvelope: AkkEnvelope | null = null
      if (frontier) {
        const endBound = offeringListingEndBoundBeforeFrontier(frontier)
        backfillUrl = buildPublicOfferingsUrl(family, AKK_XPOSE3_BASE, {
          endBoundIso: endBound
        })
        if (options.backfillEnvelopesByFamily?.[family]) {
          backfillEnvelope = options.backfillEnvelopesByFamily[family]!
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
          } catch (backfillErr) {
            // Soft: tip listing still usable; log and continue without backfill page.
            console.error(
              `[market-data] offerings backfill listing soft-fail: ${family}: ${
                backfillErr instanceof Error ? backfillErr.message : String(backfillErr)
              }`
            )
            backfillEnvelope = null
            backfillUrl = null
          }
        } else {
          // Offline tip-only: no backfill page.
          backfillUrl = null
        }
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
        url: tipUrl,
        backfillMerged: Boolean(backfillEnvelope),
        backfillUrl,
        frontierPublished: frontier
      })
    } catch (error) {
      failures.push({ family, error })
    }
  }

  return { byFamily, failures }
}
