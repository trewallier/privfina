import { digestCanonical } from './digests.ts'
import {
  FAMILIES,
  QUOTE_COLS,
  SCHEMA_VERSION,
  type FamilyCode,
  type LatestFile,
  type LatestQuote,
  type ManifestFile,
  type NormalizedSnapshot,
  type QuotesFile,
  type QuoteRow,
  type SeriesFile,
  type SeriesRecord
} from './types.ts'

export interface FamilyTreeState {
  series: SeriesFile
  latest: LatestFile
  quotes: Record<string, QuotesFile>
}

export interface MarketTreeState {
  manifest: ManifestFile | null
  families: Record<FamilyCode, FamilyTreeState>
}

export interface MergeResult {
  tree: MarketTreeState
  changed: boolean
  asOf: string | null
  appendedRows: number
  skippedDuplicates: number
}

function emptyLatest(): LatestFile {
  return { schemaVersion: SCHEMA_VERSION, asOf: null, quotes: {} }
}

function emptySeries(family: FamilyCode): SeriesFile {
  return { schemaVersion: SCHEMA_VERSION, family, series: [] }
}

function emptyQuotes(family: FamilyCode, id: string): QuotesFile {
  return { schemaVersion: SCHEMA_VERSION, id, family, cols: QUOTE_COLS, rows: [] }
}

export function emptyMarketTree(): MarketTreeState {
  return {
    manifest: null,
    families: {
      dkj: { series: emptySeries('dkj'), latest: emptyLatest(), quotes: {} },
      pmap: { series: emptySeries('pmap'), latest: emptyLatest(), quotes: {} },
      bmap: { series: emptySeries('bmap'), latest: emptyLatest(), quotes: {} }
    }
  }
}

function quoteKey(row: QuoteRow): string {
  return row[0]
}

function toLatestQuote(row: QuoteRow): LatestQuote {
  return { d: row[0], bid: row[1], ask: row[2], by: row[3], ay: row[4], ai: row[5] }
}

function seriesFingerprint(series: SeriesRecord[]): string {
  return digestCanonical(series)
}

function rebuildLatest(quotes: Record<string, QuotesFile>): LatestFile {
  const latest: LatestFile = emptyLatest()
  let maxD: string | null = null
  for (const [id, file] of Object.entries(quotes)) {
    if (file.rows.length === 0) continue
    let best = file.rows[0]
    for (const row of file.rows) {
      if (row[0] >= best[0]) best = row
    }
    latest.quotes[id] = toLatestQuote(best)
    if (!maxD || best[0] > maxD) maxD = best[0]
  }
  latest.asOf = maxD
  return latest
}

function buildManifest(tree: MarketTreeState, asOf: string | null, generatedAt: string): ManifestFile {
  const digests: Record<string, string> = {}
  const paths = {} as ManifestFile['paths']
  for (const family of FAMILIES) {
    const fam = tree.families[family]
    paths[family] = {
      series: `families/${family}/series.json`,
      latest: `families/${family}/latest.json`
    }
    digests[`families/${family}/series.json`] = digestCanonical(fam.series)
    digests[`families/${family}/latest.json`] = digestCanonical(fam.latest)
    for (const [id, q] of Object.entries(fam.quotes)) {
      digests[`families/${family}/quotes/${id}.json`] = digestCanonical(q)
    }
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    asOf,
    generatedAt,
    families: [...FAMILIES],
    paths,
    digests
  }
}

function digestsEqual(a: ManifestFile | null, b: ManifestFile): boolean {
  if (!a) return false
  const keys = new Set([...Object.keys(a.digests), ...Object.keys(b.digests)])
  for (const k of keys) {
    if (a.digests[k] !== b.digests[k]) return false
  }
  return true
}

/**
 * Merge a normalized snapshot into an existing market tree (append-first).
 * Does not rewrite historical quote rows; skips duplicate (id, d).
 */
export function mergeSnapshot(
  previous: MarketTreeState,
  snapshot: NormalizedSnapshot,
  options?: { generatedAt?: string }
): MergeResult {
  const tree: MarketTreeState = {
    manifest: previous.manifest,
    families: {
      dkj: cloneFamily(previous.families.dkj),
      pmap: cloneFamily(previous.families.pmap),
      bmap: cloneFamily(previous.families.bmap)
    }
  }

  let appendedRows = 0
  let skippedDuplicates = 0

  for (const family of FAMILIES) {
    const fam = tree.families[family]
    const incoming = snapshot.byFamily[family]

    const nextSeries = incoming.series.map((s) => ({ ...s }))
    const prevFp = seriesFingerprint(fam.series.series)
    const nextFp = seriesFingerprint(nextSeries)
    if (prevFp !== nextFp) {
      fam.series = { schemaVersion: SCHEMA_VERSION, family, series: nextSeries }
    }

    for (const q of incoming.quotes) {
      let file = fam.quotes[q.id]
      if (!file) {
        file = emptyQuotes(family, q.id)
        fam.quotes[q.id] = file
      }
      const existing = new Set(file.rows.map(quoteKey))
      if (existing.has(quoteKey(q.row))) {
        skippedDuplicates += 1
        continue
      }
      file.rows.push([...q.row] as QuoteRow)
      file.rows.sort((a, b) => a[0].localeCompare(b[0]))
      appendedRows += 1
    }

    fam.latest = rebuildLatest(fam.quotes)
  }

  const asOf = snapshot.asOf
  const generatedAt = options?.generatedAt ?? new Date().toISOString()
  const manifest = buildManifest(tree, asOf, generatedAt)
  const changed = !digestsEqual(previous.manifest, manifest)
  tree.manifest = manifest

  return { tree, changed, asOf, appendedRows, skippedDuplicates }
}

function cloneFamily(fam: FamilyTreeState): FamilyTreeState {
  return {
    series: {
      schemaVersion: fam.series.schemaVersion,
      family: fam.series.family,
      series: fam.series.series.map((s) => ({ ...s }))
    },
    latest: {
      schemaVersion: fam.latest.schemaVersion,
      asOf: fam.latest.asOf,
      quotes: Object.fromEntries(
        Object.entries(fam.latest.quotes).map(([k, v]) => [k, { ...v }])
      )
    },
    quotes: Object.fromEntries(
      Object.entries(fam.quotes).map(([id, q]) => [
        id,
        {
          schemaVersion: q.schemaVersion,
          id: q.id,
          family: q.family,
          cols: QUOTE_COLS,
          rows: q.rows.map((r) => [...r] as QuoteRow)
        }
      ])
    )
  }
}
