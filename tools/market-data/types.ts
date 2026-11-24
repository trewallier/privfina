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

/**
 * active = live-quoted on snapshot asOf (settle date === asOf);
 * matured = mat < asOf (strict; maturity-day quotes may still be active);
 * delisted = not live-quoted and not matured.
 */
export type SeriesStatus = 'active' | 'matured' | 'delisted'

/**
 * Who seeded the series identity row (ADR 0048) — published source **host**
 * strings (same as other tip `source.host` fields), not internal tags.
 * Omit / undefined on legacy tip rows → treat as ÁKK-owned (`www.akk.hu`).
 * Do not write `null` (validate rejects it).
 */
export const SERIES_IDENTITY_SOURCE_AKK = 'www.akk.hu' as const
export const SERIES_IDENTITY_SOURCE_WEBKINCSTAR =
  'webkincstar.allamkincstar.gov.hu' as const
export type SeriesIdentitySource =
  | typeof SERIES_IDENTITY_SOURCE_AKK
  | typeof SERIES_IDENTITY_SOURCE_WEBKINCSTAR

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
  /**
   * Retail sale window from nyilvános ajánlattétel listing (ADR 0041 / ROADMAP §6k).
   * Prefer over `offered` for picker labels (SPA §6l).
   */
  saleWindow?: SaleWindow | null
  /** Reference curve label when known. */
  ref?: string | null
  /**
   * Coupon / reset period length in months when ÁKK publishes `interestPeriod`
   * (e.g. `3M` → 3). Used by FLOAT MÁK resolve (ADR 0047); not a coupon rate.
   */
  periodMonths?: number | null
  /**
   * Identity provenance host (ADR 0048).
   * `webkincstar.allamkincstar.gov.hu` = thin stub from historical WK overlay;
   * ÁKK catalog upsert promotes to `www.akk.hu`.
   */
  identitySource?: SeriesIdentitySource
}

/** Inclusive retail sale window; `to` null while open. */
export interface SaleWindow {
  from: string
  to: string | null
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

/** Path hints for additive refs files (ADR 0037 inflation; ADR 0045 BUBOR; ADR 0046 settlement calendar; ADR 0039 price calendar; ADR 0041 offering archive; deferred DKJ-base). */
export interface ManifestRefsPaths {
  /**
   * @deprecated Schema v2 does not publish flat retail-interest; optional only for
   * reading transitional trees. Validate must not require this path.
   */
  retailInterest?: string
  inflation?: string
  /** MNB BUBOR fixings (ADR 0045). */
  bubor?: string
  /** MNB HU-VIBER settlement calendar exceptions (ADR 0046). */
  settlementCalendar?: string
  /** WebKincstár priced / no_price / fetch_failed calendar (ADR 0039). */
  priceCalendar?: string
  /** ÁKK public-offering document ledger (ADR 0041). */
  offeringArchive?: string
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

/**
 * Canonical BUBOR tenor keys published from MNB bubor2.xls (ADR 0045).
 * Sparse history: early years omit many keys; later intermediate months may be `-`.
 */
export const BUBOR_TENORS = [
  'ON',
  '1W',
  '2W',
  '1M',
  '2M',
  '3M',
  '4M',
  '5M',
  '6M',
  '7M',
  '8M',
  '9M',
  '10M',
  '11M',
  '12M'
] as const

export type BuborTenor = (typeof BUBOR_TENORS)[number]

/** One daily BUBOR fixing: [YYYY-MM-DD, pct]. */
export type BuborDayRow = [string, number]

export interface BuborSeriesBlock {
  cols: ['date', 'pct']
  rows: BuborDayRow[]
}

export interface BuborSourceMeta {
  id: 'mnb-bubor2-xls'
  pageUrl: string
  xlsUrl: string
}

/**
 * Published MNB BUBOR fixings (ADR 0045).
 * Values are fixing percent; missing/`'-'` cells are omitted (never invent zeros).
 */
export interface BuborFile {
  schemaVersion: typeof SCHEMA_VERSION
  source: BuborSourceMeta
  asOf: string | null
  generatedAt: string
  metric: 'bubor'
  unit: 'pct'
  /** Canonical tenor order; every key is always present (rows may be empty). */
  tenors: typeof BUBOR_TENORS
  series: Record<BuborTenor, BuborSeriesBlock>
}

/** Published path for BUBOR refs (ADR 0045). */
export const BUBOR_REF_PATH = 'refs/bubor.json' as const

/** Published path for MNB settlement calendar refs (ADR 0046). */
export const SETTLEMENT_CALENDAR_REF_PATH = 'refs/settlement-calendar.json' as const

export interface SettlementCalendarFileMeta {
  year: number
  fileName: string
  url: string
  contentDigest: string
}

export interface SettlementCalendarSourceMeta {
  id: 'mnb-elszamolasforgalmi-naptar'
  host: 'mnb.hu'
  hubUrl: string
  disclaimer: string
  files: SettlementCalendarFileMeta[]
}

/**
 * One calendar year of Mon–Fri exceptions from an MNB XLSX grid (ADR 0046).
 * `closed` = weekday settlement holidays (`M`); `open` = weekend settlement days (`E`).
 */
export interface SettlementCalendarYearBlock {
  year: number
  sourceFile: string
  sourceDigest: string
  closed: string[]
  open: string[]
}

/**
 * Published MNB HU-VIBER settlement calendar (ADR 0046).
 * Engine rolling uses `closed` + `open` relative to a Mon–Fri default.
 */
export interface SettlementCalendarFile {
  schemaVersion: typeof SCHEMA_VERSION
  calendarId: 'HU-VIBER'
  timezone: 'Europe/Budapest'
  generatedAt: string
  source: SettlementCalendarSourceMeta
  years: SettlementCalendarYearBlock[]
}

export const MNB_SETTLEMENT_CALENDAR_DISCLAIMER =
  'Informational republish of the MNB elszámolásforgalmi nyitvatartási naptár (VIBER/BKR settlement days); may lag mid-year revisions; not a labor-law calendar and not investment advice.' as const

/** Published path for WebKincstár price calendar (ADR 0039). */
export const PRICE_CALENDAR_REF_PATH = 'refs/price-calendar.json' as const

export type PriceCalendarDayStatus = 'priced' | 'no_price' | 'fetch_failed'

export interface PriceCalendarDayRow {
  datum: string
  report: string
  status: PriceCalendarDayStatus
  rowCount: number
}

export interface PriceCalendarSourceMeta {
  id: 'webkincstar-report-service'
  host: 'webkincstar.allamkincstar.gov.hu'
  disclaimer: string
}

/**
 * Published WebKincstár report×datum calendar (ADR 0039).
 * Distinguishes priced days, no-price days (weekends/holidays), and fetch failures.
 */
export interface PriceCalendarFile {
  schemaVersion: typeof SCHEMA_VERSION
  generatedAt: string
  source: PriceCalendarSourceMeta
  reports: string[]
  days: PriceCalendarDayRow[]
}

export const WEBKINCSTAR_PRICE_CALENDAR_DISCLAIMER =
  'Informational republish of Magyar Államkincstár (WebKincstár) daily price tables; may lag or differ from the live treasury table; not investment advice.' as const

/** Published path for ÁKK offering document archive (ADR 0041). */
export const OFFERING_ARCHIVE_REF_PATH = 'refs/offering-archive.json' as const

/**
 * Day-count on offering transcriptions may include ACT/ACT (Babakötvény / MÁP Plusz)
 * beyond the market-data SeriesRecord DayCountConvention union.
 */
export type OfferingDayCount = DayCountConvention | 'ACT/ACT'

export type OfferingDocumentStatus =
  | 'listed'
  | 'downloaded'
  | 'transcribed'
  | 'parse_failed'
  | 'skipped_no_schedule'
  /** Sticky hash kept; series already has a transcribed ISSUE — never reparse. */
  | 'skipped_already_transcribed'
  | 'pending_download'
  | 'download_failed'

export interface OfferingSourceMeta {
  id: string
  host: string
  document: string
  disclaimer: string
}

/**
 * Per-series public-offering transcription (ADR 0041 → ROADMAP §6l SPA).
 * `paymentDates` / `dayCount` optional until PDF parse succeeds.
 * `maturity` / `issue` optional (ADR 0048 null-fill for WK-origin series).
 */
export interface OfferingFile {
  schemaVersion: typeof SCHEMA_VERSION
  id: string
  saleWindow?: SaleWindow | null
  paymentDates?: string[]
  dayCount?: OfferingDayCount | string | null
  /** Maturity date from ISSUE PDF when parsed (YYYY-MM-DD). */
  maturity?: string | null
  /** Issue / first-settlement date from ISSUE PDF when parsed (YYYY-MM-DD). */
  issue?: string | null
  source: OfferingSourceMeta
}

export interface OfferingArchiveDocument {
  /** ÁKK pathId when present. */
  pathId: string | null
  /** PDF UUID from `public_offerings/<uuid>.pdf` (dedupe key). */
  pathUuid: string
  family: FamilyCode
  seriesId: string
  isin: string | null
  published: string | null
  modifiedOn: string | null
  resourceType: string | null
  /** Content hash once downloaded; null while listed / pending. */
  sha256: string | null
  bytes: number | null
  status: OfferingDocumentStatus
  sourceHost: string
}

export interface OfferingArchiveSourceMeta {
  id: 'akk-public-offerings'
  host: 'www.akk.hu'
  disclaimer: string
}

/**
 * Per-family historical listing discovery cursor (ADR 0041 §6m).
 * Drives the next `ptsEnd` / `auctionEnd` backfill page; independent of the
 * tip success frontier used for the WebKincstár historical gate.
 */
export interface OfferingListingDiscoveryState {
  /** Next inclusive ptsEnd / auctionEnd to query (YYYY-MM-DD). */
  endBound: string
  /** True when empty page, floor hit, or no further progress — skip further GETs. */
  exhausted: boolean
}

/**
 * Tip ledger of known offering PDFs (ADR 0041). Compare every listing run against this.
 */
export interface OfferingArchiveFile {
  schemaVersion: typeof SCHEMA_VERSION
  generatedAt: string
  source: OfferingArchiveSourceMeta
  documents: OfferingArchiveDocument[]
  /**
   * Per-family listing discovery cursors (optional for older tip archives).
   * Advances past each queried backfill page so finished timeframes are not re-hit.
   */
  listingDiscovery?: Partial<Record<FamilyCode, OfferingListingDiscoveryState>>
}

export const OFFERING_TRANSCRIPTION_DISCLAIMER =
  'Informational transcription of a public offering document; may be incomplete or outdated vs the authoritative PDF; not a substitute for the official nyilvános ajánlattétel; not investment advice.' as const

export const KSH_ARA0040_PAGE_URL =
  'https://www.ksh.hu/stadat_files/ara/hu/ara0040.html' as const
export const KSH_ARA0040_CSV_URL =
  'https://www.ksh.hu/stadat_files/ara/hu/ara0040.csv' as const

export const MNB_BUBOR_PAGE_URL =
  'https://www.mnb.hu/monetaris-politika/penzpiaci-informaciok/referenciamutato-jegyzesi-bizottsag/bubor' as const
export const MNB_BUBOR_XLS_URL = 'https://www.mnb.hu/letoltes/bubor2.xls' as const

export const MNB_SETTLEMENT_CALENDAR_HUB_URL =
  'https://www.mnb.hu/penzforgalom/a-hazai-penzforgalmi-infrastruktura/elszamolasforgalmi-rendszerek-nyitvatartasi-naptara' as const
export const MNB_LETOLTES_BASE_URL = 'https://www.mnb.hu/letoltes' as const

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
