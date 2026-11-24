import { toSeriesId } from './ids.ts'
import { combineQuoteRows } from './combine.ts'
import {
  emptyNormalizedByFamily,
  FAMILIES,
  type FamilyCode,
  type NormalizedSnapshot,
  type QuoteRow,
  type SeriesRecord
} from './types.ts'

export interface SkippedWebkincstarQuote {
  family: FamilyCode
  id: string
  name: string
  settleDate: string
}

/** Bounded sample retained for Actions logs (full count is still `skippedUnmatched`). */
export const SKIPPED_UNMATCHED_SAMPLE_LIMIT = 8

export interface SkippedWebkincstarSeries {
  family: FamilyCode
  id: string
  name: string
}

export interface InventedWebkincstarSeries {
  family: FamilyCode
  id: string
  name: string
}

export interface ApplyWebkincstarResult {
  snapshot: NormalizedSnapshot
  /** Quotes remapped onto an existing catalog series id. */
  remappedQuotes: number
  /** WebKincstár rows with no matching series (soft-skipped). */
  skippedUnmatched: number
  /**
   * Sample of soft-skipped overlay identities (≤ {@link SKIPPED_UNMATCHED_SAMPLE_LIMIT});
   * length may be less than `skippedUnmatched` when the skip volume is high.
   */
  skippedUnmatchedQuotes: SkippedWebkincstarQuote[]
  /**
   * Unique soft-skipped series (family/id) for Actions step summary — not bounded
   * by {@link SKIPPED_UNMATCHED_SAMPLE_LIMIT}.
   */
  skippedUnmatchedSeries: SkippedWebkincstarSeries[]
  /**
   * Unique series stubs invented under ADR 0048 historical invent
   * (`identitySource: 'webkincstar-backfill'`).
   */
  inventedSeries: InventedWebkincstarSeries[]
  /** True when at least one remapped quote was applied. */
  hasQuotes: boolean
}

interface SeriesRef {
  family: FamilyCode
  series: SeriesRecord
}

function cloneSnapshot(snap: NormalizedSnapshot): NormalizedSnapshot {
  const byFamily = emptyNormalizedByFamily()
  for (const family of FAMILIES) {
    const src = snap.byFamily[family]
    byFamily[family] = {
      series: src.series.map((s) => ({ ...s })),
      quotes: src.quotes.map((q) => ({ id: q.id, row: [...q.row] as QuoteRow }))
    }
  }
  return { asOf: snap.asOf, byFamily }
}

function buildSeriesIndex(
  base: NormalizedSnapshot,
  extraSeries: Array<{ family: FamilyCode; series: SeriesRecord }>
): {
  byId: Map<string, SeriesRef>
  byNameSlug: Map<string, SeriesRef>
  byExactName: Map<string, SeriesRef>
} {
  const byId = new Map<string, SeriesRef>()
  const byNameSlug = new Map<string, SeriesRef>()
  const byExactName = new Map<string, SeriesRef>()

  const add = (family: FamilyCode, series: SeriesRecord): void => {
    const ref = { family, series }
    if (!byId.has(series.id)) byId.set(series.id, ref)
    if (series.name && !byExactName.has(series.name)) {
      byExactName.set(series.name, ref)
    }
    try {
      const slug = toSeriesId(series.name)
      if (!byNameSlug.has(slug)) byNameSlug.set(slug, ref)
    } catch {
      /* ignore empty names */
    }
  }

  for (const family of FAMILIES) {
    for (const series of base.byFamily[family].series) {
      add(family, series)
    }
  }
  for (const { family, series } of extraSeries) {
    add(family, series)
  }
  return { byId, byNameSlug, byExactName }
}

function resolveTarget(
  wkId: string,
  wkName: string,
  index: ReturnType<typeof buildSeriesIndex>
): SeriesRef | null {
  return (
    index.byId.get(wkId) ??
    index.byExactName.get(wkName) ??
    index.byNameSlug.get(wkId) ??
    null
  )
}

function indexQuotes(
  quotes: Array<{ id: string; row: QuoteRow }>
): Map<string, Map<string, QuoteRow>> {
  const byId = new Map<string, Map<string, QuoteRow>>()
  for (const q of quotes) {
    let byDate = byId.get(q.id)
    if (!byDate) {
      byDate = new Map()
      byId.set(q.id, byDate)
    }
    byDate.set(q.row[0], q.row)
  }
  return byId
}

function inventBackfillStub(
  _family: FamilyCode,
  qId: string,
  name: string,
  seriesMeta: SeriesRecord | undefined,
  asOf: string | null
): SeriesRecord {
  const mat = seriesMeta?.mat ?? null
  const status: SeriesRecord['status'] =
    asOf && mat && mat < asOf ? 'matured' : seriesMeta?.status === 'matured' ? 'matured' : 'delisted'
  const stub: SeriesRecord = {
    id: seriesMeta?.id ?? qId,
    isin: seriesMeta?.isin ?? null,
    name: seriesMeta?.name ?? name,
    issue: seriesMeta?.issue ?? null,
    mat,
    ccy: seriesMeta?.ccy ?? 'HUF',
    status,
    // Omit dayCount: normalize-webkincstar defaults ACT/360, which would block
    // ADR 0048 ISSUE null-fill of ACT/365F (etc.). Family default / enrich later.
    identitySource: 'webkincstar-backfill'
  }
  // Copy optional fields only when defined so JSON serialization stays valid.
  // Do not copy dayCount from WK meta (see above).
  if (seriesMeta?.face !== undefined) stub.face = seriesMeta.face
  if (seriesMeta?.iType !== undefined) stub.iType = seriesMeta.iType
  if (seriesMeta?.offered !== undefined) stub.offered = seriesMeta.offered
  if (seriesMeta?.saleWindow !== undefined) stub.saleWindow = seriesMeta.saleWindow
  if (seriesMeta?.ref !== undefined) stub.ref = seriesMeta.ref
  if (seriesMeta?.periodMonths !== undefined) stub.periodMonths = seriesMeta.periodMonths
  return stub
}

/**
 * Overlay WebKincstár quotes onto an ÁKK∥allampapir combined snapshot.
 * Prefer non-null; conflicting numerics → WebKincstár wins (ADR 0039).
 * Unmatched instrument names soft-skip by default; with `inventUnmatched`
 * (ADR 0048 historical backfill) invent marked series stubs instead.
 */
export function applyWebkincstarQuotes(
  base: NormalizedSnapshot,
  webkincstar: NormalizedSnapshot,
  options?: {
    /** Prior tip series for name→id join when not in today's combined set. */
    extraSeries?: Array<{ family: FamilyCode; series: SeriesRecord }>
    /**
     * When true (historical WK backfill), invent `webkincstar-backfill` series
     * stubs for unmatched instruments instead of soft-skipping (ADR 0048).
     */
    inventUnmatched?: boolean
  }
): ApplyWebkincstarResult {
  const out = cloneSnapshot(base)
  const inventUnmatched = options?.inventUnmatched === true
  const index = buildSeriesIndex(base, options?.extraSeries ?? [])
  const baseQuoteIndex = new Map<FamilyCode, Map<string, Map<string, QuoteRow>>>()
  for (const family of FAMILIES) {
    baseQuoteIndex.set(family, indexQuotes(out.byFamily[family].quotes))
  }

  let remappedQuotes = 0
  let skippedUnmatched = 0
  const skippedUnmatchedQuotes: SkippedWebkincstarQuote[] = []
  const skippedSeriesByKey = new Map<string, SkippedWebkincstarSeries>()
  const inventedSeriesByKey = new Map<string, InventedWebkincstarSeries>()

  const addToIndex = (family: FamilyCode, series: SeriesRecord): void => {
    const ref = { family, series }
    if (!index.byId.has(series.id)) index.byId.set(series.id, ref)
    if (series.name && !index.byExactName.has(series.name)) {
      index.byExactName.set(series.name, ref)
    }
    try {
      const slug = toSeriesId(series.name)
      if (!index.byNameSlug.has(slug)) index.byNameSlug.set(slug, ref)
    } catch {
      /* ignore empty names */
    }
  }

  for (const family of FAMILIES) {
    const wk = webkincstar.byFamily[family]
    for (const q of wk.quotes) {
      const seriesMeta = wk.series.find((s) => s.id === q.id)
      const name = seriesMeta?.name ?? q.id
      let target = resolveTarget(q.id, name, index)
      if (!target) {
        if (!inventUnmatched) {
          skippedUnmatched += 1
          const seriesKey = `${family}\0${q.id}`
          if (!skippedSeriesByKey.has(seriesKey)) {
            skippedSeriesByKey.set(seriesKey, { family, id: q.id, name })
          }
          if (skippedUnmatchedQuotes.length < SKIPPED_UNMATCHED_SAMPLE_LIMIT) {
            skippedUnmatchedQuotes.push({
              family,
              id: q.id,
              name,
              settleDate: q.row[0]
            })
          }
          continue
        }
        const stub = inventBackfillStub(family, q.id, name, seriesMeta, out.asOf ?? webkincstar.asOf)
        out.byFamily[family].series.push(stub)
        addToIndex(family, stub)
        const inventKey = `${family}\0${stub.id}`
        if (!inventedSeriesByKey.has(inventKey)) {
          inventedSeriesByKey.set(inventKey, { family, id: stub.id, name: stub.name })
        }
        target = { family, series: stub }
      }
      const famQuotes = baseQuoteIndex.get(target.family)!
      let byDate = famQuotes.get(target.series.id)
      if (!byDate) {
        byDate = new Map()
        famQuotes.set(target.series.id, byDate)
      }
      const existing = byDate.get(q.row[0])
      // Reuse combineQuoteRows with (existing, webkincstar) so WK wins conflicts.
      const merged = combineQuoteRows(existing, q.row)
      byDate.set(q.row[0], merged)
      remappedQuotes += 1
    }
  }

  // Rebuild quote arrays from maps.
  for (const family of FAMILIES) {
    const famMap = baseQuoteIndex.get(family)!
    const quotes: Array<{ id: string; row: QuoteRow }> = []
    for (const [id, byDate] of famMap) {
      for (const row of byDate.values()) {
        quotes.push({ id, row: [...row] as QuoteRow })
      }
    }
    quotes.sort((a, b) => a.id.localeCompare(b.id) || a.row[0].localeCompare(b.row[0]))
    out.byFamily[family].quotes = quotes
  }

  if (webkincstar.asOf && (!out.asOf || webkincstar.asOf > out.asOf)) {
    out.asOf = webkincstar.asOf
  }

  return {
    snapshot: out,
    remappedQuotes,
    skippedUnmatched,
    skippedUnmatchedQuotes,
    skippedUnmatchedSeries: [...skippedSeriesByKey.values()],
    inventedSeries: [...inventedSeriesByKey.values()],
    hasQuotes: remappedQuotes > 0
  }
}
