import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { AKK_XPOSE3_BASE } from './fetch-akk.ts'
import { formatFetchError, logFetchAttemptFailure } from './fetch-errors.ts'
import {
  OFFERING_FAMILIES,
  OFFERING_LABEL_BY_FAMILY,
  type OfferingFamilyCode
} from './offering-families.ts'
import type { AkkEnvelope } from './types.ts'

export interface FetchAkkOfferingsOptions {
  rawDir: string
  fetchImpl?: typeof fetch
  retries?: number
  backoffMs?: number
  /**
   * Offline fixtures keyed by offering family code (tests).
   * When set, skips live network for those families.
   */
  envelopesByFamily?: Partial<Record<OfferingFamilyCode, AkkEnvelope>>
  /** Restrict to a subset of families (default: all OFFERING_FAMILIES). */
  families?: readonly OfferingFamilyCode[]
}

export interface FetchAkkOfferingsFamilyResult {
  family: OfferingFamilyCode
  envelope: AkkEnvelope
  url: string
}

export interface FetchAkkOfferingsResult {
  byFamily: FetchAkkOfferingsFamilyResult[]
  failures: Array<{ family: OfferingFamilyCode; error: unknown }>
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function buildPublicOfferingsUrl(
  family: OfferingFamilyCode,
  base = AKK_XPOSE3_BASE
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
  } else {
    params.set('ptsStart', '1900-01-01')
  }
  return `${base}?${params.toString()}`
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
    const url = buildPublicOfferingsUrl(family)
    try {
      let envelope = options.envelopesByFamily?.[family]
      if (!envelope) {
        envelope = await getJson(url, fetchImpl, retries, backoffMs, `akk-offerings:${family}`)
      }
      const rawPath = path.join(options.rawDir, `getPublicOfferings_${family}.json`)
      await writeFile(rawPath, `${JSON.stringify(envelope, null, 2)}\n`, 'utf8')
      byFamily.push({ family, envelope, url })
    } catch (error) {
      failures.push({ family, error })
    }
  }

  return { byFamily, failures }
}
