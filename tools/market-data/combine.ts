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

export interface CombineStats {
  /** Pairs joined because both sides shared a non-null ISIN (canonical id = ÁKK). */
  isinJoins: number
  /** Pairs joined because `toSeriesId` / map keys already matched. */
  idJoins: number
  /** Allampapir series with an ISIN that did not match any ÁKK ISIN (and no id match). */
  unmatchedApWithIsin: number
}

export interface CombineResult {
  snapshot: NormalizedSnapshot
  /** True when allampapir contributed at least one quote row. */
  dualSource: boolean
  stats: CombineStats
}

function preferSeries(akk: SeriesRecord | undefined, ap: SeriesRecord | undefined): SeriesRecord {
  if (akk && ap) {
    const merged: SeriesRecord = {
      ...ap,
      ...akk,
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

function indexSeriesByIsin(series: SeriesRecord[]): Map<string, string> {
  const byIsin = new Map<string, string>()
  for (const s of series) {
    const isin = s.isin?.trim()
    if (!isin) continue
    const prev = byIsin.get(isin)
    if (prev && prev !== s.id) {
      throw new CombineError(`Duplicate ISIN ${isin} for series ${prev} and ${s.id}`)
    }
    byIsin.set(isin, s.id)
  }
  return byIsin
}

/**
 * Map allampapir series ids onto ÁKK canonical ids.
 * Prefer shared ISIN when both sides have one; else identical map keys.
 */
export function buildApToCanonicalIdMap(
  akkSeries: Map<string, SeriesRecord>,
  apSeries: Map<string, SeriesRecord>
): { alias: Map<string, string>; stats: Pick<CombineStats, 'isinJoins' | 'idJoins' | 'unmatchedApWithIsin'> } {
  const akkByIsin = indexSeriesByIsin([...akkSeries.values()])
  const alias = new Map<string, string>()
  let isinJoins = 0
  let idJoins = 0
  let unmatchedApWithIsin = 0

  for (const [apId, ap] of apSeries) {
    if (akkSeries.has(apId)) {
      alias.set(apId, apId)
      idJoins += 1
      continue
    }
    const isin = ap.isin?.trim()
    if (isin && akkByIsin.has(isin)) {
      const akkId = akkByIsin.get(isin)!
      alias.set(apId, akkId)
      isinJoins += 1
      continue
    }
    if (isin) unmatchedApWithIsin += 1
    alias.set(apId, apId)
  }

  return { alias, stats: { isinJoins, idJoins, unmatchedApWithIsin } }
}

function remapQuotes(
  quotes: Map<string, Map<string, QuoteRow>>,
  alias: Map<string, string>
): Map<string, Map<string, QuoteRow>> {
  const out = new Map<string, Map<string, QuoteRow>>()
  for (const [id, byDate] of quotes) {
    const canonical = alias.get(id) ?? id
    let dest = out.get(canonical)
    if (!dest) {
      dest = new Map()
      out.set(canonical, dest)
    }
    for (const [d, row] of byDate) {
      const prev = dest.get(d)
      if (prev && !quoteEqual(prev, row)) {
        throw new CombineError(
          `Conflicting allampapir quotes after ISIN remap for ${canonical} on ${d}`
        )
      }
      dest.set(d, row)
    }
  }
  return out
}

/**
 * Combine ÁKK + allampapir normalized snapshots before mergeSnapshot.
 * Required families must be non-empty after combine.
 * Join: shared ISIN (ÁKK id wins) else identical series id from longName.
 */
export function combineSnapshots(
  akk: NormalizedSnapshot,
  allampapir: NormalizedSnapshot
): CombineResult {
  const byFamily = emptyNormalizedByFamily()
  let asOf: string | null = null
  if (akk.asOf && allampapir.asOf) {
    asOf = akk.asOf >= allampapir.asOf ? akk.asOf : allampapir.asOf
  } else {
    asOf = akk.asOf ?? allampapir.asOf
  }

  const stats: CombineStats = { isinJoins: 0, idJoins: 0, unmatchedApWithIsin: 0 }
  let dualSource = false

  for (const family of FAMILIES) {
    const akkSeries = indexSeries(akk.byFamily[family]?.series ?? [])
    const apSeries = indexSeries(allampapir.byFamily[family]?.series ?? [])
    const akkQuotes = indexQuotes(akk.byFamily[family]?.quotes ?? [])
    const apQuotesRaw = indexQuotes(allampapir.byFamily[family]?.quotes ?? [])

    if (apQuotesRaw.size > 0) dualSource = true

    const { alias, stats: familyStats } = buildApToCanonicalIdMap(akkSeries, apSeries)
    stats.isinJoins += familyStats.isinJoins
    stats.idJoins += familyStats.idJoins
    stats.unmatchedApWithIsin += familyStats.unmatchedApWithIsin

    const apQuotes = remapQuotes(apQuotesRaw, alias)
    const apSeriesRemapped = new Map<string, SeriesRecord>()
    for (const [apId, rec] of apSeries) {
      const canonical = alias.get(apId) ?? apId
      const prev = apSeriesRemapped.get(canonical)
      apSeriesRemapped.set(canonical, prev ? preferSeries(prev, rec) : { ...rec, id: canonical })
    }

    const ids = new Set<string>([
      ...akkSeries.keys(),
      ...apSeriesRemapped.keys(),
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
      if (dates.size > 0 || akkSeries.has(id) || apSeriesRemapped.has(id)) {
        const merged = preferSeries(akkSeries.get(id), apSeriesRemapped.get(id))
        byFamily[family].series.push({ ...merged, id })
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

  for (const family of FAMILIES as readonly FamilyCode[]) {
    const seriesIds = new Set(byFamily[family].series.map((s) => s.id))
    for (const q of byFamily[family].quotes) {
      if (!seriesIds.has(q.id)) {
        throw new CombineError(`Combined quote ${family}/${q.id} missing series metadata`)
      }
    }
  }

  if (stats.isinJoins > 0 || stats.unmatchedApWithIsin > 0) {
    process.stderr.write(
      `market-data combine: isinJoins=${stats.isinJoins} idJoins=${stats.idJoins} unmatchedApWithIsin=${stats.unmatchedApWithIsin}\n`
    )
  }

  return { snapshot: { asOf, byFamily }, dualSource, stats }
}
