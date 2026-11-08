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

export interface ApplyWebkincstarResult {
  snapshot: NormalizedSnapshot
  /** Quotes remapped onto an existing catalog series id. */
  remappedQuotes: number
  /** WebKincstár rows with no matching series (soft-skipped). */
  skippedUnmatched: number
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

/**
 * Overlay WebKincstár quotes onto an ÁKK∥allampapir combined snapshot.
 * Prefer non-null; conflicting numerics → WebKincstár wins (ADR 0039).
 * Unmatched instrument names are soft-skipped (ÁKK remains identity owner).
 */
export function applyWebkincstarQuotes(
  base: NormalizedSnapshot,
  webkincstar: NormalizedSnapshot,
  options?: {
    /** Prior tip series for name→id join when not in today's combined set. */
    extraSeries?: Array<{ family: FamilyCode; series: SeriesRecord }>
  }
): ApplyWebkincstarResult {
  const out = cloneSnapshot(base)
  const index = buildSeriesIndex(base, options?.extraSeries ?? [])
  const baseQuoteIndex = new Map<FamilyCode, Map<string, Map<string, QuoteRow>>>()
  for (const family of FAMILIES) {
    baseQuoteIndex.set(family, indexQuotes(out.byFamily[family].quotes))
  }

  let remappedQuotes = 0
  let skippedUnmatched = 0

  for (const family of FAMILIES) {
    const wk = webkincstar.byFamily[family]
    for (const q of wk.quotes) {
      const seriesMeta = wk.series.find((s) => s.id === q.id)
      const name = seriesMeta?.name ?? q.id
      const target = resolveTarget(q.id, name, index)
      if (!target) {
        skippedUnmatched += 1
        continue
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
    hasQuotes: remappedQuotes > 0
  }
}
