import { assertSeriesId } from './ids.ts'
import { digestCanonical } from './digests.ts'
import {
  FAMILIES,
  QUOTE_COLS,
  REQUIRED_FAMILIES,
  RETAIL_INTEREST_REF_PATH,
  SCHEMA_VERSION,
  type FamilyCode,
  type LatestFile,
  type LatestQuote,
  type ManifestFile,
  type NormalizedSnapshot,
  type QuotesFile,
  type QuoteRow,
  type RetailInterestFile,
  type SeriesFile,
  type SeriesRecord,
  type SeriesStatus
} from './types.ts'

export class MergeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MergeError'
  }
}

export interface FamilyTreeState {
  series: SeriesFile
  latest: LatestFile
  quotes: Record<string, QuotesFile>
}

export interface MarketTreeState {
  manifest: ManifestFile | null
  families: Record<FamilyCode, FamilyTreeState>
  /** Lakossági kamatok refs (ADR 0036); null when never ingested. */
  retailInterest: RetailInterestFile | null
}

export interface MergeResult {
  tree: MarketTreeState
  changed: boolean
  asOf: string | null
  appendedRows: number
  skippedDuplicates: number
  /** Same-day rows replaced when `allowSameDayRewrite` (dual-source cutover). */
  rewrittenRows: number
}

function emptyLatest(): LatestFile {
  return { schemaVersion: SCHEMA_VERSION, asOf: null, quotes: {} }
}

function emptySeries(family: FamilyCode): SeriesFile {
  return { schemaVersion: SCHEMA_VERSION, family, series: [] }
}

function emptyQuotes(family: FamilyCode, id: string): QuotesFile {
  assertSeriesId(id)
  return { schemaVersion: SCHEMA_VERSION, id, family, cols: QUOTE_COLS, rows: [] }
}

export function emptyMarketTree(): MarketTreeState {
  const families = {} as Record<FamilyCode, FamilyTreeState>
  for (const family of FAMILIES) {
    families[family] = {
      series: emptySeries(family),
      latest: emptyLatest(),
      quotes: {}
    }
  }
  return { manifest: null, families, retailInterest: null }
}

function quoteRowsEqual(a: QuoteRow, b: QuoteRow): boolean {
  return a.length === b.length && a.every((v, i) => Object.is(v, b[i]))
}

function toLatestQuote(row: QuoteRow): LatestQuote {
  return { d: row[0], bid: row[1], ask: row[2], by: row[3], ay: row[4], ai: row[5] }
}

function resolveStatus(
  rec: SeriesRecord,
  quoted: boolean,
  asOf: string | null
): SeriesStatus {
  if (quoted) return 'active'
  if (asOf && rec.mat && rec.mat < asOf) return 'matured'
  return 'delisted'
}

/**
 * Accumulate series: keep every known id (esp. those with quote history), upsert fields,
 * set status from whether the id is in today's quoted set.
 */
export function accumulateSeries(
  previous: SeriesRecord[],
  incoming: SeriesRecord[],
  quotedIds: Set<string>,
  quoteIdsWithHistory: Set<string>,
  asOf: string | null
): SeriesRecord[] {
  const byId = new Map<string, SeriesRecord>()
  for (const s of previous) {
    assertSeriesId(s.id)
    byId.set(s.id, { ...s })
  }
  for (const s of incoming) {
    assertSeriesId(s.id)
    const prev = byId.get(s.id)
    byId.set(s.id, prev ? { ...prev, ...s } : { ...s })
  }
  for (const id of quoteIdsWithHistory) {
    if (!byId.has(id)) {
      byId.set(id, {
        id,
        isin: null,
        name: id,
        issue: null,
        mat: null,
        ccy: null,
        status: 'delisted'
      })
    }
  }
  for (const [id, rec] of byId) {
    rec.status = resolveStatus(rec, quotedIds.has(id), asOf)
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id))
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

/** Required families always published; optional only when they have series or quote history. */
export function publishedFamilies(tree: MarketTreeState): FamilyCode[] {
  const out: FamilyCode[] = []
  for (const family of FAMILIES) {
    const fam = tree.families[family]
    const required = (REQUIRED_FAMILIES as readonly string[]).includes(family)
    const hasContent =
      fam.series.series.length > 0 ||
      Object.keys(fam.quotes).length > 0 ||
      Object.keys(fam.latest.quotes).length > 0
    if (required || hasContent) out.push(family)
  }
  return out
}

function buildManifest(tree: MarketTreeState, asOf: string | null, generatedAt: string): ManifestFile {
  const digests: Record<string, string> = {}
  const paths = {} as ManifestFile['paths']
  const families = publishedFamilies(tree)
  for (const family of families) {
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
  const refs: ManifestFile['refs'] = {}
  if (tree.retailInterest) {
    refs.retailInterest = RETAIL_INTEREST_REF_PATH
    digests[RETAIL_INTEREST_REF_PATH] = digestCanonical(tree.retailInterest)
  }
  const manifest: ManifestFile = {
    schemaVersion: SCHEMA_VERSION,
    asOf,
    generatedAt,
    families,
    paths,
    digests
  }
  if (Object.keys(refs).length > 0) {
    manifest.refs = refs
  }
  return manifest
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
 * Same (id, settleDate) + identical values → skip; same date + different values → fail
 * unless `allowSameDayRewrite` (dual-source combined snapshot / ÁKK-only → treasury cutover).
 * series.json accumulates; statuses mark active / matured / delisted.
 */
export function mergeSnapshot(
  previous: MarketTreeState,
  snapshot: NormalizedSnapshot,
  options?: {
    generatedAt?: string
    allowSameDayRewrite?: boolean
    /** When provided (including empty rows), replace retail-interest refs. When omitted, keep previous. */
    retailInterest?: RetailInterestFile | null
  }
): MergeResult {
  const tree: MarketTreeState = {
    manifest: previous.manifest,
    families: {} as Record<FamilyCode, FamilyTreeState>,
    retailInterest: previous.retailInterest
      ? {
          schemaVersion: previous.retailInterest.schemaVersion,
          asOf: previous.retailInterest.asOf,
          generatedAt: previous.retailInterest.generatedAt,
          rows: previous.retailInterest.rows.map((r) => ({ ...r }))
        }
      : null
  }
  for (const family of FAMILIES) {
    tree.families[family] = cloneFamily(previous.families[family])
  }

  let appendedRows = 0
  let skippedDuplicates = 0
  let rewrittenRows = 0
  const allowSameDayRewrite = options?.allowSameDayRewrite === true
  const asOf = snapshot.asOf

  for (const family of FAMILIES) {
    const fam = tree.families[family]
    const incoming = snapshot.byFamily[family] ?? { series: [], quotes: [] }
    const quotedIds = new Set(incoming.quotes.map((q) => q.id))

    for (const q of incoming.quotes) {
      assertSeriesId(q.id)
      let file = fam.quotes[q.id]
      if (!file) {
        file = emptyQuotes(family, q.id)
        fam.quotes[q.id] = file
      }
      const existingIdx = file.rows.findIndex((r) => r[0] === q.row[0])
      if (existingIdx >= 0) {
        const existing = file.rows[existingIdx]
        if (quoteRowsEqual(existing, q.row)) {
          skippedDuplicates += 1
          continue
        }
        if (allowSameDayRewrite) {
          file.rows[existingIdx] = [...q.row] as QuoteRow
          rewrittenRows += 1
          continue
        }
        throw new MergeError(
          `Same-day quote conflict for ${family}/${q.id} on ${q.row[0]}: kept ${JSON.stringify(existing)}, got ${JSON.stringify(q.row)}`
        )
      }
      file.rows.push([...q.row] as QuoteRow)
      file.rows.sort((a, b) => a[0].localeCompare(b[0]))
      appendedRows += 1
    }

    fam.series = {
      schemaVersion: SCHEMA_VERSION,
      family,
      series: accumulateSeries(
        fam.series.series,
        incoming.series,
        quotedIds,
        new Set(Object.keys(fam.quotes)),
        asOf
      )
    }

    fam.latest = rebuildLatest(fam.quotes)
  }

  if (options && 'retailInterest' in options) {
    tree.retailInterest = options.retailInterest
      ? {
          schemaVersion: options.retailInterest.schemaVersion,
          asOf: options.retailInterest.asOf,
          generatedAt: options.retailInterest.generatedAt,
          rows: options.retailInterest.rows.map((r) => ({ ...r }))
        }
      : null
  }

  const generatedAt = options?.generatedAt ?? new Date().toISOString()
  const manifest = buildManifest(tree, asOf, generatedAt)
  const changed = !digestsEqual(previous.manifest, manifest)
  tree.manifest = manifest

  return { tree, changed, asOf, appendedRows, skippedDuplicates, rewrittenRows }
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
