/**
 * ÁKK per-label security resolve for ADR 0048 (resolve-before-invent + tip cutover).
 * Prefers the run’s bulk getSecurityWithOutstanding envelope; falls back to
 * longName= then name= GETs (capped).
 */
import { AKK_XPOSE3_BASE } from './fetch-akk.ts'
import { formatFetchError, logFetchAttemptFailure } from './fetch-errors.ts'
import { toSeriesId } from './ids.ts'
import { familyFromAkkCatalogRow, mapCatalogRow } from './normalize.ts'
import {
  SERIES_IDENTITY_SOURCE_AKK,
  type AkkEnvelope,
  type AkkRow,
  type FamilyCode,
  type SeriesRecord
} from './types.ts'

/** Hard cap on extra getSecurityWithOutstanding GETs per ingest run. */
export const MAX_AKK_SECURITY_RESOLVE_GETS_PER_RUN = 50 as const

export interface AkkCatalogResolveIndex {
  /** Exact `name` / `longName` → rows (may be multiple securityTypes). */
  byLabel: Map<string, AkkRow[]>
}

export interface AkkResolveBudget {
  /** Remaining GET allowance for this run (mutated). */
  remainingGets: number
  /** Gets consumed so far. */
  usedGets: number
}

export interface ResolveAkkSecurityOptions {
  index: AkkCatalogResolveIndex
  budget: AkkResolveBudget
  /** Prefer catalog rows whose securityType maps to this family. */
  preferredFamily?: FamilyCode
  asOf?: string | null
  fetchImpl?: typeof fetch
  baseUrl?: string
  retries?: number
  backoffMs?: number
}

export interface ResolveAkkSecurityResult {
  series: SeriesRecord | null
  /** How the row was found. */
  via: 'index' | 'longName' | 'name' | 'miss' | 'soft_fail'
  /** Raw catalog row when resolved. */
  row: AkkRow | null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const t = value.trim()
  return t.length > 0 ? t : null
}

function pushLabel(map: Map<string, AkkRow[]>, label: string | null, row: AkkRow): void {
  if (!label) return
  const list = map.get(label) ?? []
  list.push(row)
  map.set(label, list)
}

/**
 * Index bulk catalog rows by exact `name` and `longName` strings.
 */
export function buildAkkCatalogResolveIndex(catalog: AkkEnvelope): AkkCatalogResolveIndex {
  const byLabel = new Map<string, AkkRow[]>()
  for (const row of catalog.data ?? []) {
    if (!row || typeof row !== 'object') continue
    pushLabel(byLabel, asString(row.name), row)
    pushLabel(byLabel, asString(row.longName), row)
  }
  return { byLabel }
}

export function createAkkResolveBudget(
  maxGets: number = MAX_AKK_SECURITY_RESOLVE_GETS_PER_RUN
): AkkResolveBudget {
  return { remainingGets: maxGets, usedGets: 0 }
}

/**
 * Canonical series id from an ÁKK catalog row (longName preferred).
 */
export function canonicalSeriesIdFromAkkRow(row: AkkRow): string | null {
  const label = asString(row.longName) ?? asString(row.name)
  if (!label) return null
  try {
    return toSeriesId(label)
  } catch {
    return null
  }
}

function pickRow(rows: AkkRow[], preferredFamily?: FamilyCode): AkkRow | null {
  if (rows.length === 0) return null
  if (preferredFamily) {
    const match = rows.find((r) => familyFromAkkCatalogRow(r) === preferredFamily)
    if (match) return match
  }
  return rows[0] ?? null
}

function lookupIndex(
  index: AkkCatalogResolveIndex,
  label: string,
  preferredFamily?: FamilyCode
): AkkRow | null {
  const direct = index.byLabel.get(label)
  if (direct?.length) return pickRow(direct, preferredFamily)
  // Also try slug form as label key when callers pass an id.
  try {
    const slug = toSeriesId(label)
    if (slug !== label) {
      const bySlug = index.byLabel.get(slug)
      if (bySlug?.length) return pickRow(bySlug, preferredFamily)
    }
  } catch {
    /* ignore */
  }
  return null
}

function toAkkOwnedSeries(row: AkkRow, asOf: string | null | undefined): SeriesRecord | null {
  const mapped = mapCatalogRow(row, asOf ?? null)
  if (!mapped) return null
  return { ...mapped, identitySource: SERIES_IDENTITY_SOURCE_AKK }
}

export function buildSecurityResolveUrl(
  params: { longName?: string; name?: string },
  base = AKK_XPOSE3_BASE
): string {
  const q = new URLSearchParams()
  q.set('query', 'getSecurityWithOutstanding')
  if (params.longName) q.set('longName', params.longName)
  if (params.name) q.set('name', params.name)
  return `${base}?${q.toString()}`
}

async function fetchSecurityEnvelope(
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
        throw new Error(
          `ÁKK meta.status=${status} message=${body.meta?.message ?? ''} url=${url}`
        )
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
      if (attempt < retries) await sleep(backoffMs * attempt)
    }
  }
  throw new Error(
    `ÁKK security resolve failed after ${retries} attempt(s): ${formatFetchError(lastError)}`
  )
}

/**
 * Resolve a WK / tip display label to an ÁKK-owned SeriesRecord.
 * Order: bulk index → longName GET → name GET.
 */
export async function resolveAkkSecurityByLabel(
  label: string,
  options: ResolveAkkSecurityOptions
): Promise<ResolveAkkSecurityResult> {
  const trimmed = label.trim()
  if (!trimmed) {
    return { series: null, via: 'miss', row: null }
  }
  const asOf = options.asOf ?? null
  const indexed = lookupIndex(options.index, trimmed, options.preferredFamily)
  if (indexed) {
    const series = toAkkOwnedSeries(indexed, asOf)
    if (series) return { series, via: 'index', row: indexed }
  }

  const fetchImpl = options.fetchImpl ?? fetch
  const retries = options.retries ?? 2
  const backoffMs = options.backoffMs ?? 400
  const base = options.baseUrl ?? AKK_XPOSE3_BASE

  const tryGet = async (
    param: 'longName' | 'name',
    via: 'longName' | 'name'
  ): Promise<ResolveAkkSecurityResult | null> => {
    if (options.budget.remainingGets <= 0) return null
    options.budget.remainingGets -= 1
    options.budget.usedGets += 1
    const url =
      param === 'longName'
        ? buildSecurityResolveUrl({ longName: trimmed }, base)
        : buildSecurityResolveUrl({ name: trimmed }, base)
    try {
      const envelope = await fetchSecurityEnvelope(
        url,
        fetchImpl,
        retries,
        backoffMs,
        `akk-resolve:${param}:${trimmed}`
      )
      const row = pickRow(envelope.data ?? [], options.preferredFamily)
      if (!row) return { series: null, via: 'miss', row: null }
      // Cache into index for later labels in this run.
      pushLabel(options.index.byLabel, asString(row.name), row)
      pushLabel(options.index.byLabel, asString(row.longName), row)
      const series = toAkkOwnedSeries(row, asOf)
      if (!series) return { series: null, via: 'miss', row }
      return { series, via, row }
    } catch (err) {
      console.error(
        `[market-data] ÁKK security resolve soft-fail (${param}=${trimmed}): ${
          err instanceof Error ? err.message : String(err)
        }`
      )
      return { series: null, via: 'soft_fail', row: null }
    }
  }

  const longHit = await tryGet('longName', 'longName')
  if (longHit?.series) return longHit
  if (longHit?.via === 'soft_fail') return longHit

  const nameHit = await tryGet('name', 'name')
  if (nameHit) return nameHit

  return { series: null, via: 'miss', row: null }
}
