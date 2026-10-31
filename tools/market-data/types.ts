/** schemaVersion 1 published market-data shapes (ADR 0034). */

export const SCHEMA_VERSION = 1 as const

export type FamilyCode = 'dkj' | 'pmap' | 'bmap'

export const FAMILIES: readonly FamilyCode[] = ['dkj', 'pmap', 'bmap'] as const

export const QUOTE_COLS = ['d', 'bid', 'ask', 'by', 'ay', 'ai'] as const
export type QuoteCol = (typeof QUOTE_COLS)[number]
export type QuoteRow = [string, number | null, number | null, number | null, number | null, number | null]

/** active = currently quoted; matured = past maturity; delisted = not quoted, not matured. */
export type SeriesStatus = 'active' | 'matured' | 'delisted'

export interface SeriesRecord {
  /** Canonical slug: map key, quotes/<id>.json basename, QuotesFile.id. */
  id: string
  isin: string | null
  /** Display / source label (may contain accents or spaces). */
  name: string
  issue: string | null
  mat: string | null
  ccy: string | null
  face?: number | null
  iType?: string | null
  status: SeriesStatus
  /** Interest premium % when known (PMÁP / BMÁP). */
  prem?: number | null
  /** Reference curve label when known. */
  ref?: string | null
}

export interface SeriesFile {
  schemaVersion: typeof SCHEMA_VERSION
  family: FamilyCode
  series: SeriesRecord[]
}

export interface QuotesFile {
  schemaVersion: typeof SCHEMA_VERSION
  id: string
  family: FamilyCode
  cols: typeof QUOTE_COLS
  rows: QuoteRow[]
}

export interface LatestQuote {
  d: string
  bid: number | null
  ask: number | null
  by: number | null
  ay: number | null
  ai: number | null
}

export interface LatestFile {
  schemaVersion: typeof SCHEMA_VERSION
  asOf: string | null
  quotes: Record<string, LatestQuote>
}

export interface ManifestFamilyPaths {
  series: string
  latest: string
}

export interface ManifestFile {
  schemaVersion: typeof SCHEMA_VERSION
  asOf: string | null
  generatedAt: string
  families: FamilyCode[]
  paths: Record<FamilyCode, ManifestFamilyPaths>
  digests: Record<string, string>
}

/** Loose ÁKK row (catalog or network rates). */
export type AkkRow = Record<string, unknown>

export interface AkkEnvelope {
  meta?: { function?: string; status?: string; message?: string | null; queryString?: string }
  fields?: Array<{ name: string; type?: string }>
  data?: AkkRow[]
}

export interface NormalizedSnapshot {
  asOf: string | null
  byFamily: Record<
    FamilyCode,
    {
      series: SeriesRecord[]
      quotes: Array<{ id: string; row: QuoteRow }>
    }
  >
}
