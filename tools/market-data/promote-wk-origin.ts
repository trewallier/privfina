/**
 * Tip cutover: promote / rename-merge WK-origin series to ÁKK-canonical ids
 * (ADR 0048 amend). Never drops quote history that exists only under the old id.
 */
import { combineQuoteRows } from './combine.ts'
import type { ResolveAkkSecurityResult } from './akk-security-resolve.ts'
import {
  COUPON_COLS,
  FAMILIES,
  QUOTE_COLS,
  SCHEMA_VERSION,
  SERIES_IDENTITY_SOURCE_AKK,
  SERIES_IDENTITY_SOURCE_WEBKINCSTAR,
  type CouponsFile,
  type FamilyCode,
  type OfferingFile,
  type QuotesFile,
  type QuoteRow,
  type SeriesRecord
} from './types.ts'
import type { MarketTreeState } from './merge.ts'

export interface PromoteWkOriginCounters {
  /** Same-id promote (null-fill + identitySource → ÁKK). */
  promotedSameId: number
  /** Rename-merge to a different canonical id. */
  renamedMerged: number
  /** Resolve miss (left as WK-origin). */
  resolveMiss: number
  /** Soft-fail / budget exhausted. */
  softFail: number
}

export interface PromoteWkOriginResult {
  tree: MarketTreeState
  counters: PromoteWkOriginCounters
  /** Old → new series id remaps applied this pass. */
  remaps: Array<{ family: FamilyCode; fromId: string; toId: string }>
}

export type PromoteResolveFn = (
  label: string,
  preferredFamily: FamilyCode
) => Promise<ResolveAkkSecurityResult>

function nullFillIdentity(prev: SeriesRecord, akk: SeriesRecord): SeriesRecord {
  const out: SeriesRecord = {
    ...prev,
    identitySource: SERIES_IDENTITY_SOURCE_AKK
  }
  if (out.isin == null && akk.isin != null) out.isin = akk.isin
  if ((!out.name || out.name === prev.id) && akk.name) out.name = akk.name
  if (out.issue == null && akk.issue != null) out.issue = akk.issue
  if (out.mat == null && akk.mat != null) out.mat = akk.mat
  if (out.ccy == null && akk.ccy != null) out.ccy = akk.ccy
  if (out.dayCount == null && akk.dayCount != null) out.dayCount = akk.dayCount
  if (out.face == null && akk.face != null) out.face = akk.face
  if (out.iType == null && akk.iType != null) out.iType = akk.iType
  if (out.ref == null && akk.ref != null) out.ref = akk.ref
  if (out.periodMonths == null && akk.periodMonths != null) out.periodMonths = akk.periodMonths
  if (akk.status) out.status = akk.status
  return out
}

/**
 * Union quote rows by settle date; when both sides have the same date, WK-side
 * (incoming/old invent) numerics win on conflict (ADR 0039) — caller passes
 * (canonicalExisting, oldWk) so the second arg wins via combineQuoteRows.
 */
export function unionQuoteFiles(
  family: FamilyCode,
  canonicalId: string,
  canonical: QuotesFile | undefined,
  old: QuotesFile | undefined
): QuotesFile {
  const byDate = new Map<string, QuoteRow>()
  for (const row of canonical?.rows ?? []) {
    byDate.set(row[0], [...row] as QuoteRow)
  }
  for (const row of old?.rows ?? []) {
    const existing = byDate.get(row[0])
    byDate.set(row[0], combineQuoteRows(existing, row))
  }
  const rows = [...byDate.values()].sort((a, b) => a[0].localeCompare(b[0]))
  return {
    schemaVersion: SCHEMA_VERSION,
    id: canonicalId,
    family,
    cols: QUOTE_COLS,
    rows
  }
}

function unionCouponFiles(
  family: FamilyCode,
  canonicalId: string,
  canonical: CouponsFile | undefined,
  old: CouponsFile | undefined
): CouponsFile | undefined {
  if (!canonical && !old) return undefined
  if (!old) {
    return canonical ? { ...canonical, id: canonicalId, family } : undefined
  }
  if (!canonical) {
    return { ...old, id: canonicalId, family, rows: old.rows.map((r) => [...r] as typeof r) }
  }
  // Prefer canonical rows; append old rows whose from/to pair is absent.
  const key = (r: readonly [string, string, number | null]) => `${r[0]}\0${r[1]}`
  const seen = new Set(canonical.rows.map(key))
  const rows = [...canonical.rows.map((r) => [...r] as typeof r)]
  for (const r of old.rows) {
    if (seen.has(key(r))) continue
    rows.push([...r] as typeof r)
  }
  rows.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]))
  return {
    schemaVersion: SCHEMA_VERSION,
    id: canonicalId,
    family,
    cols: COUPON_COLS,
    rows
  }
}

function preferOffering(
  canonical: OfferingFile | undefined,
  old: OfferingFile | undefined,
  canonicalId: string,
  family: FamilyCode
): OfferingFile | undefined {
  if (!canonical && !old) return undefined
  if (canonical) return { ...canonical, id: canonicalId, family }
  if (old) return { ...old, id: canonicalId, family }
  return undefined
}

function displayVariants(series: SeriesRecord): string[] {
  const out: string[] = []
  const push = (s: string | null | undefined) => {
    if (!s) return
    const t = s.trim()
    if (t && !out.includes(t)) out.push(t)
  }
  push(series.name)
  push(series.id)
  // Common WK short form: A270324I22 tip invent used 2027_I / 2027/I
  if (series.name.includes('_')) push(series.name.replace(/_/g, '/'))
  if (series.id.includes('_')) push(series.id.replace(/_/g, '/'))
  return out
}

/**
 * Resolve tip WK-origin series and promote in place or rename-merge to ÁKK id.
 */
export async function promoteWkOriginSeries(
  tree: MarketTreeState,
  options: { resolve: PromoteResolveFn }
): Promise<PromoteWkOriginResult> {
  const counters: PromoteWkOriginCounters = {
    promotedSameId: 0,
    renamedMerged: 0,
    resolveMiss: 0,
    softFail: 0
  }
  const remaps: Array<{ family: FamilyCode; fromId: string; toId: string }> = []

  for (const family of FAMILIES) {
    const fam = tree.families[family]
    const wkSeries = fam.series.series.filter(
      (s) => s.identitySource === SERIES_IDENTITY_SOURCE_WEBKINCSTAR
    )
    for (const series of wkSeries) {
      let resolved: ResolveAkkSecurityResult | null = null
      for (const label of displayVariants(series)) {
        const hit = await options.resolve(label, family)
        if (hit.via === 'soft_fail') {
          resolved = hit
          break
        }
        if (hit.series) {
          resolved = hit
          break
        }
        resolved = hit
      }

      if (!resolved || resolved.via === 'soft_fail') {
        counters.softFail += 1
        continue
      }
      if (!resolved.series) {
        counters.resolveMiss += 1
        continue
      }

      const akk = resolved.series
      const canonicalId = akk.id

      if (canonicalId === series.id) {
        fam.series.series = fam.series.series.map((s) =>
          s.id === series.id ? nullFillIdentity(s, akk) : s
        )
        counters.promotedSameId += 1
        continue
      }

      // Ensure canonical series exists (upsert ÁKK identity; keep prior ÁKK if present).
      const existingCanonical = fam.series.series.find((s) => s.id === canonicalId)
      if (existingCanonical) {
        fam.series.series = fam.series.series.map((s) =>
          s.id === canonicalId
            ? {
                ...nullFillIdentity(s, akk),
                // Prefer existing non-null over thin akk when already ÁKK-owned
                identitySource: SERIES_IDENTITY_SOURCE_AKK
              }
            : s
        )
      } else {
        fam.series.series.push({ ...akk, identitySource: SERIES_IDENTITY_SOURCE_AKK })
      }

      // Union quotes — old invent history must not be dropped.
      const oldQuotes = fam.quotes[series.id]
      const canQuotes = fam.quotes[canonicalId]
      fam.quotes[canonicalId] = unionQuoteFiles(family, canonicalId, canQuotes, oldQuotes)
      delete fam.quotes[series.id]

      const oldCoupons = fam.coupons[series.id]
      const canCoupons = fam.coupons[canonicalId]
      const mergedCoupons = unionCouponFiles(family, canonicalId, canCoupons, oldCoupons)
      if (mergedCoupons) fam.coupons[canonicalId] = mergedCoupons
      else if (!canCoupons && !oldCoupons) {
        /* none */
      }
      delete fam.coupons[series.id]

      const mergedOffering = preferOffering(
        fam.offerings[canonicalId],
        fam.offerings[series.id],
        canonicalId,
        family
      )
      if (mergedOffering) fam.offerings[canonicalId] = mergedOffering
      delete fam.offerings[series.id]

      // Drop old series row so write pruning does not orphan history under the old id.
      fam.series.series = fam.series.series.filter((s) => s.id !== series.id)

      // Rewrite latest map keys when present.
      if (fam.latest.quotes[series.id] != null) {
        if (fam.latest.quotes[canonicalId] == null) {
          fam.latest.quotes[canonicalId] = fam.latest.quotes[series.id]
        }
        delete fam.latest.quotes[series.id]
      }

      remaps.push({ family, fromId: series.id, toId: canonicalId })
      counters.renamedMerged += 1
    }
  }

  if (tree.offeringArchive && remaps.length > 0) {
    const byOld = new Map(remaps.map((r) => [`${r.family}\0${r.fromId}`, r.toId]))
    tree.offeringArchive = {
      ...tree.offeringArchive,
      documents: tree.offeringArchive.documents.map((doc) => {
        const next = byOld.get(`${doc.family}\0${doc.seriesId}`)
        if (!next) return doc
        return { ...doc, seriesId: next }
      })
    }
  }

  return { tree, counters, remaps }
}
