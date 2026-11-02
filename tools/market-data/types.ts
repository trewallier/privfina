/** schemaVersion 2 published market-data shapes (ADR 0038). */

export const SCHEMA_VERSION = 2 as const

/** Basename under `data/market/` for the published tree. */
export const MARKET_PATH_SEGMENT = 'v2' as const

export type FamilyCode =
  | 'dkj'
  | 'pmap'
  | 'bmap'
  | 'fixmap'
  | 'ktv'
  | 'mapp'
  | 'baba'
  | 'emap'
  | 'omap'
  | 'ktj'
  | 'map2'

/** All published family folders (required + optional). */
export const FAMILIES: readonly FamilyCode[] = [
  'dkj',
  'pmap',
  'bmap',
  'fixmap',
  'ktv',
  'mapp',
  'baba',
  'emap',
  'omap',
  'ktj',
  'map2'
] as const

/** Must have ≥1 quote after ÁKK + allampapir combine. */
export const REQUIRED_FAMILIES: readonly FamilyCode[] = ['dkj', 'pmap', 'bmap'] as const

export const QUOTE_COLS = ['d', 'bid', 'ask', 'by', 'ay', 'ai'] as const
export type QuoteCol = (typeof QUOTE_COLS)[number]
export type QuoteRow = [string, number | null, number | null, number | null, number | null, number | null]

export const COUPON_COLS = ['from', 'to', 'rate'] as const
export type CouponCol = (typeof COUPON_COLS)[number]
/** Period window + rate; `to` and `rate` nullable (future / unknown). */
export type CouponRow = [string, string | null, number | null]

export type DayCountConvention = 'ACT/360' | 'ACT/365F' | '30E/360'

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
  /** Day-count convention (family-defaulted when omitted by source). */
  dayCount?: DayCountConvention | null
  /** Currently offered for subscription when retailInterest join succeeds. */
  offered?: boolean | null
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

export interface CouponsFile {
  schemaVersion: typeof SCHEMA_VERSION
  id: string
  family: FamilyCode
  cols: typeof COUPON_COLS
  rows: CouponRow[]
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

/** Path hints for additive refs files (ADR 0037 inflation; deferred DKJ-base). */
export interface ManifestRefsPaths {
  /**
   * @deprecated Schema v2 does not publish flat retail-interest; optional only for
   * reading transitional trees. Validate must not require this path.
   */
  retailInterest?: string
  inflation?: string
}

export interface ManifestFile {
  schemaVersion: typeof SCHEMA_VERSION
  asOf: string | null
  generatedAt: string
  /** Required families plus optional families that have content. */
  families: FamilyCode[]
  paths: Partial<Record<FamilyCode, ManifestFamilyPaths>>
  /** Optional refs paths (inflation). */
  refs?: ManifestRefsPaths
  digests: Record<string, string>
}

/**
 * One Lakossági kamatok period declaration (ADR 0036) — INTERNAL ingest intermediate.
 * Published tree writes `families/{fam}/coupons/<id>.json` + series.offered instead
 * (ADR 0038); do not write `refs/retail-interest.json`.
 */
export interface RetailInterestRow {
  /** Canonical id from short series name (`toSeriesId`). */
  id: string
  /** Mapped family, or null when type/place is outside published families. */
  family: FamilyCode | null
  /** Short series label from kamatok (`2029/Q2`, `KTJ_I`, …). */
  series: string
  /** Source product type label (`FixMÁP`, `PMÁP`, …). */
  type: string
  /**
   * Period kamat band(s) % (combined coupon for PMÁP/BMÁP — not interest premium).
   * Stepped display strings expand to multiple entries (never first-band-only).
   */
  rates: Array<number | null>
  /** EHM % when published. */
  ehm: number | null
  /** Validity start ISO date. */
  from: string
  /** Validity end ISO date, or null when open-ended. */
  to: string | null
  /** Currently offered for subscription (`underIssue`). */
  offered: boolean
  /** Maturity ISO date when known. */
  mat?: string | null
}

export interface RetailInterestFile {
  schemaVersion: typeof SCHEMA_VERSION
  asOf: string | null
  generatedAt: string
  rows: RetailInterestRow[]
}

/** CPI series keys published from KSH STADAT ara0040 (ADR 0037). */
export type InflationSeriesKey = 'yoy' | 'mom' | 'ytdFromDec' | 'ytdYoy'

/** One monthly CPI observation: [YYYY-MM, pct_change]. */
export type InflationMonthRow = [string, number]

/** One calendar-year average: [YYYY, pct_change]. */
export type InflationYearRow = [string, number]

export interface InflationSeriesBlock {
  /** Verbatim KSH section base label. */
  kshBase: string
  cols: ['ym', 'pct']
  rows: InflationMonthRow[]
}

export interface InflationAnnualAverage {
  derivedFrom: 'ytdYoy:januar-december'
  cols: ['year', 'pct']
  rows: InflationYearRow[]
}

export interface InflationSourceMeta {
  id: 'ksh-stadat-ara0040'
  table: '1.2.1.2'
  pageUrl: string
  csvUrl: string
}

/**
 * Published KSH CPI total (Összesen) refs (ADR 0037).
 * Values are percent change (KSH index − 100).
 */
export interface InflationFile {
  schemaVersion: typeof SCHEMA_VERSION
  source: InflationSourceMeta
  asOf: string | null
  generatedAt: string
  metric: 'cpi_total'
  unit: 'pct_change'
  series: Record<InflationSeriesKey, InflationSeriesBlock>
  annualAverage: InflationAnnualAverage
}

/** Published path for inflation refs (ADR 0037). */
export const INFLATION_REF_PATH = 'refs/inflation.json' as const

export const KSH_ARA0040_PAGE_URL =
  'https://www.ksh.hu/stadat_files/ara/hu/ara0040.html' as const
export const KSH_ARA0040_CSV_URL =
  'https://www.ksh.hu/stadat_files/ara/hu/ara0040.csv' as const

/** Loose ÁKK row (catalog or network rates). */
export type AkkRow = Record<string, unknown>

export interface AkkEnvelope {
  meta?: { function?: string; status?: string; message?: string | null; queryString?: string }
  fields?: Array<{ name: string; type?: string }>
  data?: AkkRow[]
}

/** Loose allampapir.hu JSON envelopes. */
export type AllampapirRow = Record<string, unknown>

export interface AllampapirEnvelope {
  message?: string
  status?: boolean
  code?: number
  data?: Record<string, unknown> | null
}

export interface AllampapirPaperMeta {
  name?: string
  fields?: string[]
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

export function emptyNormalizedByFamily(): NormalizedSnapshot['byFamily'] {
  const byFamily = {} as NormalizedSnapshot['byFamily']
  for (const family of FAMILIES) {
    byFamily[family] = { series: [], quotes: [] }
  }
  return byFamily
}

/**
 * Default day-count for published families (retail HUF bonds → ACT/360).
 * Callers may override when a series carries an explicit convention.
 */
export function defaultDayCountForFamily(_family: FamilyCode): DayCountConvention {
  return 'ACT/360'
}
