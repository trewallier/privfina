import {
  FAMILIES,
  REQUIRED_FAMILIES,
  emptyNormalizedByFamily,
  type FamilyCode,
  type NormalizedSnapshot,
  type QuoteRow,
  type SeriesRecord
} from './types.ts'

export class CombineError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CombineError'
  }
}

function preferSeries(akk: SeriesRecord | undefined, ap: SeriesRecord | undefined): SeriesRecord {
  if (akk && ap) {
    const merged: SeriesRecord = {
      ...ap,
      ...akk,
      // Fill nullish ÁKK identity gaps from allampapir.
      isin: akk.isin ?? ap.isin,
      name: akk.name || ap.name,
      issue: akk.issue ?? ap.issue,
      mat: akk.mat ?? ap.mat,
      ccy: akk.ccy ?? ap.ccy,
      status: 'active'
    }
    if (akk.face == null && ap.face != null) merged.face = ap.face
    if (akk.iType == null && ap.iType != null) merged.iType = ap.iType
    if ((akk.prem == null || akk.prem === 0) && ap.prem != null) merged.prem = ap.prem
    if (akk.ref == null && ap.ref != null) merged.ref = ap.ref
    return merged
  }
  if (akk) return { ...akk, status: 'active' }
  if (ap) return { ...ap, status: 'active' }
  throw new CombineError('preferSeries called with no records')
}

/**
 * Same-day quote combine: prefer non-null; if both non-null and differ, prefer allampapir
 * for bid/ask/by/ay/ai (treasury retail). Date column must match.
 */
export function combineQuoteRows(akk: QuoteRow | undefined, ap: QuoteRow | undefined): QuoteRow {
  if (akk && ap) {
    if (akk[0] !== ap[0]) {
      throw new CombineError(`Quote date mismatch ${akk[0]} vs ${ap[0]}`)
    }
    const out: QuoteRow = [akk[0], null, null, null, null, null]
    for (let i = 1; i < 6; i++) {
      const a = akk[i]
      const p = ap[i]
      if (a != null && p != null && !Object.is(a, p)) {
        out[i] = p
      } else {
        out[i] = p ?? a ?? null
      }
    }
    return out
  }
  if (ap) return [...ap] as QuoteRow
  if (akk) return [...akk] as QuoteRow
  throw new CombineError('combineQuoteRows called with no rows')
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
    const prev = byDate.get(q.row[0])
    if (prev && !quoteEqual(prev, q.row)) {
      // Within a single source, last write wins only if identical; else fail.
      throw new CombineError(`Duplicate conflicting quote for ${q.id} on ${q.row[0]} within one source`)
    }
    byDate.set(q.row[0], q.row)
  }
  return byId
}

function quoteEqual(a: QuoteRow, b: QuoteRow): boolean {
  return a.length === b.length && a.every((v, i) => Object.is(v, b[i]))
}

function indexSeries(series: SeriesRecord[]): Map<string, SeriesRecord> {
  const map = new Map<string, SeriesRecord>()
  for (const s of series) map.set(s.id, s)
  return map
}

/**
 * Combine ÁKK + allampapir normalized snapshots before mergeSnapshot.
 * Required families must be non-empty after combine.
 */
export function combineSnapshots(
  akk: NormalizedSnapshot,
  allampapir: NormalizedSnapshot
): NormalizedSnapshot {
  const byFamily = emptyNormalizedByFamily()
  let asOf: string | null = null
  if (akk.asOf && allampapir.asOf) {
    asOf = akk.asOf >= allampapir.asOf ? akk.asOf : allampapir.asOf
  } else {
    asOf = akk.asOf ?? allampapir.asOf
  }

  for (const family of FAMILIES) {
    const akkSeries = indexSeries(akk.byFamily[family]?.series ?? [])
    const apSeries = indexSeries(allampapir.byFamily[family]?.series ?? [])
    const akkQuotes = indexQuotes(akk.byFamily[family]?.quotes ?? [])
    const apQuotes = indexQuotes(allampapir.byFamily[family]?.quotes ?? [])

    const ids = new Set<string>([
      ...akkSeries.keys(),
      ...apSeries.keys(),
      ...akkQuotes.keys(),
      ...apQuotes.keys()
    ])

    for (const id of ids) {
      const dates = new Set<string>([
        ...(akkQuotes.get(id)?.keys() ?? []),
        ...(apQuotes.get(id)?.keys() ?? [])
      ])
      for (const d of dates) {
        const row = combineQuoteRows(akkQuotes.get(id)?.get(d), apQuotes.get(id)?.get(d))
        byFamily[family].quotes.push({ id, row })
        if (!asOf || row[0] > asOf) asOf = row[0]
      }
      if (dates.size > 0 || akkSeries.has(id) || apSeries.has(id)) {
        byFamily[family].series.push(preferSeries(akkSeries.get(id), apSeries.get(id)))
      }
    }

    byFamily[family].series.sort((a, b) => a.id.localeCompare(b.id))
    byFamily[family].quotes.sort((a, b) => a.id.localeCompare(b.id) || a.row[0].localeCompare(b.row[0]))
  }

  for (const family of REQUIRED_FAMILIES) {
    if (byFamily[family].quotes.length === 0) {
      throw new CombineError(`Required family ${family} has zero quotes after combine`)
    }
  }

  // ÁKK historically required catalog join; allampapir-only ids may lack isin — OK.
  // Combined quotes for required families that lack any series row fail.
  for (const family of FAMILIES as readonly FamilyCode[]) {
    const seriesIds = new Set(byFamily[family].series.map((s) => s.id))
    for (const q of byFamily[family].quotes) {
      if (!seriesIds.has(q.id)) {
        throw new CombineError(`Combined quote ${family}/${q.id} missing series metadata`)
      }
    }
  }

  return { asOf, byFamily }
}
